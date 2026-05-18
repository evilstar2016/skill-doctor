import { describe, expect, it } from 'vitest';
import { resolveInstallPath } from '../../src/install/resolveInstallPath.js';

describe('resolveInstallPath', () => {
  it('resolves skill-dirs layout to directory + SKILL.md', () => {
    const result = resolveInstallPath('/home/user/.claude/skills', 'skill-dirs', 'my-skill');
    expect(result).toBe('/home/user/.claude/skills/my-skill/SKILL.md');
  });

  it('resolves files layout to a single .md file', () => {
    const result = resolveInstallPath('/home/user/.cursor/rules', 'files', 'my-skill');
    expect(result).toBe('/home/user/.cursor/rules/my-skill.md');
  });
});
