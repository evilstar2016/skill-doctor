import { afterEach, describe, expect, it, vi } from 'vitest';

import { llmGroupLabel, llmWhenToUse } from '../../src/explain/llmExplain';
import type { LlmExplainOptions } from '../../src/types/explain';
import type { SkillRecord } from '../../src/types/skill';

function makeSkill(name: string): SkillRecord {
  return {
    name,
    sourcePath: `/skills/${name}/SKILL.md`,
    platform: 'claude',
    scope: 'project',
    description: 'Generate weekly digests for open-source projects.',
    triggers: ['weekly digest', 'recent updates'],
  };
}

const llmOptions: LlmExplainOptions = {
  baseUrl: 'https://example.invalid/v1',
  modelId: 'test-model',
};

describe('llmExplain warnings', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    vi.resetModules();
  });

  it('warns once when the LLM responds with a non-OK status', async () => {
    const fakeFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 429,
      text: async () => '{"error":{"message":"rate limit"}}',
    });
    vi.stubGlobal('fetch', fakeFetch);
    const stderrSpy = vi.spyOn(process.stderr, 'write').mockReturnValue(true);
    const skill = makeSkill('oss-weekly-digest');

    const first = await llmWhenToUse(skill, llmOptions);
    const second = await llmWhenToUse(skill, llmOptions);

    expect(first).toBeNull();
    expect(second).toBeNull();
    expect(stderrSpy).toHaveBeenCalledTimes(1);
    expect(String(stderrSpy.mock.calls[0]?.[0])).toContain('HTTP 429');
    expect(String(stderrSpy.mock.calls[0]?.[0])).toContain('falling back to non-LLM output');
  });

  it('warns when the response payload is missing message content', async () => {
    const fakeFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ choices: [{ message: {} }] }),
    });
    vi.stubGlobal('fetch', fakeFetch);
    const stderrSpy = vi.spyOn(process.stderr, 'write').mockReturnValue(true);
    const skills = [makeSkill('to-issues'), makeSkill('to-prd')];

    const label = await llmGroupLabel(skills, 'token label', llmOptions);

    expect(label).toBe('token label');
    expect(stderrSpy).toHaveBeenCalledTimes(1);
    expect(String(stderrSpy.mock.calls[0]?.[0])).toContain('response did not include choices[0].message.content');
  });

  it('warns when the model returns non-JSON content', async () => {
    const fakeFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ choices: [{ message: { content: 'not-json' } }] }),
    });
    vi.stubGlobal('fetch', fakeFetch);
    const stderrSpy = vi.spyOn(process.stderr, 'write').mockReturnValue(true);
    const skill = makeSkill('oss-weekly-digest');

    const result = await llmWhenToUse(skill, llmOptions);

    expect(result).toBeNull();
    expect(stderrSpy).toHaveBeenCalledTimes(1);
    expect(String(stderrSpy.mock.calls[0]?.[0])).toContain('response was not valid JSON');
  });
});