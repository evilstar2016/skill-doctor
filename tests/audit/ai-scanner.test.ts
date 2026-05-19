import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SkillRecord } from '../../src/types/skill';
import { runAiAudit } from '../../src/audit/ai-scanner';

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

beforeEach(() => { mockFetch.mockReset(); });

function makeSkill(name: string, description: string): SkillRecord {
  return {
    name,
    sourcePath: `/fake/${name}/SKILL.md`,
    platform: 'claude',
    scope: 'global',
    description,
    triggers: [],
  };
}

function makeLlmOptions() {
  return { baseUrl: 'http://mock-llm', modelId: 'test-model', apiKey: 'sk-test' };
}

function okResponse(findings: unknown[], level = 'warn') {
  return {
    ok: true,
    json: async () => ({
      choices: [{
        message: {
          content: JSON.stringify({ level, findings, summary: 'test summary' }),
        },
      }],
    }),
  };
}

describe('runAiAudit', () => {
  it('returns empty array for empty skills list without calling fetch', async () => {
    const result = await runAiAudit([], { llmOptions: makeLlmOptions(), useCache: false });
    expect(result).toHaveLength(0);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('parses valid AI response into AiFinding[]', async () => {
    mockFetch.mockResolvedValueOnce(okResponse([{
      code: 'shell-pipe-exec',
      severity: 'high',
      title: 'Dangerous shell pipe',
      detail: 'skill instructs running shell commands',
      evidence: 'run the command',
    }]));

    const result = await runAiAudit(
      [makeSkill('risky', 'run the command in terminal')],
      { llmOptions: makeLlmOptions(), useCache: false },
    );

    expect(result).toHaveLength(1);
    expect(result[0].source).toBe('ai');
    expect(result[0].code).toBe('shell-pipe-exec');
    expect(result[0].severity).toBe('high');
    expect(result[0].title).toBe('Dangerous shell pipe');
    expect(result[0].skillName).toBe('risky');
    expect(result[0].evidence).toBe('run the command');
  });

  it('maps PromptHub "warn" severity to "med"', async () => {
    mockFetch.mockResolvedValueOnce(okResponse([{
      code: 'unknown-source',
      severity: 'warn',
      title: 'No source URL',
      detail: 'provenance unknown',
    }]));

    const result = await runAiAudit(
      [makeSkill('mystery', 'does something')],
      { llmOptions: makeLlmOptions(), useCache: false },
    );

    expect(result[0].severity).toBe('med');
  });

  it('returns empty for non-ok HTTP response', async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 401 });

    const result = await runAiAudit(
      [makeSkill('skill', 'desc')],
      { llmOptions: makeLlmOptions(), useCache: false },
    );

    expect(result).toHaveLength(0);
  });

  it('returns empty when response content is not valid JSON', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ choices: [{ message: { content: 'not json' } }] }),
    });

    const result = await runAiAudit(
      [makeSkill('skill', 'desc')],
      { llmOptions: makeLlmOptions(), useCache: false },
    );

    expect(result).toHaveLength(0);
  });

  it('uses cache to skip re-scanning same content', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'sk-ai-test-'));
    mockFetch.mockResolvedValueOnce(okResponse([]));

    const skills = [makeSkill('cached-skill', 'hello world')];
    const opts = { llmOptions: makeLlmOptions(), useCache: true, homeDir: dir };

    await runAiAudit(skills, opts);
    expect(mockFetch).toHaveBeenCalledTimes(1);

    mockFetch.mockClear();
    await runAiAudit(skills, opts);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('bypasses cache when useCache is false', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'sk-ai-test-'));
    mockFetch.mockResolvedValue(okResponse([]));

    const skills = [makeSkill('no-cache-skill', 'hello')];
    const opts = { llmOptions: makeLlmOptions(), useCache: false, homeDir: dir };

    await runAiAudit(skills, opts);
    await runAiAudit(skills, opts);
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it('does not reuse cache entry when model changes', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'sk-ai-test-'));
    mockFetch.mockResolvedValue(okResponse([]));

    const skills = [makeSkill('model-change', 'hello')];
    await runAiAudit(skills, { llmOptions: { ...makeLlmOptions(), modelId: 'model-A' }, useCache: true, homeDir: dir });
    mockFetch.mockClear();
    await runAiAudit(skills, { llmOptions: { ...makeLlmOptions(), modelId: 'model-B' }, useCache: true, homeDir: dir });

    expect(mockFetch).toHaveBeenCalledTimes(1);
  });
});
