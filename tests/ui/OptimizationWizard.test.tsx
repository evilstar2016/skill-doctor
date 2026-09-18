// @vitest-environment jsdom
import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { OptimizationOverview, OptimizationPreview } from '../../src/context/optimizationTypes';
import { OptimizationWizard } from '../../web/src/pages/OptimizationWizard';
import * as api from '../../web/src/api';

vi.mock('../../web/src/api', () => ({ loadOptimization: vi.fn(), previewOptimizationChange: vi.fn(), applyOptimizationChange: vi.fn(), checkOptimizationChange: vi.fn(), undoOptimizationChange: vi.fn() }));
const report: OptimizationOverview = {
  projectDir: '/project', generatedAt: '2026-09-18T12:00:00Z', period: 'month', periodStart: '2026-09-01T00:00:00Z', periodEnd: '2026-09-18T12:00:00Z', maxPriceModel: 'gpt-6-astra', priceDate: '2026-09-07', diagnostics: [],
  sessions: [{ id: 'session-one', timestamp: '2026-09-18T11:00:00Z', version: '0.154.0-alpha.6.2', model: 'gpt-6-astra', sourcePath: '/home/.codex/sessions/one.jsonl', completeHeader: true,
    usage: { inputTokens: 1000, cachedInputTokens: 800, cacheWriteInputTokens: 0, outputTokens: 100, reasoningOutputTokens: 20, totalTokens: 1100 }, responseCount: 3, turnCount: 2, cost: 0.0131, actualCost: 0.000292, costCoverage: 3, actualCostCoverage: 3,
    suggestions: [{ id: 'skill-catalog', scope: 'project', configPath: '/project/.codex/config.toml', configKey: 'skills.include_instructions', configuredOff: false, available: true, tokens: 140, cost: { lower: 0.001, upper: 0.01, currency: 'USD' }, actualCost: { lower: 0.0001, upper: 0.001, currency: 'USD' }, cumulative: { tokens: 420, coveredResponses: 3, pricedResponses: 3, actualPricedResponses: 3, cost: { lower: 0.003, upper: 0.03, currency: 'USD' }, actualCost: { lower: 0.0003, upper: 0.003, currency: 'USD' } } },
      { id: 'memory', scope: 'user', configPath: '/home/.codex/config.toml', configKey: 'memories.use_memories', configuredOff: false, available: true, tokens: 60 }] }],
};
const preview: OptimizationPreview = { target: 'skill-catalog', scope: 'project', configPath: '/project/.codex/config.toml', configKey: 'skills.include_instructions', after: false, confirmation: 'digest' };
const operation = { id: 'operation-id', projectDir: '/project', target: 'skill-catalog' as const, configPath: preview.configPath, createdAt: report.generatedAt, version: '0.154.0-alpha.6.2', status: 'pending' as const };

