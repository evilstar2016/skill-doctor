import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join } from 'node:path';

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

  it('orders global and project AGENTS chains with same-directory overrides and truncation metadata', async () => {
    const root = tempRoot();
    const cwd = join(root, 'workspace', 'packages', 'api');
    const home = join(root, 'home');
    writeFile(join(root, 'workspace', '.git'), 'gitdir: .git/worktrees/api');
    writeFile(join(home, '.codex', 'AGENTS.override.md'), 'Global override instructions.');
    writeFile(join(home, '.codex', 'AGENTS.md'), 'Global base should be hidden.');
    writeFile(join(root, 'workspace', 'AGENTS.md'), 'Workspace root instructions.');
    writeFile(join(cwd, 'AGENTS.md'), 'Nested base should be hidden.');
    writeFile(join(cwd, 'AGENTS.override.md'), 'Nested override instructions.');

    const entries = await scanCodexContextEntries(cwd, { homeDir: home, resource: 'agents' });

    expect(entries.map((entry) => entry.sourcePath)).toEqual([
      join(home, '.codex', 'AGENTS.override.md'),
      join(root, 'workspace', 'AGENTS.md'),
      join(cwd, 'AGENTS.override.md'),
    ]);
    expect(entries.every((entry) => entry.kind === 'agents-chain')).toBe(true);
    expect(entries[0]).toEqual(expect.objectContaining({
      id: 'codex:agents:global-agents-override',
      resource: 'agents',
      enabled: true,
      estimateStatus: 'estimated',
      officialLimit: expect.objectContaining({ value: 32768 }),
    }));
  });

  it('discovers Codex user and project skills from supported directories', async () => {
    const root = tempRoot();
    const cwd = join(root, 'workspace');
    const home = join(root, 'home');
    const skillDirs = [
      join(cwd, '.codex', 'skills', 'project-codex'),
      join(cwd, '.agent', 'skills', 'project-agent'),
      join(cwd, '.agents', 'skills', 'project-agents'),
      join(home, '.codex', 'skills', 'global-codex'),
      join(home, '.agent', 'skills', 'global-agent'),
      join(home, '.agents', 'skills', 'global-agents'),
    ];
    for (const dir of skillDirs) {
      writeFile(join(dir, 'SKILL.md'), ['---', `name: ${basename(dir)}`, 'description: Test skill.', '---'].join('\n'));
    }

    const entries = await scanCodexContextEntries(cwd, { homeDir: home, resource: 'skill' });

    expect(entries.map((entry) => entry.name).sort()).toEqual([
      'global-agent',
      'global-agents',
      'global-codex',
      'project-agent',
      'project-agents',
      'project-codex',
    ]);
    expect(entries).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: `codex:skill:${join(cwd, '.codex', 'skills', 'project-codex', 'SKILL.md')}`,
        context: expect.objectContaining({
          resource: 'skill',
          enabled: true,
          controllable: true,
          controlPath: join(cwd, '.codex', 'config.toml'),
          controlMethod: 'skills.config',
          estimateStatus: 'estimated',
        }),
      }),
    ]));
  });

  it('honors path selectors that target the resolved destination of a symlinked skill', async () => {
    const root = tempRoot();
    const cwd = join(root, 'workspace');
    const home = join(root, 'home');
    const sourceSkill = join(root, 'source-skills', 'linked-helper', 'SKILL.md');
    const linkedSkillDir = join(home, '.agents', 'skills', 'linked-helper');
    writeFile(sourceSkill, ['---', 'name: linked-helper', 'description: Symlinked test skill.', '---'].join('\n'));
    mkdirSync(dirname(linkedSkillDir), { recursive: true });
    symlinkSync(dirname(sourceSkill), linkedSkillDir);
    writeFile(join(home, '.codex', 'config.toml'), [
      '[[skills.config]]',
      `path = ${JSON.stringify(sourceSkill)}`,
      'enabled = false',
    ].join('\n'));

    const hidden = await scanCodexContextEntries(cwd, { homeDir: home, resource: 'skill' });
    const visible = await scanCodexContextEntries(cwd, { homeDir: home, resource: 'skill', includeDisabled: true });

    expect(hidden).toHaveLength(0);
    expect(visible).toEqual([
      expect.objectContaining({
        sourcePath: join(linkedSkillDir, 'SKILL.md'),
        context: expect.objectContaining({ enabled: false }),
      }),
    ]);
  });

  it('lets a project skill selector override the user-level selector for the same candidate', async () => {
    const root = tempRoot();
    const cwd = join(root, 'workspace');
    const home = join(root, 'home');
    const skillPath = join(home, '.codex', 'skills', 'review-helper', 'SKILL.md');
    writeFile(skillPath, ['---', 'name: review-helper', 'description: Test skill.', '---'].join('\n'));
    writeFile(join(home, '.codex', 'config.toml'), [
      '[[skills.config]]',
      'name = "review-helper"',
      'enabled = false',
    ].join('\n'));
    writeFile(join(cwd, '.codex', 'config.toml'), [
      '[[skills.config]]',
      'name = "review-helper"',
      'enabled = true',
    ].join('\n'));

    const entries = await scanCodexContextEntries(cwd, { homeDir: home, resource: 'skill' });

    expect(entries).toEqual([
      expect.objectContaining({
        sourcePath: skillPath,
        context: expect.objectContaining({ enabled: true }),
      }),
    ]);
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

  it('honors disabled skill selectors for enabled plugins', async () => {
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
    writeFile(join(home, '.codex', 'config.toml'), [
      '[plugins."notes@example"]',
      'enabled = true',
      '',
      '[[skills.config]]',
      'name = "notes:note-helper"',
      'enabled = false',
    ].join('\n'));

    const hidden = await scanCodexContextEntries(cwd, { homeDir: home, resource: 'plugin' });
    const visible = await scanCodexContextEntries(cwd, { homeDir: home, resource: 'plugin', includeDisabled: true });

    expect(hidden).toHaveLength(0);
    expect(visible).toEqual([
      expect.objectContaining({
        id: 'codex:plugin:notes@example:skill:note-helper',
        context: expect.objectContaining({ enabled: false }),
      }),
    ]);
  });

  it('applies project MCP enabled overrides to matching global servers', async () => {
    const root = tempRoot();
    const workspace = join(root, 'workspace');
    const cwd = join(workspace, 'packages', 'api');
    const home = join(root, 'home');
    writeFile(join(workspace, '.git'), 'gitdir: .git/worktrees/api');
    writeFile(join(home, '.codex', 'config.toml'), [
      '[mcp_servers.node_repl]',
      'command = "node"',
      'args = ["server.js"]',
    ].join('\n'));
    writeFile(join(workspace, '.codex', 'config.toml'), [
      '[mcp_servers.node_repl]',
      'enabled = false',
      'instructions = "Project-local instructions."',
      'enabled_tools = ["evaluate"]',
      'startup_timeout_sec = 60',
    ].join('\n'));

    const hidden = await scanCodexContextEntries(cwd, {
      homeDir: home,
      resource: 'mcp',
      discoverMcpTools: false,
    });
    const visible = await scanCodexContextEntries(cwd, {
      homeDir: home,
      resource: 'mcp',
      includeDisabled: true,
      discoverMcpTools: false,
    });

    expect(hidden).toHaveLength(0);
    expect(visible).toEqual([
      expect.objectContaining({
        id: 'codex:mcp:node_repl',
        sourcePath: join(workspace, '.codex', 'config.toml'),
        enabled: false,
        instructions: 'Project-local instructions.',
        toolAllowlist: ['evaluate'],
        timeoutMs: 60,
        context: expect.objectContaining({ enabled: false }),
      }),
    ]);
  });

  it('discovers plugin MCP servers from manifests and reports them with plugin metadata', async () => {
    const root = tempRoot();
    const cwd = join(root, 'workspace');
    const home = join(root, 'home');
    writeFile(
      join(home, '.codex', 'plugins', 'github', '.codex-plugin', 'plugin.json'),
      JSON.stringify({ name: 'github', skills: './skills/', mcpServers: './.mcp.json' }),
    );
    writeFile(
      join(home, '.codex', 'plugins', 'github', 'skills', 'triage', 'SKILL.md'),
      ['---', 'name: triage', 'description: Triage GitHub issues.', '---'].join('\n'),
    );
    writeFile(
      join(home, '.codex', 'plugins', 'github', '.mcp.json'),
      JSON.stringify({
        mcpServers: {
          github: {
            type: 'http',
            url: 'https://api.githubcopilot.com/mcp/',
            bearer_token_env_var: 'GITHUB_PAT_TOKEN',
            tools: ['issues.search'],
          },
        },
      }),
    );
    writeFile(join(home, '.codex', 'config.toml'), ['[plugins."github@openai-curated"]', 'enabled = false'].join('\n'));

    const hidden = await scanCodexContextEntries(cwd, { homeDir: home, resource: 'plugin', discoverMcpTools: false });
    const visible = await scanCodexContextEntries(cwd, {
      homeDir: home,
      resource: 'plugin',
      includeDisabled: true,
      discoverMcpTools: false,
    });

    expect(hidden).toHaveLength(0);
    expect(visible).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: 'codex:plugin:github@openai-curated:skill:triage',
        context: expect.objectContaining({
          resource: 'plugin',
          enabled: false,
          controlMethod: 'plugins.github@openai-curated.enabled',
        }),
      }),
      expect.objectContaining({
        id: 'codex:plugin:github@openai-curated:mcp:github',
        source: 'mcp',
        name: 'github',
        url: 'https://api.githubcopilot.com/mcp/',
        envKeys: ['GITHUB_PAT_TOKEN'],
        toolAllowlist: ['issues.search'],
        context: expect.objectContaining({
          resource: 'plugin',
          enabled: false,
          configSource: join(home, '.codex', 'plugins', 'github', '.codex-plugin', 'plugin.json'),
          controlMethod: 'plugins.github@openai-curated.enabled',
        }),
      }),
    ]));
  });
});
