import { describe, expect, it } from 'vitest';
import {
  InstallTargetError,
  resolveInstallPath,
  resolveInstallTarget,
} from '../../src/install/resolveInstallPath.js';

describe('resolveInstallPath', () => {
  it('resolves skill-dirs layout to directory + SKILL.md', () => {
    const result = resolveInstallPath('/home/user/.claude/skills', 'skill-dirs', 'my-skill');
    expect(result).toBe('/home/user/.claude/skills/my-skill/SKILL.md');
  });

  it('resolves files layout to a single .md file', () => {
    const result = resolveInstallPath('/home/user/.cursor/rules', 'files', 'my-skill');
    expect(result).toBe('/home/user/.cursor/rules/my-skill.md');
  });

  it('resolves platform install target aliases through the adapter registry', () => {
    const result = resolveInstallTarget('claude-code', { homeDir: '/home/user' });

    expect(result).toEqual({
      platform: 'claude',
      globalDir: '/home/user/.claude/skills',
      layout: 'skill-dirs',
    });
  });

  it('resolves files-layout platform install targets', () => {
    const result = resolveInstallTarget('cursor', { homeDir: '/home/user' });

    expect(result).toEqual({
      platform: 'cursor',
      globalDir: '/home/user/.cursor/rules',
      layout: 'files',
    });
  });

  it('throws a typed error for unknown install targets', () => {
    expect(() => resolveInstallTarget('nonexistent', { homeDir: '/home/user' }))
      .toThrow(InstallTargetError);
  });
});
