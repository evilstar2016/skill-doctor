import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { toggleCodexResource } from '../../src/context/codexControls';

const roots: string[] = [];

afterEach(() => {
  for (const root of roots) rmSync(root, { recursive: true, force: true });
  roots.length = 0;
});

function tempRoot(): string {
  const root = mkdtempSync(join(tmpdir(), 'skill-doctor-codex-controls-'));
  roots.push(root);
  return root;
}

function writeFile(path: string, content: string): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content, 'utf8');
}

function readFile(path: string): string {
  return readFileSync(path, 'utf8');
}

describe('toggleCodexResource', () => {
  it('disables and enables skills through project skills.config idempotently', async () => {
    const root = tempRoot();
    const cwd = join(root, 'workspace');
    const home = join(root, 'home');
    const skillPath = join(cwd, '.codex', 'skills', 'review', 'SKILL.md');
    const configPath = join(cwd, '.codex', 'config.toml');
    writeFile(skillPath, ['---', 'name: review', 'description: Review helper.', '---'].join('\n'));

    const disabled = await toggleCodexResource(cwd, `codex:skill:${skillPath}`, false, { homeDir: home });
    const disabledAgain = await toggleCodexResource(cwd, `codex:skill:${skillPath}`, false, { homeDir: home });
    const enabled = await toggleCodexResource(cwd, `codex:skill:${skillPath}`, true, { homeDir: home });
    const config = readFile(configPath);

    expect(disabled).toEqual(expect.objectContaining({ supported: true, changed: true, enabled: false, requiresNewSession: true }));
    expect(disabledAgain).toEqual(expect.objectContaining({ supported: true, changed: false, enabled: false }));
    expect(enabled).toEqual(expect.objectContaining({ supported: true, changed: true, enabled: true }));
    expect(config.match(/\[\[skills\.config\]\]/g)).toHaveLength(1);
    expect(config).toContain(`path = "${skillPath}"`);
    expect(config).toContain('enabled = true');
  });

  it('disables and enables MCP servers through project mcp_servers enabled', async () => {
    const root = tempRoot();
    const cwd = join(root, 'workspace');
    const home = join(root, 'home');
    const configPath = join(cwd, '.codex', 'config.toml');
    writeFile(configPath, ['[mcp_servers.github]', 'command = "node"', 'args = ["server.js"]'].join('\n'));

    await toggleCodexResource(cwd, 'codex:mcp:github', false, { homeDir: home });
    const disabledConfig = readFile(configPath);
    const disabledAgain = await toggleCodexResource(cwd, 'codex:mcp:github', false, { homeDir: home });
    await toggleCodexResource(cwd, 'codex:mcp:github', true, { homeDir: home });
    const enabledConfig = readFile(configPath);

    expect(disabledConfig).toContain('[mcp_servers.github]');
    expect(disabledConfig).toContain('enabled = false');
    expect(disabledAgain.changed).toBe(false);
    expect(enabledConfig).toContain('enabled = true');
    expect(enabledConfig.match(/^\[mcp_servers\.github\]$/gm)).toHaveLength(1);
  });

  it('updates MCP tool denylist and allowlist without duplicates', async () => {
    const root = tempRoot();
    const cwd = join(root, 'workspace');
    const home = join(root, 'home');
    const configPath = join(cwd, '.codex', 'config.toml');
    writeFile(
      configPath,
      [
        '[mcp_servers.github]',
        'command = "node"',
        'args = ["server.js"]',
        'enabled_tools = ["search_repositories"]',
        'disabled_tools = ["delete_repository"]',
      ].join('\n'),
    );

    const disabled = await toggleCodexResource(cwd, 'codex:mcp:github:tool:search_repositories', false, { homeDir: home });
    const disabledAgain = await toggleCodexResource(cwd, 'codex:mcp:github:tool:search_repositories', false, { homeDir: home });
    const enabled = await toggleCodexResource(cwd, 'codex:mcp:github:tool:search_repositories', true, { homeDir: home });
    const config = readFile(configPath);

    expect(disabled).toEqual(expect.objectContaining({ resource: 'mcp-tool', enabled: false, changed: true }));
    expect(disabledAgain.changed).toBe(false);
    expect(enabled).toEqual(expect.objectContaining({ resource: 'mcp-tool', enabled: true, changed: true }));
    expect(config).toContain('disabled_tools = ["delete_repository"]');
    expect(config).toContain('enabled_tools = ["search_repositories"]');
    expect(config.match(/search_repositories/g)).toHaveLength(1);
  });

  it('disables and enables plugins through project plugin enabled state', async () => {
    const root = tempRoot();
    const cwd = join(root, 'workspace');
    const home = join(root, 'home');
    const configPath = join(cwd, '.codex', 'config.toml');
    writeFile(join(home, '.codex', 'plugins', 'notes', '.codex-plugin', 'plugin.json'), JSON.stringify({ name: 'notes@example', skills: './skills' }));
    writeFile(join(home, '.codex', 'plugins', 'notes', 'skills', 'note-helper', 'SKILL.md'), ['---', 'name: note-helper', 'description: Note helper.', '---'].join('\n'));

    await toggleCodexResource(cwd, 'codex:plugin:notes@example:skill:note-helper', false, { homeDir: home });
    const disabledConfig = readFile(configPath);
    const disabledAgain = await toggleCodexResource(cwd, 'codex:plugin:notes@example:skill:note-helper', false, { homeDir: home });
    await toggleCodexResource(cwd, 'codex:plugin:notes@example:skill:note-helper', true, { homeDir: home });
    const enabledConfig = readFile(configPath);

    expect(disabledConfig).toContain('[plugins."notes@example"]');
    expect(disabledConfig).toContain('enabled = false');
    expect(disabledAgain.changed).toBe(false);
    expect(enabledConfig).toContain('enabled = true');
    expect(enabledConfig.match(/^\[plugins\."notes@example"\]$/gm)).toHaveLength(1);
  });

  it('returns unsupported results for AGENTS resources without writing config', async () => {
    const root = tempRoot();
    const cwd = join(root, 'workspace');
    const home = join(root, 'home');
    const configPath = join(cwd, '.codex', 'config.toml');
    writeFile(join(cwd, 'AGENTS.md'), 'Project guidance.');

    const result = await toggleCodexResource(cwd, 'codex:agents:project-root-agents', false, { homeDir: home });

    expect(result).toEqual(expect.objectContaining({
      supported: false,
      changed: false,
      resource: 'agents',
      recommendation: expect.stringContaining('move rare guidance into a skill'),
    }));
    expect(existsSync(configPath)).toBe(false);
  });
});
