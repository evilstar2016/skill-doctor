import { describe, expect, it, vi } from 'vitest';

import { groupSkills } from '../../src/explain/groupSkills';
import type { LlmExplainOptions } from '../../src/types/explain';
import type { SkillRecord } from '../../src/types/skill';

function makeSkill(name: string, description: string, triggers: string[] = []): SkillRecord {
  return { name, sourcePath: `/skills/${name}/SKILL.md`, platform: 'claude', scope: 'project', description, triggers };
}

describe('groupSkills', () => {
  it('returns empty groups and ungrouped for empty input', async () => {
    const result = await groupSkills([]);
    expect(result.groups).toHaveLength(0);
    expect(result.ungrouped).toHaveLength(0);
  });

  it('places a single skill in ungrouped', async () => {
    const skill = makeSkill('git-workflow', 'Manage git branches.', ['create branch']);
    const result = await groupSkills([skill]);
    expect(result.groups).toHaveLength(0);
    expect(result.ungrouped).toHaveLength(1);
    expect(result.ungrouped[0].name).toBe('git-workflow');
  });

  it('groups similar skills together', async () => {
    const a = makeSkill('git-workflow', 'Manage git branches and pull requests.', ['create branch', 'open pull request']);
    const b = makeSkill('github-automation', 'Automate git branches and pull requests.', ['create branch', 'open pull request']);
    const result = await groupSkills([a, b]);
    expect(result.groups.length).toBeGreaterThanOrEqual(1);
    const groupNames = result.groups.flatMap((g) => g.skills.map((s) => s.name));
    expect(groupNames).toContain('git-workflow');
    expect(groupNames).toContain('github-automation');
  });

  it('leaves unrelated skills in ungrouped', async () => {
    const git = makeSkill('git-workflow', 'Manage git branches and pull requests.', ['create branch']);
    const cooking = makeSkill('cooking-tips', 'How to cook pasta and make sauces.', ['boil water']);
    const result = await groupSkills([git, cooking]);
    const ungroupedNames = result.ungrouped.map((s) => s.name);
    expect(ungroupedNames).toContain('cooking-tips');
  });

  it('produces a non-empty label for each group', async () => {
    const a = makeSkill('git-a', 'Manage git branches and pull requests.', ['create branch']);
    const b = makeSkill('git-b', 'Automate git branches and pull requests.', ['create branch']);
    const result = await groupSkills([a, b]);
    for (const group of result.groups) {
      expect(group.label.length).toBeGreaterThan(0);
    }
  });

  it('sorts groups by descending size', async () => {
    const a = makeSkill('git-a', 'Manage git branches and pull requests.', ['create branch', 'open pull request']);
    const b = makeSkill('git-b', 'Automate git branches and pull requests.', ['create branch', 'open pull request']);
    const c = makeSkill('git-c', 'Handle git branches and pull requests workflow.', ['create branch', 'open pull request']);
    const result = await groupSkills([a, b, c]);
    for (let i = 0; i < result.groups.length - 1; i++) {
      expect(result.groups[i].skills.length).toBeGreaterThanOrEqual(result.groups[i + 1].skills.length);
    }
  });

  it('uses cached label when present, skipping LLM', async () => {
    const a = makeSkill('git-workflow', 'Manage git branches and pull requests.', ['create branch', 'open pull request']);
    const b = makeSkill('github-automation', 'Automate git branches and pull requests.', ['create branch', 'open pull request']);
    const fakeFetch = vi.fn(); // should NOT be called
    vi.stubGlobal('fetch', fakeFetch);

    const { clusterKey } = await import('../../src/explain/groupLabelCache');
    const labelCache = new Map([[clusterKey([a, b]), 'Cached Label']]);
    const llmOptions: LlmExplainOptions = { baseUrl: 'http://localhost/v1', modelId: 'llama3' };

    const result = await groupSkills([a, b], { llmOptions, labelCache });
    expect(result.groups[0].label).toBe('Cached Label');
    expect(fakeFetch).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it('calls LLM and writes to cache for new clusters', async () => {
    const a = makeSkill('git-workflow', 'Manage git branches and pull requests.', ['create branch', 'open pull request']);
    const b = makeSkill('github-automation', 'Automate git branches and pull requests.', ['create branch', 'open pull request']);
    const fakeFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ choices: [{ message: { content: 'Version Control' } }] }),
    });
    vi.stubGlobal('fetch', fakeFetch);

    const { clusterKey } = await import('../../src/explain/groupLabelCache');
    const labelCache = new Map<string, string>();
    const llmOptions: LlmExplainOptions = { baseUrl: 'http://localhost/v1', modelId: 'llama3' };

    const result = await groupSkills([a, b], { llmOptions, labelCache });
    expect(result.groups[0].label).toBe('Version Control');
    expect(labelCache.get(clusterKey([a, b]))).toBe('Version Control');
    vi.unstubAllGlobals();
  });

  it('uses LLM label when options provided and call succeeds', async () => {
    const fakeFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ choices: [{ message: { content: 'Version Control' } }] }),
    });
    vi.stubGlobal('fetch', fakeFetch);

    const a = makeSkill('git-workflow', 'Manage git branches and pull requests.', ['create branch', 'open pull request']);
    const b = makeSkill('github-automation', 'Automate git branches and pull requests.', ['create branch', 'open pull request']);
    const llmOptions: LlmExplainOptions = { baseUrl: 'http://localhost:11434/v1', modelId: 'llama3' };
    const result = await groupSkills([a, b], { llmOptions });

    expect(result.groups[0].label).toBe('Version Control');
    vi.unstubAllGlobals();
  });

  it('falls back to token label when LLM call fails', async () => {
    const fakeFetch = vi.fn().mockResolvedValue({ ok: false });
    vi.stubGlobal('fetch', fakeFetch);

    const a = makeSkill('git-workflow', 'Manage git branches and pull requests.', ['create branch', 'open pull request']);
    const b = makeSkill('github-automation', 'Automate git branches and pull requests.', ['create branch', 'open pull request']);
    const llmOptions: LlmExplainOptions = { baseUrl: 'http://localhost:11434/v1', modelId: 'llama3' };
    const result = await groupSkills([a, b], { llmOptions });

    expect(result.groups[0].label.length).toBeGreaterThan(0);
    vi.unstubAllGlobals();
  });
});
