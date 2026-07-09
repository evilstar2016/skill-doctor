import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { loadCodexContextConfig } from '../../src/context/codexContextConfig';

const roots: string[] = [];

afterEach(() => {
  for (const root of roots) rmSync(root, { recursive: true, force: true });
  roots.length = 0;
});

function tempRoot(): string {
  const root = mkdtempSync(join(tmpdir(), 'skill-doctor-codex-config-'));
  roots.push(root);
  return root;
}

function writeJson(path: string, value: unknown): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(value, null, 2), 'utf8');
}

describe('loadCodexContextConfig', () => {
  it('loads the built-in Codex defaults', () => {
    const home = tempRoot();
    const { config, sources } = loadCodexContextConfig({ homeDir: home });

    expect(sources[0]).toContain('codex-config.json');
    expect(config.officialLimits.projectDocMaxBytes).toBe(32768);
    expect(config.skillDirs.map((entry) => entry.path)).toEqual(expect.arrayContaining([
      '~/.codex/skills',
      '.codex/skills',
    ]));
    expect(config.pluginDirs[0]?.manifestGlob).toBe('~/.codex/plugins/*/.codex-plugin/plugin.json');
  });

  it('merges user overrides by id and appends new entries', () => {
    const home = tempRoot();
    const userConfigPath = join(home, '.skill-doctor', 'codex-config.json');
    writeJson(userConfigPath, {
      officialLimits: { projectDocMaxBytes: 1234 },
      skillDirs: [
        { id: 'global-codex-skills', scope: 'global', path: '~/.custom-disabled', enabled: false },
        { id: 'custom-project-skills', scope: 'project', path: '.custom/skills', enabled: true },
      ],
    });

    const { config, sources } = loadCodexContextConfig({ homeDir: home });

    expect(sources).toContain(userConfigPath);
    expect(config.officialLimits.projectDocMaxBytes).toBe(1234);
    expect(config.skillDirs.find((entry) => entry.id === 'global-codex-skills')).toEqual(expect.objectContaining({
      path: '~/.custom-disabled',
      enabled: false,
    }));
    expect(config.skillDirs.find((entry) => entry.id === 'custom-project-skills')).toEqual(expect.objectContaining({
      path: '.custom/skills',
      enabled: true,
    }));
  });
});