describe('optimization wizard', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    const values = new Map<string, string>();
    Object.defineProperty(window, 'localStorage', { configurable: true, value: {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
    } });
    vi.mocked(api.loadOptimization).mockResolvedValue(structuredClone(report));
    vi.mocked(api.previewOptimizationChange).mockResolvedValue(preview);
    vi.mocked(api.applyOptimizationChange).mockResolvedValue(operation);
    vi.mocked(api.checkOptimizationChange).mockResolvedValue({ status: 'removed', reason: 'fresh-header-observed', sessionId: 'new-task' });
    vi.mocked(api.undoOptimizationChange).mockResolvedValue({ ...operation, status: 'restored' });
  });
  afterEach(cleanup);
  async function open() { render(<OptimizationWizard projectDir="/project" />); await screen.findByRole('heading', { name: '先从哪项开始？' }); }
  it('starts with suggestions and shows recorded session costs without double-counting cache', async () => {
    await open();
    expect(screen.getByText('420')).toBeTruthy();
    expect(screen.getByText('1 个 task · 2 个 turn · 3 次模型响应')).toBeTruthy();
    expect(within(screen.getByRole('region', { name: '整段会话预计节省' })).getByText('$0.003 – $0.03')).toBeTruthy();
    expect(within(screen.getByRole('complementary', { name: '所选会话首轮 · 文本估算' })).getByText('140 Token')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '返回会话开销' }));
    expect(screen.getAllByText('1,100').length).toBeGreaterThan(0);
    expect(screen.getByText('其中缓存命中 800')).toBeTruthy();
    expect(screen.getAllByText('$0.0131').length).toBeGreaterThan(0);
  });
  it('keeps highest-price estimates as the default and exposes actual-model pricing subtly', async () => {
    await open();
    expect(screen.getByRole('button', { name: '切换费用计价方式' }).textContent).toContain('按实际使用模型');
    fireEvent.click(screen.getByRole('button', { name: '切换费用计价方式' }));
    expect(screen.getByText('$0.0003 – $0.003')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '返回会话开销' }));
    expect(screen.getAllByText('$0.000292').length).toBeGreaterThan(0);
    expect(screen.getByRole('button', { name: '切换费用计价方式' }).textContent).toContain('恢复最高价估算');
  });
  it('requires preview, keeps writes pending until verification, and confirms undo', async () => {
    await open();
    fireEvent.click(screen.getByRole('button', { name: '查看并确认修改' }));
    await screen.findByRole('region', { name: '确认这次修改' });
    expect(api.applyOptimizationChange).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: '确认修改 · 下个新会话生效' }));
    await screen.findByRole('heading', { name: '设置已更新，等待新会话验证' });
    expect(screen.queryByText('已验证：目标已从新会话头移除')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: '检查新会话' }));
    await screen.findByRole('heading', { name: '已验证：目标已从新会话头移除' });
    fireEvent.click(screen.getByRole('button', { name: '撤销修改' }));
    expect(api.undoOptimizationChange).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: '确认撤销' }));
    await screen.findByRole('heading', { name: '原设置已恢复' });
    expect(api.undoOptimizationChange).toHaveBeenCalledWith('/project', operation.id);
  });
  it('requires explicit global consent and clears confirmation when changing the selection', async () => {
    vi.mocked(api.previewOptimizationChange).mockResolvedValue({ ...preview, target: 'memory', scope: 'user', configKey: 'memories.use_memories' });
    await open();
    fireEvent.click(screen.getByRole('radio', { name: /停止注入记忆/ }));
    fireEvent.click(screen.getByRole('button', { name: '查看并确认修改' }));
    const apply = await screen.findByRole('button', { name: '确认修改 · 下个新会话生效' });
    expect((apply as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole('checkbox', { name: '我理解此修改影响本机所有 Codex 项目' }));
    expect((apply as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(screen.getByRole('radio', { name: /隐藏自动技能目录/ }));
    expect(screen.queryByRole('region', { name: '确认这次修改' })).toBeNull();
    expect(api.applyOptimizationChange).not.toHaveBeenCalled();
  });
  it('blocks unavailable actions and does not invent savings or usage for missing evidence', async () => {
    const unavailable = structuredClone(report);
    unavailable.sessions[0].usage = undefined; unavailable.sessions[0].cost = undefined;
    unavailable.sessions[0].suggestions[0] = { ...unavailable.sessions[0].suggestions[0], available: false, reason: 'incomplete-header', tokens: undefined, cost: undefined, cumulative: undefined };
    unavailable.sessions[0].suggestions[1].available = false;
    vi.mocked(api.loadOptimization).mockResolvedValue(unavailable);
    await open();
    expect((screen.getByRole('button', { name: '查看并确认修改' }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getAllByText('金额暂不可估').length).toBeGreaterThan(0);
    expect(screen.getByText('会话头不完整，暂不能提供此操作。')).toBeTruthy();
  });
  it('restores pending progress and reports errors without claiming success', async () => {
    localStorage.setItem('skill-doctor:optimization:/project', JSON.stringify(operation));
    vi.mocked(api.checkOptimizationChange).mockRejectedValue(new Error('Cannot read session'));
    render(<OptimizationWizard projectDir="/project" />);
    await screen.findByRole('heading', { name: '设置已更新，等待新会话验证' });
    fireEvent.click(screen.getByRole('button', { name: '检查新会话' }));
    await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('Cannot read session'));
    expect(screen.queryByText('已验证：目标已从新会话头移除')).toBeNull();
  });
  it('initially selects an actionable suggestion when the catalog is already disabled', async () => {
    const updated = structuredClone(report);
    updated.sessions[0].suggestions[0].available = false;
    vi.mocked(api.loadOptimization).mockResolvedValue(updated);
    await open();
    expect((screen.getByRole('radio', { name: /停止注入记忆/ }) as HTMLInputElement).checked).toBe(true);
  });
  it('labels incomplete token and price coverage next to the cumulative amount', async () => {
    const partial = structuredClone(report);
    partial.sessions[0].suggestions[0].cumulative = { tokens: 280, coveredResponses: 2, pricedResponses: 1, cost: { lower: 0.001, upper: 0.01, currency: 'USD' } };
    vi.mocked(api.loadOptimization).mockResolvedValue(partial);
    await open();
    expect(screen.getByRole('heading', { name: '已覆盖响应累计预计节省' })).toBeTruthy();
    expect(screen.getByText('金额仅含可估价的 1 次响应，非完整会话金额。')).toBeTruthy();
    expect(screen.getByText('上下文与用量覆盖 2 / 3 次响应；其中 1 次可估价。')).toBeTruthy();
  });
});
