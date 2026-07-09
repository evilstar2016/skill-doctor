import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { scanMcpServers } from '../../src/mcp/scanMcpServers';

const tempRoots: string[] = [];

afterEach(() => {
  for (const root of tempRoots) {
    rmSync(root, { recursive: true, force: true });
  }
  tempRoots.length = 0;
});

function tempRoot(): string {
  const root = mkdtempSync(join(tmpdir(), 'skill-doctor-mcp-'));
  tempRoots.push(root);
  return root;
}

function writeFile(filePath: string, content: string): void {
  mkdirSync(dirname(filePath), { recursive: true });
  writeFileSync(filePath, content, 'utf8');
}

describe('scanMcpServers', () => {
  it('parses Codex TOML MCP servers and excludes disabled entries', () => {
    const root = tempRoot();
    const cwd = join(root, 'workspace');
    const home = join(root, 'home');

    writeFile(
      join(cwd, '.codex', 'config.toml'),
      [
        '[mcp_servers.github]',
        'command = "npx"',
        'args = ["-y", "@modelcontextprotocol/server-github"]',
        'transport = "stdio"',
        'instructions = "Use GitHub tools only when repository context is needed."',
        'enabled_tools = ["search_repositories"]',
        'disabled_tools = ["delete_repository"]',
        'default_tools_approval_mode = "prompt"',
        'timeout = 30000',
        '',
        '[mcp_servers.github.env]',
        'GITHUB_TOKEN = "super-secret"',
        '',
        '[mcp_servers.disabled_server]',
        'command = "node"',
        'disabled = true',
      ].join('\n'),
    );

    const result = scanMcpServers(cwd, { homeDir: home });

    expect(result).toHaveLength(1);
    expect(result[0]).toEqual(expect.objectContaining({
      name: 'github',
      platform: 'codex',
      scope: 'project',
      command: 'npx',
      args: ['-y', '@modelcontextprotocol/server-github'],
      instructions: 'Use GitHub tools only when repository context is needed.',
      envKeys: ['GITHUB_TOKEN'],
      toolAllowlist: ['search_repositories'],
      toolDenylist: ['delete_repository'],
      approvalMode: 'prompt',
      timeoutMs: 30000,
    }));
    expect(JSON.stringify(result)).not.toContain('super-secret');
  });

  it('can include disabled Codex MCP servers for context auditing', () => {
    const root = tempRoot();
    const cwd = join(root, 'workspace');
    const home = join(root, 'home');

    writeFile(
      join(cwd, '.codex', 'config.toml'),
      [
        '[mcp_servers.disabled_server]',
        'command = "node"',
        'enabled = false',
      ].join('\n'),
    );

    const result = scanMcpServers(cwd, { homeDir: home, includeDisabled: true });

    expect(result).toEqual([
      expect.objectContaining({
        name: 'disabled_server',
        enabled: false,
      }),
    ]);
  });

  it('parses Claude, Gemini, and Cursor JSON MCP config shapes', () => {
    const root = tempRoot();
    const cwd = join(root, 'workspace');
    const home = join(root, 'home');

    writeFile(
      join(cwd, '.mcp.json'),
      JSON.stringify({
        mcpServers: {
          local: {
            command: 'node',
            args: ['server.js'],
            env: { API_TOKEN: 'hidden-value' },
          },
        },
      }),
    );
    writeFile(
      join(cwd, '.gemini', 'settings.json'),
      JSON.stringify({
        mcp: {
          allowed: ['search'],
          excluded: ['delete'],
        },
        mcpServers: {
          docs: {
            url: 'https://mcp.example.test/sse',
            transport: 'sse',
          },
        },
      }),
    );
    writeFile(
      join(home, '.cursor', 'mcp.json'),
      JSON.stringify({
        mcpServers: {
          browser: {
            url: 'http://127.0.0.1:3333/mcp',
            headers: { Authorization: 'Bearer hidden' },
            disabledTools: ['close_tab'],
          },
        },
      }),
    );

    const result = scanMcpServers(cwd, { homeDir: home });
    const byPlatform = Object.fromEntries(result.map((server) => [`${server.platform}:${server.name}`, server]));

    expect(byPlatform['claude:local']).toEqual(expect.objectContaining({
      command: 'node',
      args: ['server.js'],
      envKeys: ['API_TOKEN'],
    }));
    expect(byPlatform['gemini:docs']).toEqual(expect.objectContaining({
      url: 'https://mcp.example.test/sse',
      transport: 'sse',
      toolAllowlist: ['search'],
      toolDenylist: ['delete'],
    }));
    expect(byPlatform['cursor:browser']).toEqual(expect.objectContaining({
      headerKeys: ['Authorization'],
      toolDenylist: ['close_tab'],
    }));
    expect(JSON.stringify(result)).not.toContain('hidden');
  });

  it('parses Copilot MCP repository config shapes and tools allowlists', () => {
    const root = tempRoot();
    const cwd = join(root, 'workspace');
    const home = join(root, 'home');

    writeFile(
      join(cwd, '.vscode', 'mcp.json'),
      JSON.stringify({
        mcpServers: {
          github: {
            type: 'http',
            url: 'https://api.githubcopilot.com/mcp/readonly',
            tools: ['repos.list', 'issues.search'],
            headers: { Authorization: 'Bearer hidden' },
          },
        },
      }),
    );
    writeFile(
      join(cwd, '.github', 'mcp.json'),
      JSON.stringify({
        mcpServers: {
          playwright: {
            command: 'npx',
            args: ['@playwright/mcp'],
            tools: ['browser_snapshot'],
          },
        },
      }),
    );

    const result = scanMcpServers(cwd, { homeDir: home });
    const byName = Object.fromEntries(result.map((server) => [server.name, server]));

    expect(byName.github).toEqual(expect.objectContaining({
      platform: 'copilot',
      scope: 'project',
      transport: 'http',
      url: 'https://api.githubcopilot.com/mcp/readonly',
      toolAllowlist: ['repos.list', 'issues.search'],
      headerKeys: ['Authorization'],
    }));
    expect(byName.playwright).toEqual(expect.objectContaining({
      platform: 'copilot',
      scope: 'project',
      command: 'npx',
      args: ['@playwright/mcp'],
      toolAllowlist: ['browser_snapshot'],
    }));
    expect(JSON.stringify(result)).not.toContain('hidden');
  });

  it('marks matching Claude user project entries as project scope', () => {
    const root = tempRoot();
    const cwd = join(root, 'workspace');
    const home = join(root, 'home');

    writeFile(
      join(home, '.claude.json'),
      JSON.stringify({
        mcpServers: {
          global_server: { command: 'node', args: ['global.js'] },
        },
        projects: {
          [cwd]: {
            mcpServers: {
              project_server: { command: 'node', args: ['project.js'] },
            },
          },
        },
      }),
    );

    const result = scanMcpServers(cwd, { homeDir: home });
    const byName = Object.fromEntries(result.map((server) => [server.name, server]));

    expect(byName.global_server).toEqual(expect.objectContaining({ scope: 'global' }));
    expect(byName.project_server).toEqual(expect.objectContaining({ scope: 'project' }));
  });
});
