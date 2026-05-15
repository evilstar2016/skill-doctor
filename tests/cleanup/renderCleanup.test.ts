import { describe, expect, it } from 'vitest';
import { renderCleanup } from '../../src/render/renderCleanup';
import type { CleanupSuggestion } from '../../src/types/cleanup';

describe('renderCleanup', () => {
  it('returns no-duplicates message for empty suggestions', () => {
    const result = renderCleanup([]);
    expect(result).toContain('CLEANUP SUGGESTIONS');
    expect(result).toContain('No duplicate skills found.');
  });

  it('shows singular "suggestion" for one item', () => {
    const suggestions: CleanupSuggestion[] = [
      {
        skillName: 'skill-alpha',
        keepPath: '/global/.claude/skills/skill-alpha/SKILL.md',
        removePath: '/project/.claude/skills/skill-alpha/SKILL.md',
        keepReason: 'newer (modified 2026-05-10)',
      },
    ];
    const result = renderCleanup(suggestions);
    expect(result).toContain('1 suggestion found');
    expect(result).toContain('skill-alpha');
    expect(result).toContain('remove:');
    expect(result).toContain('/project/.claude/skills/skill-alpha/SKILL.md');
    expect(result).toContain('keep:');
    expect(result).toContain('/global/.claude/skills/skill-alpha/SKILL.md');
    expect(result).toContain('newer (modified 2026-05-10)');
  });

  it('shows plural "suggestions" for multiple items', () => {
    const suggestions: CleanupSuggestion[] = [
      {
        skillName: 'skill-alpha',
        keepPath: '/global/skill-alpha/SKILL.md',
        removePath: '/project/skill-alpha/SKILL.md',
        keepReason: 'newer (modified 2026-05-10)',
      },
      {
        skillName: 'skill-beta',
        keepPath: '/global/skill-beta/SKILL.md',
        removePath: '/project/skill-beta/SKILL.md',
        keepReason: 'newer (modified 2026-05-12)',
      },
    ];
    const result = renderCleanup(suggestions);
    expect(result).toContain('2 suggestions found');
    expect(result).toContain('skill-alpha');
    expect(result).toContain('skill-beta');
  });
});
