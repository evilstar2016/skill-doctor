import { describe, expect, it, vi } from 'vitest';
import { analyzeConflict } from '../../../src/conflicts/semantic/analyzeConflict';
import type { SkillRecord } from '../../../src/types/skill';

const makeSkill = (name: string): SkillRecord => ({
  name,
  sourcePath: `/skills/${name}.md`,
  platform: 'claude',
  scope: 'global',
  description: `${name} description`,
  triggers: [`use ${name}`],
});

const validAnalysis = {
  summary: 'They overlap significantly',
  overlapAreas: ['area-1'],
  boundaries: ['boundary-1'],
  strengthsA: ['strength-a'],
  strengthsB: ['strength-b'],
  verdict: 'conflicting',
};

describe('analyzeConflict', () => {
  it('parses valid analysis response', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: JSON.stringify(validAnalysis) } }],
      }),
    });
    vi.stubGlobal('fetch', mockFetch);

    const result = await analyzeConflict(makeSkill('a'), makeSkill('b'), {
      baseUrl: 'http://localhost:11434/v1',
      modelId: 'llama3.2',
    });

    expect(result.summary).toBe('They overlap significantly');
    expect(result.verdict).toBe('conflicting');
    expect(result.overlapAreas).toEqual(['area-1']);

    vi.unstubAllGlobals();
  });

  it('extracts JSON from response with surrounding text', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [
          {
            message: {
              content: `Here is my analysis:\n${JSON.stringify(validAnalysis)}\nDone.`,
            },
          },
        ],
      }),
    });
    vi.stubGlobal('fetch', mockFetch);

    const result = await analyzeConflict(makeSkill('a'), makeSkill('b'), {
      baseUrl: 'http://localhost:11434/v1',
      modelId: 'llama3.2',
    });

    expect(result.summary).toBe('They overlap significantly');

    vi.unstubAllGlobals();
  });

  it('throws on HTTP error', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      text: async () => 'Internal Server Error',
    });
    vi.stubGlobal('fetch', mockFetch);

    await expect(
      analyzeConflict(makeSkill('a'), makeSkill('b'), {
        baseUrl: 'http://localhost:11434/v1',
        modelId: 'llama3.2',
      }),
    ).rejects.toThrow('Analysis API error 500');

    vi.unstubAllGlobals();
  });

  it('sends Authorization header when apiKey is provided', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: JSON.stringify(validAnalysis) } }],
      }),
    });
    vi.stubGlobal('fetch', mockFetch);

    await analyzeConflict(makeSkill('a'), makeSkill('b'), {
      baseUrl: 'http://localhost:11434/v1',
      modelId: 'llama3.2',
      apiKey: 'test-key',
    });

    const [, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect((init.headers as Record<string, string>)['Authorization']).toBe('Bearer test-key');

    vi.unstubAllGlobals();
  });
});
