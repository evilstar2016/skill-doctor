import { describe, expect, it } from 'vitest';

import { generateRemediation } from '../../src/conflicts/generateRemediation';
import type { ConflictPair, SkillRecord } from '../../src/types/skill';

function makeSkill(overrides: Partial<SkillRecord> = {}): SkillRecord {
  return {
    name: 'skill-a',
    sourcePath: '/a/SKILL.md',
    platform: 'claude',
    scope: 'project',
    description: 'Skill A',
    triggers: ['do something'],
    ...overrides,
  };
}

function makePair(overrides: Partial<ConflictPair> = {}): ConflictPair {
  return {
    a: makeSkill(),
    b: makeSkill({ name: 'skill-b', sourcePath: '/b/SKILL.md' }),
    kind: 'conflict',
    similarity: 0.7,
    sharedTokens: ['something'],
    severity: 'med',
    ...overrides,
  };
}

describe('generateRemediation', () => {
  it('prefers remediation returned by analysis', () => {
    const pair = makePair({
      analysis: {
        summary: 'conflicting',
        overlapAreas: [],
        boundaries: [],
        strengthsA: [],
        strengthsB: [],
        verdict: 'conflicting',
        remediation: 'Rename the overlapping triggers so each skill owns a distinct entry point.',
      },
    });
    expect(generateRemediation(pair)).toBe('Rename the overlapping triggers so each skill owns a distinct entry point.');
  });

  it('suggests removing duplicate', () => {
    const pair = makePair({ kind: 'duplicate' });
    expect(generateRemediation(pair)).toContain('Remove the duplicate');
  });

  it('suggests scope change for same-platform different-scope conflicts', () => {
    const pair = makePair({
      a: makeSkill({ platform: 'claude', scope: 'project' }),
      b: makeSkill({ platform: 'claude', scope: 'global' }),
    });
    expect(generateRemediation(pair)).toContain('different scope');
  });

  it('suggests platform-specific prefixes for cross-platform shared triggers', () => {
    const pair = makePair({
      a: makeSkill({ platform: 'claude', triggers: ['deploy'] }),
      b: makeSkill({ platform: 'cursor', triggers: ['deploy'] }),
    });
    expect(generateRemediation(pair)).toContain('platform-specific');
  });

  it('suggests narrowing triggers for adjacent verdict', () => {
    const pair = makePair({
      analysis: {
        summary: 'adjacent',
        overlapAreas: [],
        boundaries: [],
        strengthsA: [],
        strengthsB: [],
        verdict: 'adjacent',
      },
    });
    expect(generateRemediation(pair)).toContain('Narrow');
  });

  it('suggests merging for conflicting verdict', () => {
    const pair = makePair({
      analysis: {
        summary: 'conflicting',
        overlapAreas: [],
        boundaries: [],
        strengthsA: [],
        strengthsB: [],
        verdict: 'conflicting',
      },
    });
    expect(generateRemediation(pair)).toContain('Merge');
  });

  it('falls back to generic advice', () => {
    const pair = makePair({
      a: makeSkill({ platform: 'claude', scope: 'project', triggers: ['alpha'] }),
      b: makeSkill({ platform: 'claude', scope: 'project', triggers: ['beta'] }),
    });
    expect(generateRemediation(pair)).toContain('Refine trigger keywords');
  });
});
