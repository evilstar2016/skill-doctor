import { describe, expect, it } from 'vitest';

import { buildExplanation } from '../../src/explain/buildExplanation';
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
  it('returns the original skill fields unchanged', () => {
    const result = buildExplanation(gitWorkflow, [gitWorkflow, githubAutomation, unrelated]);
    expect(result.name).toBe('git-workflow');
    expect(result.platform).toBe('claude');
    expect(result.scope).toBe('project');
    expect(result.description).toBe(gitWorkflow.description);
  });

  it('finds related skills above the similarity threshold', () => {
    const result = buildExplanation(gitWorkflow, [gitWorkflow, githubAutomation, unrelated]);
    const names = result.relatedSkills.map((r) => r.name);
    expect(names).toContain('github-automation');
    expect(names).not.toContain('cooking-tips');
  });

  it('excludes the skill itself from related results', () => {
    const result = buildExplanation(gitWorkflow, [gitWorkflow, githubAutomation]);
    const names = result.relatedSkills.map((r) => r.name);
    expect(names).not.toContain('git-workflow');
  });

  it('orders related skills by descending similarity', () => {
    const closeMatch = makeSkill('git-helper', 'Manage git branches and pull requests with ease.', ['create branch']);
    const weakMatch = makeSkill('git-tips', 'Basic git branching tips.', []);
    const result = buildExplanation(gitWorkflow, [gitWorkflow, closeMatch, weakMatch]);

    if (result.relatedSkills.length >= 2) {
      expect(result.relatedSkills[0].similarity).toBeGreaterThanOrEqual(result.relatedSkills[1].similarity);
    }
  });

  it('caps related skills at 3', () => {
    const skills = Array.from({ length: 6 }, (_, i) =>
      makeSkill(`git-skill-${i}`, 'Manage git branches and pull requests with automation.', ['create branch']),
    );
    const result = buildExplanation(skills[0], skills);
    expect(result.relatedSkills.length).toBeLessThanOrEqual(3);
  });

  it('returns empty relatedSkills when no skills are similar enough', () => {
    const result = buildExplanation(gitWorkflow, [gitWorkflow, unrelated]);
    expect(result.relatedSkills).toHaveLength(0);
  });

  it('includes sharedTokens in each related skill entry', () => {
    const result = buildExplanation(gitWorkflow, [gitWorkflow, githubAutomation]);
    expect(result.relatedSkills[0].sharedTokens.length).toBeGreaterThan(0);
  });
});
