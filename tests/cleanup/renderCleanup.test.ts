import { describe, expect, it } from 'vitest';
import { renderCleanup } from '../../src/render/renderCleanup';
import type { ConflictPair } from '../../src/types/skill';

function makeDuplicate(name: string, pathA: string, pathB: string): ConflictPair {
  return {
    a: { name, sourcePath: pathA, platform: 'claude', scope: 'global', description: '', triggers: [] },
    b: { name, sourcePath: pathB, platform: 'claude', scope: 'project', description: '', triggers: [] },
    kind: 'duplicate',
    severity: 'high',
    similarity: 1,
    sharedTokens: [],
  };
}

describe('renderCleanup', () => {
  it('returns no-duplicates message for empty list', () => {
    const result = renderCleanup([]);
    expect(result).toContain('DUPLICATE SKILLS');
    expect(result).toContain('No duplicate skills found.');
  });

  it('shows singular "duplicate" for one item', () => {
    const result = renderCleanup([
      makeDuplicate(
        'skill-alpha',
        '/global/.claude/skills/skill-alpha/SKILL.md',
        '/project/.claude/skills/skill-alpha/SKILL.md',
      ),
    ]);
    expect(result).toContain('1 duplicate found');
    expect(result).toContain('skill-alpha');
    expect(result).toContain('[1] /global/.claude/skills/skill-alpha/SKILL.md');
    expect(result).toContain('[2] /project/.claude/skills/skill-alpha/SKILL.md');
    expect(result).toContain('--execute');
  });

  it('shows plural "duplicates" and all entries for multiple items', () => {
    const result = renderCleanup([
      makeDuplicate('skill-alpha', '/global/skill-alpha/SKILL.md', '/project/skill-alpha/SKILL.md'),
      makeDuplicate('skill-beta', '/global/skill-beta/SKILL.md', '/project/skill-beta/SKILL.md'),
    ]);
    expect(result).toContain('2 duplicates found');
    expect(result).toContain('skill-alpha');
    expect(result).toContain('skill-beta');
  });
});
