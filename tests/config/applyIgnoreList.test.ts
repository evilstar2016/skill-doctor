import { describe, expect, it } from 'vitest';
import { filterConflicts, filterFindings } from '../../src/config/applyIgnoreList';
import type { AuditFinding } from '../../src/types/audit';
import type { ConflictPair, SkillRecord } from '../../src/types/skill';

function makeSkill(name: string): SkillRecord {
  return { name, sourcePath: `/fake/${name}/SKILL.md`, platform: 'claude', scope: 'global', description: '', triggers: [] };
}

function makePair(nameA: string, nameB: string, kind: 'duplicate' | 'conflict' = 'conflict'): ConflictPair {
  return { a: makeSkill(nameA), b: makeSkill(nameB), kind, similarity: 0.8, sharedTokens: [], severity: 'med' };
}

function makeFinding(skillName: string): AuditFinding {
  return { skillName, sourcePath: `/fake/${skillName}/SKILL.md`, platform: 'claude', scope: 'global', ruleId: 'shell-exec', severity: 'high', summary: 'test', matchedText: 'run' };
}

describe('filterConflicts', () => {
  it('returns all pairs when ignore config is empty', () => {
    const pairs = [makePair('a', 'b'), makePair('c', 'd')];
    expect(filterConflicts(pairs, {})).toHaveLength(2);
  });

  it('removes pair when skillName a is in ignore list', () => {
    const pairs = [makePair('a', 'b'), makePair('c', 'd')];
    const result = filterConflicts(pairs, { skillNames: ['a'] });
    expect(result).toHaveLength(1);
    expect(result[0].a.name).toBe('c');
  });

  it('removes pair when skillName b is in ignore list', () => {
    const pairs = [makePair('a', 'b'), makePair('c', 'd')];
    const result = filterConflicts(pairs, { skillNames: ['b'] });
    expect(result).toHaveLength(1);
  });

  it('removes pair when both names are in ignore list', () => {
    const pairs = [makePair('a', 'b')];
    expect(filterConflicts(pairs, { skillNames: ['a', 'b'] })).toHaveLength(0);
  });

  it('removes pair matching a specific conflictPair entry', () => {
    const pairs = [makePair('a', 'b'), makePair('c', 'd')];
    const result = filterConflicts(pairs, { conflictPairs: [['a', 'b']] });
    expect(result).toHaveLength(1);
    expect(result[0].a.name).toBe('c');
  });

  it('matches conflictPair regardless of order', () => {
    const pairs = [makePair('a', 'b')];
    expect(filterConflicts(pairs, { conflictPairs: [['b', 'a']] })).toHaveLength(0);
  });

  it('keeps pairs not in the ignore list', () => {
    const pairs = [makePair('a', 'b'), makePair('c', 'd')];
    expect(filterConflicts(pairs, { skillNames: ['x'] })).toHaveLength(2);
  });
});

describe('filterFindings', () => {
  it('returns all findings when ignore config is empty', () => {
    const findings = [makeFinding('a'), makeFinding('b')];
    expect(filterFindings(findings, {})).toHaveLength(2);
  });

  it('removes findings for ignored skill names', () => {
    const findings = [makeFinding('a'), makeFinding('b')];
    const result = filterFindings(findings, { skillNames: ['a'] });
    expect(result).toHaveLength(1);
    expect(result[0].skillName).toBe('b');
  });

  it('keeps findings for skills not in ignore list', () => {
    const findings = [makeFinding('a')];
    expect(filterFindings(findings, { skillNames: ['x'] })).toHaveLength(1);
  });

  it('returns empty array when all skills ignored', () => {
    const findings = [makeFinding('a'), makeFinding('b')];
    expect(filterFindings(findings, { skillNames: ['a', 'b'] })).toHaveLength(0);
  });
});
