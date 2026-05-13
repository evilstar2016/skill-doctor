import { describe, expect, it, vi } from 'vitest';

import { buildExplanation } from '../../src/explain/buildExplanation';
import type { LlmExplainOptions } from '../../src/types/explain';
import type { SkillRecord } from '../../src/types/skill';

function makeSkill(name: string, description: string, triggers: string[] = []): SkillRecord {
  return { name, sourcePath: `/skills/${name}/SKILL.md`, platform: 'claude', scope: 'project', description, triggers };
}

const gitWorkflow = makeSkill(
  'git-workflow',
  'Manage git branches and pull requests.',
  ['create branch', 'open pull request'],
);

const githubAutomation = makeSkill(
  'github-automation',
  'Automate git workflow and pull requests.',
  ['create branch', 'open pull request'],
);

const unrelated = makeSkill('cooking-tips', 'How to cook pasta and make sauces.', ['boil water']);

describe('buildExplanation', () => {
  it('returns the original skill fields unchanged', async () => {
    const result = await buildExplanation(gitWorkflow, [gitWorkflow, githubAutomation, unrelated]);
    expect(result.name).toBe('git-workflow');
    expect(result.platform).toBe('claude');
    expect(result.scope).toBe('project');
    expect(result.description).toBe(gitWorkflow.description);
  });

  it('finds related skills above the similarity threshold', async () => {
    const result = await buildExplanation(gitWorkflow, [gitWorkflow, githubAutomation, unrelated]);
    const names = result.relatedSkills.map((r) => r.name);
    expect(names).toContain('github-automation');
    expect(names).not.toContain('cooking-tips');
  });

  it('excludes the skill itself from related results', async () => {
    const result = await buildExplanation(gitWorkflow, [gitWorkflow, githubAutomation]);
    const names = result.relatedSkills.map((r) => r.name);
    expect(names).not.toContain('git-workflow');
  });

  it('orders related skills by descending similarity', async () => {
    const closeMatch = makeSkill('git-helper', 'Manage git branches and pull requests with ease.', ['create branch']);
    const weakMatch = makeSkill('git-tips', 'Basic git branching tips.', []);
    const result = await buildExplanation(gitWorkflow, [gitWorkflow, closeMatch, weakMatch]);

    if (result.relatedSkills.length >= 2) {
      expect(result.relatedSkills[0].similarity).toBeGreaterThanOrEqual(result.relatedSkills[1].similarity);
    }
  });

  it('caps related skills at 3', async () => {
    const skills = Array.from({ length: 6 }, (_, i) =>
      makeSkill(`git-skill-${i}`, 'Manage git branches and pull requests with automation.', ['create branch']),
    );
    const result = await buildExplanation(skills[0], skills);
    expect(result.relatedSkills.length).toBeLessThanOrEqual(3);
  });

  it('returns empty relatedSkills when no skills are similar enough', async () => {
    const result = await buildExplanation(gitWorkflow, [gitWorkflow, unrelated]);
    expect(result.relatedSkills).toHaveLength(0);
  });

  it('includes sharedTokens in each related skill entry', async () => {
    const result = await buildExplanation(gitWorkflow, [gitWorkflow, githubAutomation]);
    expect(result.relatedSkills[0].sharedTokens.length).toBeGreaterThan(0);
  });

  it('sets whenToUse from LLM when options provided and call succeeds', async () => {
    const fakeFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: '{"whenToUse":"Use when managing git branches."}' } }],
      }),
    });
    vi.stubGlobal('fetch', fakeFetch);

    const llmOptions: LlmExplainOptions = { baseUrl: 'http://localhost:11434/v1', modelId: 'llama3' };
    const result = await buildExplanation(gitWorkflow, [gitWorkflow, githubAutomation], { llmOptions });
    expect(result.whenToUse).toBe('Use when managing git branches.');

    vi.unstubAllGlobals();
  });

  it('leaves whenToUse undefined when LLM call fails', async () => {
    const fakeFetch = vi.fn().mockResolvedValue({ ok: false });
    vi.stubGlobal('fetch', fakeFetch);

    const llmOptions: LlmExplainOptions = { baseUrl: 'http://localhost:11434/v1', modelId: 'llama3' };
    const result = await buildExplanation(gitWorkflow, [gitWorkflow, githubAutomation], { llmOptions });
    expect(result.whenToUse).toBeUndefined();

    vi.unstubAllGlobals();
  });

  it('leaves whenToUse undefined when no LLM options provided', async () => {
    const result = await buildExplanation(gitWorkflow, [gitWorkflow, githubAutomation]);
    expect(result.whenToUse).toBeUndefined();
  });

  it('uses cached whenToUse, skipping LLM', async () => {
    const fakeFetch = vi.fn();
    vi.stubGlobal('fetch', fakeFetch);

    const cache = new Map([[gitWorkflow.sourcePath, 'Cached explanation.']]);
    const llmOptions: LlmExplainOptions = { baseUrl: 'http://localhost/v1', modelId: 'llama3' };
    const result = await buildExplanation(gitWorkflow, [gitWorkflow, githubAutomation], { llmOptions, whenToUseCache: cache });
    expect(result.whenToUse).toBe('Cached explanation.');
    expect(fakeFetch).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it('writes LLM result to cache', async () => {
    const fakeFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ choices: [{ message: { content: '{"whenToUse":"LLM explanation."}' } }] }),
    });
    vi.stubGlobal('fetch', fakeFetch);

    const cache = new Map<string, string>();
    const llmOptions: LlmExplainOptions = { baseUrl: 'http://localhost/v1', modelId: 'llama3' };
    await buildExplanation(gitWorkflow, [gitWorkflow, githubAutomation], { llmOptions, whenToUseCache: cache });
    expect(cache.get(gitWorkflow.sourcePath)).toBe('LLM explanation.');
    vi.unstubAllGlobals();
  });
});
