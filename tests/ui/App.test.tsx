// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getBootstrap: vi.fn(),
  detectAgents: vi.fn(),
  getResourceDetail: vi.fn(),
  startScan: vi.fn(),
  streamScan: vi.fn(),
  cancelScan: vi.fn(),
  getScanSources: vi.fn(),
  validateScanSources: vi.fn(),
  saveScanSources: vi.fn(),
  resetScanSources: vi.fn(),
  getTargetAgentSkills: vi.fn(),
  inspectSkillSource: vi.fn(),
  pickProjectDirectory: vi.fn(),
  pickSkillSourceDirectory: vi.fn(),
}));

vi.mock('../../web/src/api', () => ({
  ...mocks,
  cancelScan: mocks.cancelScan, cleanupDuplicate: vi.fn(), compareResources: vi.fn(), getResourceDetail: mocks.getResourceDetail,
  installSkill: vi.fn(), toggleContextResource: vi.fn(), uninstallSkill: vi.fn(),
}));

import App from '../../web/src/App';

const codexAgent = { platform: 'codex', displayName: 'Codex', projectDetected: true, globalDetected: false, recommended: true };
const snapshot = {
  id: 'snapshot', generatedAt: new Date(0).toISOString(), durationMs: 1, status: 'complete',
  target: { projectDir: '/tmp/project', scope: 'all', platform: 'codex' },
  summary: { resources: 0, issues: 0, high: 0, medium: 0, low: 0, conflicts: 0, duplicates: 0, security: 0, fixedTokens: 0, activationTokens: 0, disabledResources: 0, platforms: {}, scopes: {} },
  resources: [], issues: [], skills: [], conflicts: [], audit: { scanned: 0, findings: [], aiFindings: [], summary: { high: 0, med: 0, low: 0 } }, warnings: [],
  capabilities: { aiAuditConfigured: false, embeddingConfigured: false, canToggleCodexResources: false, canExecuteCleanup: false, canInstall: true, canUninstall: false, canExportDashboard: true },
};

