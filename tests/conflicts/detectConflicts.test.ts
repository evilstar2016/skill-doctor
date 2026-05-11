import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { detectConflicts } from '../../src/conflicts/detectConflicts';
import { parseSkill } from '../../src/parsing/parseSkill';
import type { SkillFile, SkillRecord } from '../../src/types/skill';

function fixturePath(name: string): string {
  return join(process.cwd(), 'tests', 'fixtures', name);
}

function makeSkillFile(filePath: string): SkillFile {
  return {
    filePath,
    platform: 'claude',
    scope: 'project',
    confidence: 'high',
  };
}

function isSkillRecord(value: SkillRecord | null): value is SkillRecord {
  return value !== null;
}

describe('detectConflicts', () => {
  it('returns a duplicate pair for same-name skills from different paths', () => {
    const left: SkillRecord = {
      name: 'Huashu Design',
      sourcePath: 'E:/skills/global/Huashu-Design/SKILL.md',
      platform: 'claude',
      scope: 'global',
      description: 'Design agent for interactive html demos.',
      triggers: ['make prototype'],
    };
    const right: SkillRecord = {
      name: 'Huashu Design',
      sourcePath: 'E:/skills/project/Huashu-Design/SKILL.md',
      platform: 'claude',
      scope: 'project',
      description: 'Design agent for interactive html demos.',
      triggers: ['make prototype'],
    };

    const pairs = detectConflicts([left, right]);

    expect(pairs).toHaveLength(1);
    expect(pairs[0]?.kind).toBe('duplicate');
    expect(pairs[0]?.severity).toBe('high');
    expect(pairs[0]?.similarity).toBe(1);
  });

  it('returns a high-severity conflict for highly overlapping skills', () => {
    const left = parseSkill(makeSkillFile(fixturePath('conflicting-a.md')));
    const right = parseSkill(makeSkillFile(fixturePath('conflicting-b.md')));

    const pairs = detectConflicts([left, right].filter(isSkillRecord));

    expect(pairs).toHaveLength(1);
    expect(pairs[0]?.kind).toBe('conflict');
    expect(pairs[0]?.severity).toBe('high');
    expect(pairs[0]?.sharedTokens).toEqual([
      'branch',
      'commit',
      'create',
      'git',
      'message',
      'open',
      'pull',
      'request',
      'workflow',
      'write',
    ]);
  });

  it('returns no conflicts for unrelated skills', () => {
    const left = parseSkill(makeSkillFile(fixturePath('unrelated-a.md')));
    const right = parseSkill(makeSkillFile(fixturePath('unrelated-b.md')));

    const pairs = detectConflicts([left, right].filter(isSkillRecord));

    expect(pairs).toEqual([]);
  });

  it('returns an empty array for fewer than two skills', () => {
    const single = parseSkill(makeSkillFile(fixturePath('conflicting-a.md')));

    expect(detectConflicts(single ? [single] : [])).toEqual([]);
    expect(detectConflicts([])).toEqual([]);
  });
});