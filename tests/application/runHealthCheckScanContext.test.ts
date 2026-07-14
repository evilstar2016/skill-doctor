import { describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  loadUserConfig: vi.fn(),
  scanSkills: vi.fn(),
  scanMcpServers: vi.fn(),
  discoverMcpToolsForServers: vi.fn(),
  scanCodexContextEntries: vi.fn(),
}));

vi.mock('../../src/config/loadUserConfig', () => ({
  loadUserConfig: mocks.loadUserConfig,
}));

vi.mock('../../src/discovery/scanSkills', () => ({
  scanSkills: mocks.scanSkills,
}));

vi.mock('../../src/mcp/scanMcpServers', () => ({
  scanMcpServers: mocks.scanMcpServers,
}));

vi.mock('../../src/mcp/listMcpTools', () => ({
  discoverMcpToolsForServers: mocks.discoverMcpToolsForServers,
}));

vi.mock('../../src/context/scanCodexContext', () => ({
  scanCodexContextEntries: mocks.scanCodexContextEntries,
}));

import { runHealthCheck } from '../../src/application/runHealthCheck';

describe('runHealthCheck scan context', () => {
  it('reuses one skill and MCP snapshot across health-check phases', async () => {
    const skill = {
      name: 'reviewer',
      sourcePath: '/tmp/project/.codex/skills/reviewer/SKILL.md',
      platform: 'codex' as const,
      scope: 'project' as const,
      description: 'Review pull requests.',
      triggers: ['review'],
    };
    const server = {
      source: 'mcp' as const,
      name: 'project-search',
      sourcePath: '/tmp/project/.codex/config.toml',
      platform: 'codex' as const,
      scope: 'project' as const,
      command: 'node',
      args: ['server.js'],
      envKeys: [],
      headerKeys: [],
      toolAllowlist: [],
      toolDenylist: [],
    };

    mocks.loadUserConfig.mockReturnValue({ config: {}, path: '/tmp/home/.skill-doctor/config.json' });
    mocks.scanSkills.mockResolvedValue([skill]);
    mocks.scanMcpServers.mockReturnValue([server]);
    mocks.discoverMcpToolsForServers.mockImplementation(async (servers) => servers.map((entry) => ({
      ...entry,
      toolDiscoveryStatus: 'ok' as const,
      tools: [{ name: 'search_project', description: 'Search project files.' }],
    })));
    mocks.scanCodexContextEntries.mockImplementation(async (_projectDir, options) => (
      options.discoverMcpToolsForServers([server])
    ));

    const snapshot = await runHealthCheck({
      projectDir: '/tmp/project',
      homeDir: '/tmp/home',
      includeGroups: false,
    });

    expect(mocks.loadUserConfig).toHaveBeenCalledTimes(1);
    expect(mocks.scanSkills).toHaveBeenCalledTimes(1);
    expect(mocks.scanMcpServers).toHaveBeenCalledTimes(1);
    expect(mocks.scanCodexContextEntries).toHaveBeenCalledTimes(1);
    expect(mocks.discoverMcpToolsForServers).toHaveBeenCalledTimes(1);
    expect(snapshot.audit.scanned).toBe(1);
    expect(snapshot.context?.items).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: 'project-search', kind: 'mcp-tool-list' }),
    ]));
  });
});
