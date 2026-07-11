// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getBootstrap: vi.fn(),
  detectAgents: vi.fn(),
  getResourceDetail: vi.fn(),
  startScan: vi.fn(),
  streamScan: vi.fn(),
}));

vi.mock('../../web/src/api', () => ({
  ...mocks,
  cancelScan: vi.fn(), cleanupDuplicate: vi.fn(), compareResources: vi.fn(), getResourceDetail: mocks.getResourceDetail,
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
  });

  it('waits for confirmation, recommends the project agent, then starts the first scan', async () => {
    render(<App />);

    expect(await screen.findByText('确认检查目标')).toBeTruthy();
    expect(mocks.startScan).not.toHaveBeenCalled();
    const codexButton = within(screen.getByRole('dialog')).getByRole('button', { name: /Codex/ });
    await waitFor(() => expect(codexButton.className).toContain('active'));

    fireEvent.click(screen.getByRole('button', { name: /开始体检/ }));

    await waitFor(() => expect(mocks.startScan).toHaveBeenCalledWith(expect.objectContaining({ projectDir: '/tmp/project', platform: 'codex' })));
    const agentBar = await screen.findByLabelText('选择要体检的 Agent');
    fireEvent.click(within(agentBar).getByRole('button', { name: '全部' }));
    await waitFor(() => expect(mocks.startScan).toHaveBeenLastCalledWith(expect.objectContaining({ platform: 'all' })));

    fireEvent.change(screen.getByLabelText('分析模式'), { target: { value: 'custom' } });
    expect(await screen.findByText('体检设置')).toBeTruthy();
    fireEvent.click(screen.getByLabelText('解释Tokenizer'));
    expect(screen.getByText(/OpenAI tokenizer 提供更准确的估算/)).toBeTruthy();
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
});
