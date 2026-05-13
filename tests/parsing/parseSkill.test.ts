import { mkdirSync, writeFileSync } from 'node:fs';
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

  it('extracts when_to_use and paths from official Claude frontmatter', () => {
    const filePath = join(tmpdir(), `skill-doctor-official-${Date.now()}.md`);
    writeFileSync(
      filePath,
      [
        '---',
        'name: my-skill',
        'description: Does something useful.',
        'when_to_use: Use when the user asks to do the thing.',
        'paths:',
        '  - "**/*.ts"',
        '  - "**/*.tsx"',
        '---',
        '',
        '# My Skill',
        '',
        'Instructions here.',
      ].join('\n'),
      'utf8',
    );

    const result = parseSkill(makeSkillFile(filePath));

    expect(result).not.toBeNull();
    expect(result?.triggers).toContain('Use when the user asks to do the thing.');
    expect(result?.triggers).toContain('**/*.ts');
    expect(result?.triggers).toContain('**/*.tsx');
  });

  it('parses folded block scalar frontmatter values', () => {
    const filePath = join(tmpdir(), `skill-doctor-folded-${Date.now()}.md`);
    writeFileSync(
      filePath,
      [
        '---',
        'name: folded-skill',
        'description: >',
        '  First line of the description,',
        '  still in the same paragraph.',
        '',
        '  Second paragraph.',
        'when_to_use: >',
        '  Use this when the user asks',
        '  for a progress update.',
        '---',
        '',
        '# Folded Skill',
      ].join('\n'),
      'utf8',
    );

    const result = parseSkill(makeSkillFile(filePath));

    expect(result).not.toBeNull();
    expect(result?.description).toBe(
      'First line of the description, still in the same paragraph.\n\nSecond paragraph.',
    );
    expect(result?.triggers).toContain('Use this when the user asks for a progress update.');
  });

  it('parses literal block scalar frontmatter values', () => {
    const filePath = join(tmpdir(), `skill-doctor-literal-${Date.now()}.md`);
    writeFileSync(
      filePath,
      [
        '---',
        'name: literal-skill',
        'when_to_use: |',
        '  First line',
        '  Second line',
        'applyTo: |',
        '  **/*.ts',
        '  **/*.tsx',
        '---',
        '',
        '# Literal Skill',
      ].join('\n'),
      'utf8',
    );

    const result = parseSkill(makeSkillFile(filePath));

    expect(result).not.toBeNull();
    expect(result?.triggers).toContain('First line\nSecond line');
    expect(result?.triggers).toContain('**/*.ts\n**/*.tsx');
  });

  it('extracts inline frontmatter arrays for paths and globs', () => {
    const filePath = join(tmpdir(), `skill-doctor-inline-arrays-${Date.now()}.md`);
    writeFileSync(
      filePath,
      [
        '---',
        'name: inline-arrays',
        'globs: ["**/*.ts", "**/*.tsx"]',
        'paths: ["src/**/*.ts", "tests/**/*.ts"]',
        '---',
        '',
        '# Inline Arrays',
        '',
        'Instructions here.',
      ].join('\n'),
      'utf8',
    );

    const result = parseSkill(makeSkillFile(filePath));

    expect(result).not.toBeNull();
    expect(result?.triggers).toContain('**/*.ts');
    expect(result?.triggers).toContain('**/*.tsx');
    expect(result?.triggers).toContain('src/**/*.ts');
    expect(result?.triggers).toContain('tests/**/*.ts');
  });

  it('falls back to sibling manifest metadata for SKILL.md files', () => {
    const skillDir = join(tmpdir(), `skill-doctor-manifest-${Date.now()}`);
    const filePath = join(skillDir, 'SKILL.md');
    const manifestPath = join(skillDir, 'manifest.json');

    mkdirSync(skillDir, { recursive: true });

    writeFileSync(
      filePath,
      [
        '# Manifest-backed Skill',
        '',
        '## When to Use',
        '',
        '- Review local changes',
      ].join('\n'),
      'utf8',
    );
    writeFileSync(
      manifestPath,
      JSON.stringify({
        name: 'manifest-backed-skill',
        description: 'Loaded from sibling manifest metadata.',
      }),
      'utf8',
    );

    const result = parseSkill(makeSkillFile(filePath));

    expect(result).not.toBeNull();
    expect(result?.name).toBe('manifest-backed-skill');
    expect(result?.description).toBe('Loaded from sibling manifest metadata.');
    expect(result?.triggers).toContain('Loaded from sibling manifest metadata.');
    expect(result?.triggers).toContain('Review local changes');
  });
});