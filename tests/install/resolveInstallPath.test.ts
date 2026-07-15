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
      scope: 'global',
      globalDir: '/home/user/.claude/skills',
      layout: 'skill-dirs',
    });
  });

  it('resolves files-layout platform install targets', () => {
    const result = resolveInstallTarget('cursor', { homeDir: '/home/user' });

    expect(result).toEqual({
      platform: 'cursor',
      scope: 'global',
      globalDir: '/home/user/.cursor/rules',
      layout: 'files',
    });
  });

  it('resolves project install targets against the selected project', () => {
    const result = resolveInstallTarget('claude', {
      homeDir: '/home/user', projectDir: '/work/project', scope: 'project',
    });

    expect(result).toEqual({
      platform: 'claude', scope: 'project', globalDir: '/work/project/.claude/skills', layout: 'skill-dirs',
    });
  });

  it('rejects project scope for Agents without a project install target', () => {
    expect(() => resolveInstallTarget('cursor', {
      homeDir: '/home/user', projectDir: '/work/project', scope: 'project',
    })).toThrow("does not support project skill installs");
  });

  it('throws a typed error for unknown install targets', () => {
    expect(() => resolveInstallTarget('nonexistent', { homeDir: '/home/user' }))
      .toThrow(InstallTargetError);
  });
});
