import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { describe, expect, it } from 'vitest';

import { parseSkill } from '../../src/parsing/parseSkill';
import type { SkillFile } from '../../src/types/skill';

function fixturePath(name: string): string {
  return join(process.cwd(), 'tests', 'fixtures', name);
}

function makeSkillFile(filePath: string, platform: SkillFile['platform'] = 'claude'): SkillFile {
  return {
    filePath,
    platform,
    scope: 'project',
    confidence: 'high',
  };
}

describe('parseSkill', () => {
  it('parses frontmatter-backed skill files', () => {
    const result = parseSkill(makeSkillFile(fixturePath('claude-with-frontmatter.md')));

    expect(result).not.toBeNull();
    expect(result?.name).toBe('test-driven-development');
    expect(result?.description).toContain('tests before implementation');
    expect(result?.triggers).toEqual([
      'Write a failing test first',
      'Implement logic changes',
      'Fix regressions with proof',
      'Drives development with tests before implementation.',
    ]);
  });

  it('falls back to the heading and body when frontmatter is missing', () => {
    const result = parseSkill(makeSkillFile(fixturePath('claude-no-frontmatter.md')));

    expect(result).not.toBeNull();
    expect(result?.name).toBe('Incremental Implementation');
    expect(result?.description).toContain('Build in thin, verifiable slices');
    expect(result?.triggers).toEqual([
      'Work on multi-file features',
      'Validate each slice before continuing',
    ]);
  });

  it('extracts globs and trigger lines from cursor mdc files', () => {
    const result = parseSkill(makeSkillFile(fixturePath('cursor-with-globs.mdc'), 'cursor'));

    expect(result).not.toBeNull();
    expect(result?.name).toBe('Cursor Git Review Rule');
    expect(result?.description).toContain('reviewing pull requests');
    expect(result?.triggers).toEqual([
      'create a pull request',
      'review commit history',
      '**/*.ts',
      '**/*.tsx',
      'Cursor rule for reviewing pull requests and git workflow.',
    ]);
  });

  it('extracts applyTo rules from copilot instruction files', () => {
    const result = parseSkill(makeSkillFile(fixturePath('copilot-instructions.instructions.md'), 'copilot'));

    expect(result).not.toBeNull();
    expect(result?.name).toBe('GitHub Copilot Instructions');
    expect(result?.triggers).toContain('**/*.{ts,tsx,js,jsx}');
  });

  it('returns null for empty files', () => {
    const emptyPath = join(tmpdir(), `skill-doctor-empty-${Date.now()}.md`);
    writeFileSync(emptyPath, '', 'utf8');

    expect(parseSkill(makeSkillFile(emptyPath))).toBeNull();
  });
});