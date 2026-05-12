import { describe, expect, it } from 'vitest';

import { buildSemanticText } from '../../../src/conflicts/semantic/buildSemanticText';
import type { SkillRecord } from '../../../src/types/skill';

function makeSkill(overrides: Partial<SkillRecord> = {}): SkillRecord {
  return {
    name: 'Git Workflow',
    sourcePath: 'E:/skills/git/SKILL.md',
    platform: 'claude',
    scope: 'project',
    description: 'Create pull requests and write commit messages.',
    triggers: ['open pr', 'prepare release branch'],
    ...overrides,
  };
}

describe('buildSemanticText', () => {
  it('builds stable text from the name, description, and triggers', () => {
    const skill = makeSkill();

    expect(buildSemanticText(skill)).toBe([
      'Git Workflow',
      'Create pull requests and write commit messages.',
      'open pr',
      'prepare release branch',
    ].join('\n'));
  });

  it('omits blank description and trigger values', () => {
    const skill = makeSkill({
      description: '   ',
      triggers: [' ', 'sync branch', ''],
    });

    expect(buildSemanticText(skill)).toBe(['Git Workflow', 'sync branch'].join('\n'));
  });
});
