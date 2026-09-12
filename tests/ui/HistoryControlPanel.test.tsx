// @vitest-environment jsdom
import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { OfflineHistoryAnalysis } from '../../src/benefit/historyTypes';
const mocks = vi.hoisted(() => ({ previewBenefitControl: vi.fn(), applyBenefitControl: vi.fn(), undoBenefitControl: vi.fn() }));
vi.mock('../../web/src/api', () => mocks);
import { HistoryControlPanel } from '../../web/src/components/HistoryControlPanel';

const history = { usageProfile: [
  { kind: 'recommended_plugins', id: 'figma@remote', name: 'Figma', recommendation: 'retain', control: 'source-supported', explicitMentionCount: 2, activationCount: 1, observedReadCount: 0, usedSessionCount: 1, evidence: [], reason: 'Used' },
  { kind: 'skills_instructions', id: 'unsafe', name: 'Plugin Skill', recommendation: 'review-disable', control: 'unverified', sourcePath: '/plugins/cache/p/SKILL.md', evidence: [] },
  { kind: 'recommended_plugins', id: 'unused@remote', name: 'Unused', recommendation: 'review-disable', control: 'source-supported', explicitMentionCount: 0, activationCount: 0, observedReadCount: 0, usedSessionCount: 0, evidence: [], reason: 'Unused' },
], pluginControl: {
  perId: 'tool_suggest.disabled_tools', wholeBlock: 'features.tool_suggest=false', runtimeVerified: false, replacementRisk: true, wholeBlockSelected: false, impact: 'installation suggestions',
} } as unknown as OfflineHistoryAnalysis;
const controlPreview = {
  target: { kind: 'recommendations', id: 'recommended_plugins' },
  enabled: false,
  projectDir: '/project',
  configPath: '/project/.codex/config.toml',
  digest: 'fresh',
  changed: true,
  scope: 'project',
  requiresNewSession: true,
  warnings: ['Runtime savings require a new session.'],
};
afterEach(() => { cleanup(); vi.resetAllMocks(); });
describe('HistoryControlPanel', () => {
  it('previews project block control and never applies until confirmation', async () => {
    mocks.previewBenefitControl.mockResolvedValue(controlPreview);
    mocks.applyBenefitControl.mockResolvedValue({ operationId: 'operation', configPath: '/project/.codex/config.toml' });
    render(<HistoryControlPanel history={history} jobId="job" projectDir="/project" />);
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'all' } });
    expect(screen.getByRole('option', { name: '建议保留' })).toBeTruthy();
    expect(screen.getByText('显式引用 2 · 激活 1 · 读取 0 · 使用会话 1')).toBeTruthy();
    expect(screen.getByText(/使用 skill-doctor-context-optimizer 分析项目 \/project/)).toBeTruthy();
    expect(screen.getByText(/控制待验证/)).toBeTruthy();
    fireEvent.click(screen.getByRole('radio', { name: /仅此项目关闭全部推荐/ }));
    fireEvent.click(screen.getByRole('button', { name: '预览整块关闭' }));
    await screen.findByRole('heading', { name: /确认在此项目禁用/ });
    expect(mocks.applyBenefitControl).not.toHaveBeenCalled();
    expect(mocks.previewBenefitControl).toHaveBeenCalledWith({ jobId: 'job', kind: 'recommendations', id: 'recommended_plugins', enabled: false });
    fireEvent.click(screen.getByRole('button', { name: /确认在此项目禁用/ }));
    await waitFor(() => expect(mocks.applyBenefitControl).toHaveBeenCalledWith({ jobId: 'job', kind: 'recommendations', id: 'recommended_plugins', enabled: false, confirmation: 'fresh' }));
    await screen.findByText('operation');
    mocks.undoBenefitControl.mockResolvedValue({ operationId: 'operation' });
    fireEvent.click(screen.getByRole('button', { name: '撤销最近这次操作' }));
    expect(mocks.undoBenefitControl).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: '确认恢复操作前配置' }));
    await waitFor(() => expect(mocks.undoBenefitControl).toHaveBeenCalledWith('job', 'operation'));
  });
  it('cancels a preview and surfaces a failed preview without a write', async () => {
    mocks.previewBenefitControl.mockResolvedValueOnce(controlPreview).mockRejectedValueOnce(new Error('stale'));
    render(<HistoryControlPanel history={history} jobId="job" projectDir="/project" />);
    fireEvent.click(screen.getByRole('button', { name: '审阅禁用' }));
    await screen.findByRole('heading', { name: /Unused/ });
    fireEvent.click(screen.getByRole('button', { name: '预览此项目的禁用' }));
    await screen.findByRole('heading', { name: /确认在此项目禁用/ });
    fireEvent.click(screen.getByRole('button', { name: '返回审阅' }));
    expect(screen.queryByRole('heading', { name: /确认在此项目禁用/ })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: '审阅禁用' }));
    fireEvent.click(screen.getByRole('button', { name: '预览此项目的禁用' }));
    await screen.findByRole('alert');
    expect(mocks.applyBenefitControl).not.toHaveBeenCalled();
  });
});
