import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { scanCodexContextEntries } from '../../src/context/scanCodexContext';

const roots: string[] = [];

afterEach(() => {
  for (const root of roots) rmSync(root, { recursive: true, force: true });
  roots.length = 0;
});

function tempRoot(): string {
  const root = mkdtempSync(join(tmpdir(), 'skill-doctor-codex-scan-'));
  roots.push(root);
  return root;
}

function writeFile(path: string, content: string): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content, 'utf8');
}

describe('scanCodexContextEntries', () => {
  it('uses Codex AGENTS override precedence and emits agents-chain entries', async () => {
    const root = tempRoot();
    const cwd = join(root, 'workspace');
    const home = join(root, 'home');
    writeFile(join(cwd, 'AGENTS.md'), 'Root agents should be hidden by override.');
    writeFile(join(cwd, 'AGENTS.override.md'), 'Override agents content.');

    const entries = await scanCodexContextEntries(cwd, { homeDir: home, resource: 'agents' });

    expect(entries).toHaveLength(1);
    expect(entries[0]).toEqual(expect.objectContaining({
      id: 'codex:agents:project-root-agents-override',
      kind: 'agents-chain',
      resource: 'agents',
      sourcePath: join(cwd, 'AGENTS.override.md'),
    }));
  });

  it('discovers plugin skills and honors plugin enabled state', async () => {
    const root = tempRoot();
    const cwd = join(root, 'workspace');
    const home = join(root, 'home');
    writeFile(
      join(home, '.codex', 'plugins', 'notes', '.codex-plugin', 'plugin.json'),
      JSON.stringify({ name: 'notes', skills: './skills/' }),
    );
    writeFile(
      join(home, '.codex', 'plugins', 'notes', 'skills', 'note-helper', 'SKILL.md'),
      ['---', 'name: note-helper', 'description: Help with notes.', '---', '', '# Note Helper'].join('\n'),
    );
    writeFile(join(home, '.codex', 'config.toml'), ['[plugins."notes@example"]', 'enabled = false'].join('\n'));

    const hidden = await scanCodexContextEntries(cwd, { homeDir: home, resource: 'plugin' });
    const visible = await scanCodexContextEntries(cwd, { homeDir: home, resource: 'plugin', includeDisabled: true });

    expect(hidden).toHaveLength(0);
    expect(visible).toHaveLength(1);
    expect(visible[0]).toEqual(expect.objectContaining({
      id: 'codex:plugin:notes@example:skill:note-helper',
      name: 'note-helper',
      context: expect.objectContaining({
        resource: 'plugin',
        enabled: false,
        controlMethod: 'plugins.notes@example.enabled',
      }),
    }));
  });
});
