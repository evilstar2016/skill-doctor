import { describe, expect, it } from 'vitest';
import { suggestCleanup } from '../../src/cleanup/suggestCleanup';
import type { ConflictPair, SkillRecord } from '../../src/types/skill';

function makeSkill(name: string, path: string): SkillRecord {
  return { name, sourcePath: path, platform: 'claude', scope: 'global', description: '', triggers: [] };
}

function makeDuplicate(pathA: string, pathB: string): ConflictPair {
  return {
    a: makeSkill('my-skill', pathA),
    b: makeSkill('my-skill', pathB),
    kind: 'duplicate',
    similarity: 1,
    sharedTokens: [],
    severity: 'high',
    detectionMethod: 'duplicate-name',
  };
}

function fakeStatFn(mtimes: Record<string, Date>) {
  return (path: string) => {
    if (!(path in mtimes)) throw new Error(`no stat for ${path}`);
    return { mtime: mtimes[path] };
  };
}

describe('suggestCleanup', () => {
  it('returns empty array for no duplicates', () => {
    const pair: ConflictPair = {
      a: makeSkill('a', '/a/SKILL.md'),
      b: makeSkill('b', '/b/SKILL.md'),
      kind: 'conflict',
      similarity: 0.8,
      sharedTokens: ['foo'],
      severity: 'med',
    };
    expect(suggestCleanup([pair], fakeStatFn({}))).toEqual([]);
  });

  it('returns empty array for empty input', () => {
    expect(suggestCleanup([], fakeStatFn({}))).toEqual([]);
  });

  it('recommends keeping the newer file', () => {
    const pair = makeDuplicate('/old/SKILL.md', '/new/SKILL.md');
    const stat = fakeStatFn({
      '/old/SKILL.md': new Date('2026-01-01'),
      '/new/SKILL.md': new Date('2026-05-01'),
    });
    const [s] = suggestCleanup([pair], stat);
    expect(s.keepPath).toBe('/new/SKILL.md');
    expect(s.removePath).toBe('/old/SKILL.md');
    expect(s.keepReason).toContain('2026-05-01');
  });

  it('recommends keeping a when both have same mtime', () => {
    const pair = makeDuplicate('/a/SKILL.md', '/b/SKILL.md');
    const ts = new Date('2026-03-15');
    const stat = fakeStatFn({ '/a/SKILL.md': ts, '/b/SKILL.md': ts });
    const [s] = suggestCleanup([pair], stat);
    expect(s.keepPath).toBe('/a/SKILL.md');
    expect(s.removePath).toBe('/b/SKILL.md');
  });

  it('deduplicates when same pair appears twice', () => {
    const pair = makeDuplicate('/a/SKILL.md', '/b/SKILL.md');
    const stat = fakeStatFn({
      '/a/SKILL.md': new Date('2026-05-01'),
      '/b/SKILL.md': new Date('2026-01-01'),
    });
    const results = suggestCleanup([pair, pair], stat);
    expect(results).toHaveLength(1);
  });

  it('skips a pair when stat throws for one path', () => {
    const pair = makeDuplicate('/exists/SKILL.md', '/missing/SKILL.md');
    const stat = fakeStatFn({ '/exists/SKILL.md': new Date('2026-05-01') });
    expect(suggestCleanup([pair], stat)).toEqual([]);
  });

  it('includes skillName in suggestion', () => {
    const pair = makeDuplicate('/a/SKILL.md', '/b/SKILL.md');
    const stat = fakeStatFn({
      '/a/SKILL.md': new Date('2026-05-01'),
      '/b/SKILL.md': new Date('2026-01-01'),
    });
    const [s] = suggestCleanup([pair], stat);
    expect(s.skillName).toBe('my-skill');
  });
});