describe('UI onboarding', () => {
  beforeEach(() => {
    cleanup();
    const values = new Map<string, string>();
    Object.defineProperty(window, 'localStorage', { configurable: true, value: {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, String(value)),
      removeItem: (key: string) => values.delete(key),
      clear: () => values.clear(),
      key: (index: number) => [...values.keys()][index] ?? null,
      get length() { return values.size; },
    } });
    localStorage.clear();
    vi.clearAllMocks();
    mocks.getBootstrap.mockResolvedValue({
      version: 'test', projectDir: '/tmp/project', configPath: '/tmp/config.json', defaultScope: 'all',
      supportedPlatforms: ['codex'], detectedAgents: [codexAgent], capabilities: snapshot.capabilities, registry: [], snapshot: null,
    });
    mocks.detectAgents.mockResolvedValue({ projectDir: '/tmp/project', agents: [codexAgent] });
    mocks.startScan.mockResolvedValue('scan-1');
    mocks.streamScan.mockImplementation((_id, handlers) => { queueMicrotask(() => handlers.complete(snapshot)); return () => {}; });
    const sources = [
      { id: 'global-codex-skills', platform: 'codex', resource: 'skill', scope: 'global', path: '~/.codex/skills', resolvedPath: '/tmp/home/.codex/skills', enabled: true, origin: 'builtin', status: 'missing', mode: 'recursive-dir', layout: 'skill-dirs' },
      { id: 'global-codex-mcp', platform: 'codex', resource: 'mcp', scope: 'global', path: '~/.codex/config.toml', resolvedPath: '/tmp/home/.codex/config.toml', enabled: true, origin: 'builtin', status: 'exists', format: 'toml' },
      { id: 'global-codex-plugins', platform: 'codex', resource: 'plugin', scope: 'global', path: '~/.codex/plugins/*/.codex-plugin/plugin.json', resolvedPath: '/tmp/home/.codex/plugins/*/.codex-plugin/plugin.json', enabled: true, origin: 'builtin', status: 'missing' },
    ];
    mocks.getScanSources.mockResolvedValue({ projectDir: '/tmp/project', configPath: '/tmp/config.json', sources });
    mocks.validateScanSources.mockImplementation(async (scanSources) => ({ valid: true, scanSources }));
    mocks.saveScanSources.mockResolvedValue({ saved: true, sources });
    mocks.resetScanSources.mockResolvedValue({ reset: true, sources });
    mocks.getTargetAgentSkills.mockResolvedValue({ targetPath: '/tmp/home/.codex/skills', scope: 'global', availableScopes: ['global', 'project'], skills: [] });
    mocks.pickSkillSourceDirectory.mockResolvedValue({ cancelled: true });
    mocks.pickProjectDirectory.mockResolvedValue({ cancelled: true });
  });

  it('switches the UI language and persists the selection', async () => {
    render(<App />);

    await screen.findByRole('button', { name: '切换到 English' });
    fireEvent.click(screen.getByRole('button', { name: '切换到 English' }));

    expect(await screen.findByRole('button', { name: 'Switch to Simplified Chinese' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Overview' })).toBeTruthy();
    expect(localStorage.getItem('skill-doctor-locale')).toBe('en-US');
    expect(document.documentElement.lang).toBe('en-US');
  });

  it('automatically scans the only project Agent and keeps cross-Agent overview secondary', async () => {
    render(<App />);

    await waitFor(() => expect(mocks.startScan).toHaveBeenCalledWith(expect.objectContaining({
      projectDir: '/tmp/project', platform: 'codex', discoverMcpTools: true,
    })));
    const agentBar = await screen.findByLabelText('选择要体检的 Agent');
    expect(within(agentBar).getByText('当前 Agent')).toBeTruthy();
    fireEvent.click(within(agentBar).getByRole('button', { name: '跨 Agent 总览' }));
    await waitFor(() => expect(mocks.startScan).toHaveBeenLastCalledWith(expect.objectContaining({ platform: 'all' })));
    expect(JSON.parse(localStorage.getItem('skill-doctor-project-preferences') ?? '{}')['/tmp/project'].platform).toBe('codex');

    fireEvent.change(screen.getByLabelText('分析模式'), { target: { value: 'custom' } });
    expect(await screen.findByText('体检设置')).toBeTruthy();
    fireEvent.click(screen.getByLabelText('解释Tokenizer'));
    expect(screen.getByText(/OpenAI tokenizer 提供更准确的估算/)).toBeTruthy();
  });

  it('requires an explicit choice when multiple project Agents are detected', async () => {
    const claudeAgent = { platform: 'claude', displayName: 'Claude', projectDetected: true, globalDetected: false, recommended: true };
    mocks.getBootstrap.mockResolvedValue({
      version: 'test', projectDir: '/tmp/project', configPath: '/tmp/config.json', defaultScope: 'all',
      supportedPlatforms: ['codex', 'claude'], detectedAgents: [codexAgent, claudeAgent], capabilities: snapshot.capabilities, registry: [], snapshot: null,
    });
    mocks.detectAgents.mockResolvedValue({ projectDir: '/tmp/project', agents: [codexAgent, claudeAgent] });

    render(<App />);

    expect(await screen.findByText('确认检查目标')).toBeTruthy();
    expect(mocks.startScan).not.toHaveBeenCalled();
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: /Claude/ }));
    fireEvent.click(screen.getByRole('button', { name: /开始体检/ }));
    await waitFor(() => expect(mocks.startScan).toHaveBeenCalledWith(expect.objectContaining({ platform: 'claude' })));
  });

  it('uses the startup directory by default and supports choosing another project directory', async () => {
    const claudeAgent = { platform: 'claude', displayName: 'Claude', projectDetected: true, globalDetected: false, recommended: true };
    mocks.getBootstrap.mockResolvedValue({
      version: 'test', projectDir: '/tmp/project', configPath: '/tmp/config.json', defaultScope: 'all',
      supportedPlatforms: ['codex', 'claude'], detectedAgents: [codexAgent, claudeAgent], capabilities: snapshot.capabilities, registry: [], snapshot: null,
    });
    mocks.pickProjectDirectory.mockResolvedValue({ projectDir: '/tmp/selected-project' });

    render(<App />);

    const projectDirectory = await screen.findByLabelText('项目目录');
    expect((projectDirectory as HTMLInputElement).value).toBe('/tmp/project');
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: '选择目录' }));
    await waitFor(() => expect((projectDirectory as HTMLInputElement).value).toBe('/tmp/selected-project'));
  });

  it('restores a valid project Agent preference and ignores legacy all preferences', async () => {
    localStorage.setItem('skill-doctor-project-preferences', JSON.stringify({ '/tmp/project': { platform: 'codex' } }));
    render(<App />);
    await waitFor(() => expect(mocks.startScan).toHaveBeenCalledWith(expect.objectContaining({ platform: 'codex' })));

    cleanup();
    localStorage.clear();
    const claudeAgent = { platform: 'claude', displayName: 'Claude', projectDetected: true, globalDetected: false, recommended: true };
    localStorage.setItem('skill-doctor-project-preferences', JSON.stringify({ '/tmp/project': { platform: 'all' } }));
    mocks.getBootstrap.mockResolvedValue({
      version: 'test', projectDir: '/tmp/project', configPath: '/tmp/config.json', defaultScope: 'all',
      supportedPlatforms: ['codex', 'claude'], detectedAgents: [codexAgent, claudeAgent], capabilities: snapshot.capabilities, registry: [], snapshot: null,
    });
    render(<App />);
    expect(await screen.findByText('确认检查目标')).toBeTruthy();
    expect(mocks.startScan).toHaveBeenCalledTimes(1);

    cleanup();
    vi.clearAllMocks();
    localStorage.clear();
    localStorage.setItem('skill-doctor-project-preferences', JSON.stringify({ '/tmp/project': { platform: 'opencode' } }));
    mocks.getBootstrap.mockResolvedValue({
      version: 'test', projectDir: '/tmp/project', configPath: '/tmp/config.json', defaultScope: 'all',
      supportedPlatforms: ['codex', 'claude'], detectedAgents: [codexAgent, claudeAgent], capabilities: snapshot.capabilities, registry: [], snapshot: null,
    });
    render(<App />);
    expect(await screen.findByText('确认检查目标')).toBeTruthy();
    expect(mocks.startScan).not.toHaveBeenCalled();
  });

  it('ignores a completed scan after switching Agents', async () => {
    const claudeAgent = { platform: 'claude', displayName: 'Claude', projectDetected: false, globalDetected: true, recommended: false };
    const handlers: Array<{ complete: (value: typeof snapshot) => void }> = [];
    mocks.getBootstrap.mockResolvedValue({
      version: 'test', projectDir: '/tmp/project', configPath: '/tmp/config.json', defaultScope: 'all',
      supportedPlatforms: ['codex', 'claude'], detectedAgents: [codexAgent, claudeAgent], capabilities: snapshot.capabilities, registry: [], snapshot: null,
    });
    mocks.startScan.mockResolvedValueOnce('scan-1').mockResolvedValueOnce('scan-2');
    mocks.streamScan.mockImplementation((_id, nextHandlers) => { handlers.push(nextHandlers); return () => {}; });

    render(<App />);
    const agentBar = await screen.findByLabelText('选择要体检的 Agent');
    await waitFor(() => expect(mocks.startScan).toHaveBeenCalledWith(expect.objectContaining({ platform: 'codex' })));
    fireEvent.click(within(agentBar).getByRole('button', { name: 'Claude' }));
    await waitFor(() => expect(mocks.startScan).toHaveBeenCalledWith(expect.objectContaining({ platform: 'claude' })));
    handlers[0].complete(snapshot);
    handlers[1].complete({ ...snapshot, target: { ...snapshot.target, platform: 'claude' } });
    await waitFor(() => expect(screen.getByText('体检结果已更新')).toBeTruthy());
    expect(mocks.cancelScan).toHaveBeenCalledWith('scan-1');
  });

  it('shows a shared resource once with every agent consumer and impact notice', async () => {
    const sharedResource = {
      id: 'shared-resource', name: 'shared-reviewer', kind: 'skill', kindLabel: 'Skill', sourcePath: '/tmp/project/.agents/skills/shared-reviewer/SKILL.md',
      platform: 'copilot', scope: 'project', shared: true,
      consumers: [
        { platform: 'copilot', scope: 'project', fixedTokens: 0, activationTokens: 10 },
        { platform: 'codex', scope: 'project', fixedTokens: 0, activationTokens: 10 },
        { platform: 'windsurf', scope: 'project', fixedTokens: 0, activationTokens: 10 },
      ],
      description: 'Shared review skill', triggers: [], controllable: false, fixedTokens: 0, activationTokens: 30, issueIds: [], status: 'healthy',
    };
    mocks.getBootstrap.mockResolvedValue({
      version: 'test', projectDir: '/tmp/project', configPath: '/tmp/config.json', defaultScope: 'all',
      supportedPlatforms: ['copilot', 'codex', 'windsurf'], detectedAgents: [codexAgent], capabilities: snapshot.capabilities, registry: [],
      snapshot: { ...snapshot, resources: [sharedResource], summary: { ...snapshot.summary, resources: 1, platforms: { copilot: 1, codex: 1, windsurf: 1 } } },
    });
    mocks.getResourceDetail.mockResolvedValue({ resource: sharedResource, issues: [] });

    render(<App />);
    fireEvent.click(await screen.findByRole('button', { name: '资源清单' }));

    expect(await screen.findByText('共享 · 3 Agent')).toBeTruthy();
    fireEvent.click(screen.getByText('shared-reviewer'));
    expect(await screen.findByText(/修改这个文件会同时影响以下 3 个 Agent/)).toBeTruthy();
    expect(screen.getAllByText('Codex').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Windsurf').length).toBeGreaterThan(0);
  });

  it('labels consumers outside the current scan as not calculated', async () => {
    const sharedResource = {
      id: 'shared-resource', name: 'shared-reviewer', kind: 'skill', kindLabel: 'Skill', sourcePath: '/tmp/project/.agents/skills/shared-reviewer/SKILL.md',
      platform: 'codex', scope: 'project', shared: true,
      consumers: [
        { platform: 'codex', scope: 'project', fixedTokens: 30, activationTokens: 10 },
        { platform: 'windsurf', scope: 'project' },
      ],
      triggers: [], controllable: false, fixedTokens: 30, activationTokens: 10, issueIds: [], status: 'healthy',
    };
    mocks.getBootstrap.mockResolvedValue({
      version: 'test', projectDir: '/tmp/project', configPath: '/tmp/config.json', defaultScope: 'all',
      supportedPlatforms: ['codex', 'windsurf'], detectedAgents: [codexAgent], capabilities: snapshot.capabilities, registry: [], snapshot: { ...snapshot, resources: [sharedResource] },
    });
    mocks.getResourceDetail.mockResolvedValue({ resource: sharedResource, issues: [] });

    render(<App />);
    fireEvent.click(await screen.findByRole('button', { name: '资源清单' }));
    fireEvent.click(screen.getByText('shared-reviewer'));
    expect(await screen.findByText('本次未计算')).toBeTruthy();
  });

  it('shows the real member paths for a Codex skill-list aggregate', async () => {
    const sourcePaths = [
      '/tmp/home/.codex/skills/global-helper/SKILL.md',
      '/tmp/project/.codex/skills/project-helper/SKILL.md',
    ];
    const aggregate = {
      id: 'aggregate-resource', name: 'Codex skill list', kind: 'skill', kindLabel: 'Skill', sourcePath: '/tmp', sourcePaths,
      platform: 'codex', scope: 'project', shared: false,
      consumers: [{ platform: 'codex', scope: 'project', fixedTokens: 120, activationTokens: 120 }],
      triggers: [], controllable: true, fixedTokens: 120, activationTokens: 120, issueIds: [], status: 'healthy',
    };
    const contextItem = {
      id: 'codex:skill-list:enabled', name: 'Codex skill list', sourcePath: '/tmp', sourcePaths,
      platform: 'codex', scope: 'project', resource: 'skill', kind: 'codex-skill-list',
      estimatedTokens: 120, estimatedChars: 480, activationEstimatedTokens: 120, activationEstimatedChars: 480,
      activation: 'startup', budgetScope: 'startup-selection', confidence: 'high', enabled: true, controllable: true,
      estimateStatus: 'estimated', recommendation: 'OK',
    };
    const context = {
      summary: { totalEstimatedTokens: 120, budgetTokens: 2000, grade: 'A', overBudget: false, scanned: 2, tokenizer: { mode: 'openai' }, byPlatform: [] },
      items: [contextItem],
    };
    mocks.getBootstrap.mockResolvedValue({
      version: 'test', projectDir: '/tmp/project', configPath: '/tmp/config.json', defaultScope: 'all',
      supportedPlatforms: ['codex'], detectedAgents: [codexAgent], capabilities: snapshot.capabilities, registry: [],
      snapshot: { ...snapshot, context, resources: [aggregate], summary: { ...snapshot.summary, resources: 1, fixedTokens: 120, activationTokens: 120, platforms: { codex: 1 } } },
    });
    mocks.getResourceDetail.mockResolvedValue({ resource: aggregate, issues: [] });

    render(<App />);
    const contextButtons = await screen.findAllByRole('button', { name: '上下文成本' });
    fireEvent.click(contextButtons[contextButtons.length - 1]);
    const aggregateLinks = await screen.findAllByText('Codex skill list');
    fireEvent.click(aggregateLinks[aggregateLinks.length - 1]);

    expect(await screen.findByText('聚合来源（2）')).toBeTruthy();
    expect(screen.getByText(sourcePaths[0])).toBeTruthy();
    expect(screen.getByText(sourcePaths[1])).toBeTruthy();
    expect(screen.queryByText('/tmp')).toBeNull();
  });

  it('shows defaults and supports adding, saving and resetting Agent scan paths', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    mocks.getBootstrap.mockResolvedValue({
      version: 'test', projectDir: '/tmp/project', configPath: '/tmp/config.json', defaultScope: 'all',
      supportedPlatforms: ['codex'], detectedAgents: [codexAgent], capabilities: snapshot.capabilities, registry: [], snapshot,
    });
    render(<App />);

    const scanPathButtons = await screen.findAllByRole('button', { name: '扫描路径' });
    fireEvent.click(scanPathButtons[scanPathButtons.length - 1]);
    expect(await screen.findByDisplayValue('~/.codex/skills')).toBeTruthy();
    expect(screen.getAllByText('不存在').length).toBeGreaterThan(0);
    expect(screen.getAllByText('系统默认').length).toBeGreaterThan(0);

    fireEvent.click(screen.getAllByRole('button', { name: '添加路径' })[0]);
    const skillPaths = screen.getAllByLabelText('Codex Skill 路径路径');
    fireEvent.change(skillPaths[skillPaths.length - 1], { target: { value: '/tmp/custom-skills' } });
    const saveButtons = screen.getAllByRole('button', { name: /^保存$/ });
    fireEvent.click(saveButtons[saveButtons.length - 1]);
    await waitFor(() => expect(mocks.validateScanSources).toHaveBeenCalledWith(expect.objectContaining({
      codex: expect.objectContaining({ skills: expect.arrayContaining([expect.objectContaining({ path: '/tmp/custom-skills' })]) }),
    })));
    expect(mocks.saveScanSources).toHaveBeenCalled();

    const resetButtons = screen.getAllByRole('button', { name: /恢复当前 Agent 默认/ });
    fireEvent.click(resetButtons[resetButtons.length - 1]);
    await waitFor(() => expect(mocks.resetScanSources).toHaveBeenCalledWith('codex'));
  });
});
