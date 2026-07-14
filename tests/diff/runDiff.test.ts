import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, describe, expect, it } from 'vitest';
import { DiffError, runDiff as runDiffRecords, runDiffForCwd as runDiff } from '../../src/diff/runDiff';

const tempRoots: string[] = [];

function createTempRoot(): string {
  const root = mkdtempSync(join(tmpdir(), 'skill-doctor-diff-'));
  tempRoots.push(root);
  return root;
}

function writeSkill(root: string, name: string, content: string): void {
  const dir = join(root, '.claude', 'skills', name);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'SKILL.md'), content, 'utf8');
}

afterEach(() => {
  for (const root of tempRoots) rmSync(root, { recursive: true, force: true });
  tempRoots.length = 0;
});

const SKILL_A = `---
name: skill-alpha
description: Helps with code review and pull request feedback
---

# Skill Alpha

## When to Use
Use when reviewing pull requests or giving feedback on code quality.

## Checklist
- Check for naming conventions
- Verify error handling
`;

const SKILL_B = `---
name: skill-beta
description: Guides test-driven development workflow
---

# Skill Beta

## When to Use
Use when writing new features using TDD approach.

## Checklist
- Write failing test first
- Implement minimal code to pass
- Refactor
`;

describe('runDiff', () => {
  it('uses the supplied records without scanning default paths', async () => {
    const root = createTempRoot();
    const firstPath = join(root, 'custom', 'external-alpha', 'SKILL.md');
    const secondPath = join(root, 'special', 'external-beta', 'SKILL.md');
    mkdirSync(join(root, 'custom', 'external-alpha'), { recursive: true });
    mkdirSync(join(root, 'special', 'external-beta'), { recursive: true });
    writeFileSync(firstPath, SKILL_A, 'utf8');
    writeFileSync(secondPath, SKILL_B, 'utf8');

    const result = await runDiffRecords('external-alpha', 'external-beta', [
      { name: 'external-alpha', sourcePath: firstPath, platform: 'claude', scope: 'global', description: 'custom', triggers: [] },
      { name: 'external-beta', sourcePath: secondPath, platform: 'codex', scope: 'global', description: 'special', triggers: [] },
    ]);

    expect(result.skillA.name).toBe('external-alpha');
    expect(result.skillB.name).toBe('external-beta');
  });

  it('returns profiles for two valid skills without LLM', async () => {
    const cwd = createTempRoot();
    writeSkill(cwd, 'skill-alpha', SKILL_A);
    writeSkill(cwd, 'skill-beta', SKILL_B);

    const result = await runDiff('skill-alpha', 'skill-beta', cwd);

    expect(result.skillA.name).toBe('skill-alpha');
    expect(result.skillB.name).toBe('skill-beta');
    expect(result.analysis).toBeNull();
  });

  it('extracts whenToUse section correctly', async () => {
    const cwd = createTempRoot();
    writeSkill(cwd, 'skill-alpha', SKILL_A);
    writeSkill(cwd, 'skill-beta', SKILL_B);

    const result = await runDiff('skill-alpha', 'skill-beta', cwd);

    expect(result.skillA.whenToUse).toContain('reviewing pull requests');
    expect(result.skillB.whenToUse).toContain('writing new features');
  });

  it('extracts checklist items correctly', async () => {
    const cwd = createTempRoot();
    writeSkill(cwd, 'skill-alpha', SKILL_A);
    writeSkill(cwd, 'skill-beta', SKILL_B);

    const result = await runDiff('skill-alpha', 'skill-beta', cwd);

    expect(result.skillA.checklistItems).toContain('Check for naming conventions');
    expect(result.skillB.checklistItems).toContain('Write failing test first');
  });

  it('throws DiffError when both names are the same', async () => {
    const cwd = createTempRoot();
    writeSkill(cwd, 'skill-alpha', SKILL_A);

    await expect(runDiff('skill-alpha', 'skill-alpha', cwd)).rejects.toThrow(DiffError);
    await expect(runDiff('skill-alpha', 'skill-alpha', cwd)).rejects.toThrow('same');
  });

  it('throws DiffError when skill A is not found', async () => {
    const cwd = createTempRoot();
    writeSkill(cwd, 'skill-beta', SKILL_B);

    await expect(runDiff('missing-skill', 'skill-beta', cwd)).rejects.toThrow(DiffError);
    await expect(runDiff('missing-skill', 'skill-beta', cwd)).rejects.toThrow('"missing-skill"');
  });

  it('throws DiffError when skill B is not found', async () => {
    const cwd = createTempRoot();
    writeSkill(cwd, 'skill-alpha', SKILL_A);

    await expect(runDiff('skill-alpha', 'no-such-skill', cwd)).rejects.toThrow(DiffError);
    await expect(runDiff('skill-alpha', 'no-such-skill', cwd)).rejects.toThrow('"no-such-skill"');
  });

  it('throws DiffError when both skills are not found and lists available skills', async () => {
    const cwd = createTempRoot();
    writeSkill(cwd, 'skill-alpha', SKILL_A);

    const err = await runDiff('x', 'y', cwd).catch((e) => e);
    expect(err).toBeInstanceOf(DiffError);
    expect(err.message).toContain('"x"');
    expect(err.message).toContain('"y"');
    expect(err.message).toContain('skill-alpha');
  });

  it('handles skill with no When to Use section', async () => {
    const cwd = createTempRoot();
    const bare = '---\nname: skill-bare\ndescription: minimal skill\n---\n\n# Bare\n';
    writeSkill(cwd, 'skill-bare', bare);
    writeSkill(cwd, 'skill-beta', SKILL_B);

    const result = await runDiff('skill-bare', 'skill-beta', cwd);
    expect(result.skillA.whenToUse).toBe('');
    expect(result.skillA.checklistItems).toHaveLength(0);
  });
});
