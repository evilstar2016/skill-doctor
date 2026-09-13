// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  startBenefitJob: vi.fn(),
  streamBenefitJob: vi.fn(),
  cancelBenefitJob: vi.fn(),
}));

vi.mock('../../web/src/api', () => mocks);

import { BenefitPage } from '../../web/src/pages/BenefitPage';
import type { BenefitReport } from '../../src/benefit/types';
import type { OfflineHistoryAnalysis } from '../../src/benefit/historyTypes';

const report = {
  schemaVersion: 1,
  kind: 'skill-doctor-codex-benefit-report',
  generatedAt: '2026-09-07T00:00:00.000Z',
  projectDir: '/tmp/project',
  codexHome: '/tmp/codex',
  window: { since: '2026-09-06T00:00:00.000Z', until: '2026-09-07T00:00:00.000Z', timezone: 'Asia/Shanghai' },
  selection: { requestedLimit: 20, selectedSessions: 1, selectedResponseCount: 2, associatedFileCount: 1, includeArchived: false },
  planCoverage: { status: 'matched', inventoryStatus: 'matched', historicalSnapshotCount: 1, matchedResourceCount: 1, unknownResourceCount: 0, mismatchResourceCount: 0, alreadyOptimizedResourceCount: 0, alreadyOptimizedResponseCount: 0, resources: [] },
  adapter: { id: 'fixture', version: '1', observedEventTypes: [] },
  scanCounts: { discoveredFiles: 1, projectCandidates: 1, selectedFiles: 1, skippedFiles: 0, skippedByReason: {} },
  index: { enabled: true, cacheHits: 0, incrementalFiles: 1, rebuiltFiles: 0 },
  baseline: { inputTokens: 300, cachedInputTokens: 0, cacheWriteInputTokens: 0, outputTokens: 30, reasoningOutputTokens: 2, totalTokens: 330, responseCount: 2, coveredResponseCount: 2, affectedResponseCount: 1 },
  projected: { inputTokens: 200, cachedInputTokens: 0, cacheWriteInputTokens: 0, outputTokens: 30, reasoningOutputTokens: 2, totalTokens: 230, responseCount: 2, coveredResponseCount: 2, affectedResponseCount: 1 },
  savings: { inputTokens: 100, inputTokenPercent: 33.33, totalTokens: 100, totalTokenPercent: 30.3, status: 'estimated' },
  scenarios: [],
  modelCosts: [],
  costCoverage: { pricedResponseCount: 2, unpricedResponseCount: 0, pricedInputTokens: 300, totalInputTokens: 300, responsePercent: 100, inputTokenPercent: 100 },
  sessions: [],
  responses: [
    { responseId: 'response-a', sessionId: 'session-a', threadId: 'thread-a', turnId: 'turn-a', timestamp: '2026-09-06T01:00:00.000Z', model: 'model-a', evidence: 'text-reconstructed', before: { inputTokens: 100, cachedInputTokens: 0, cacheWriteInputTokens: 0, outputTokens: 10, reasoningOutputTokens: 0, totalTokens: 110 }, estimatedInputSavings: 100, status: 'estimated', sourcePath: '/tmp/a.jsonl', line: 12, resourceMatches: [] },
    { responseId: 'response-b', sessionId: 'session-b', threadId: 'thread-b', turnId: 'turn-b', timestamp: '2026-09-06T02:00:00.000Z', model: 'model-b', evidence: 'unknown', before: { inputTokens: 200, cachedInputTokens: 0, cacheWriteInputTokens: 0, outputTokens: 20, reasoningOutputTokens: 0, totalTokens: 220 }, status: 'unknown', sourcePath: '/tmp/b.jsonl', line: 22 },
  ],
  coverage: { responsePercent: 100, inputTokenPercent: 100, affectedResponsePercent: 50, completeUsagePercent: 100 },
  simulation: { method: 'historical-context-text-diff', source: 'skill-doctor-plan', tokenizer: { mode: 'approx', model: 'gpt-4o', fallback: true }, outputHeldConstant: true, reexecutedCodex: false, cacheScenarioIds: [] },
  evidence: { historicalContextSnapshotCount: 1, historicalTextSnapshotCount: 1, historicalTextTokenCount: 20, textReconstructedResponseCount: 1, textReconstructedSavingsTokens: 100, tokenizer: { mode: 'approx', model: 'gpt-4o', fallback: true }, dynamicResourceTextReconstructed: true, planEstimateEvidence: 'static-optimizer-estimate' },
  provenance: { sampleResponseIds: ['response-a', 'response-b'], readBoundaries: [] },
  diagnostics: [],
  limitations: [],
  resourceContributions: [],
} as BenefitReport;

const historyAnalysis: OfflineHistoryAnalysis = {
  mode: 'latest-catalog-projection',
  assumption: 'simulation',
  historyCoverage: { since: '2026-09-06T00:00:00.000Z', until: '2026-09-07T00:00:00.000Z', sessionCount: 2, fileCount: 2, includesArchived: true, limited: false, incompleteFiles: 0, userMessages: 3 },
  catalogSources: [{ kind: 'recommended_plugins', sessionId: 'session-a', timestamp: '2026-09-06T01:00:00.000Z', sourcePath: '/tmp/catalog.jsonl', line: 10, sha256: 'catalog-hash' }],
  usageProfile: [
    { kind: 'recommended_plugins', name: 'Unused plugin', id: 'unused@remote', sourcePath: '/tmp/unused', explicitMentionCount: 0, activationCount: 0, observedReadCount: 0, usedSessionCount: 0, evidence: [], recommendation: 'review-disable', control: 'source-supported', controlMethod: 'tool_suggest.disabled_tools', reason: 'No reliable use observed.' },
    { kind: 'skills_instructions', name: 'Unknown skill', id: 'unknown-skill', sourcePath: '/plugins/cache/unknown/SKILL.md', explicitMentionCount: 0, activationCount: 0, observedReadCount: 0, usedSessionCount: 0, evidence: [], recommendation: 'unknown', control: 'unverified', reason: 'History is incomplete.' },
    { kind: 'skills_instructions', name: 'Retained skill', id: 'retained-skill', sourcePath: '/tmp/retained/SKILL.md', explicitMentionCount: 1, activationCount: 1, observedReadCount: 0, usedSessionCount: 1, evidence: [{ sessionId: 'session-a', sourcePath: '/tmp/a.jsonl', line: 20, kind: 'activation' }], recommendation: 'retain', control: 'source-supported', controlMethod: 'skills.config', reason: 'Used.' },
  ],
  baselineSession: { sessionId: 'session-a', sourcePath: '/tmp/a.jsonl', firstTimestamp: '2026-09-06T01:00:00.000Z', lastTimestamp: '2026-09-06T02:00:00.000Z', rule: 'longest main session', userMessageCount: 2, userMessageItemCount: 2, distinctTurnCount: 2, completedTurnCount: 2, responseCount: 2 },
  childUsage: { responseCount: 0, inputTokens: 0, cachedInputTokens: 0 },
  descriptionTokensPerResponse: 120,
  blockDeltas: { skills_instructions: 40, recommended_plugins: 80 },
  pluginControl: { perId: 'tool_suggest.disabled_tools', wholeBlock: 'features.tool_suggest=false', runtimeVerified: false, replacementRisk: true, wholeBlockSelected: false, impact: 'installation suggestions' },
  firstResponse: { responseId: 'response-a', sessionId: 'session-a', timestamp: '2026-09-06T01:00:00.000Z', model: 'model-a', before: { inputTokens: 100, cachedInputTokens: 20, cacheWriteInputTokens: 0, outputTokens: 10, reasoningOutputTokens: 0, totalTokens: 110 }, descriptionTokens: 120, cacheAttribution: { lower: 20, upper: 20, cachedRead: 20, cacheWrite: 0, ordinary: 100 } },
  firstInteraction: { turnId: 'turn-a', responseCount: 1, inputTokens: 100, cachedInputTokens: 20, cacheWriteInputTokens: 0, descriptionTokens: 120, unknownResponses: 0, cachedReadSavings: 20, cacheWriteSavings: 0, ordinarySavings: 100 },
  turnBreakdown: [],
  responses: [],
  historicalReplay: { inputTokens: 120, coveredResponses: 1, unknownResponses: 1 },
};

const historyReport = { ...report, historyAnalysis } as BenefitReport;

describe('BenefitPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.startBenefitJob.mockResolvedValue('benefit-job-1');
    mocks.streamBenefitJob.mockImplementation((_id, handlers) => {
      handlers.progress({ phase: 'parsing', message: 'Parsing fixture', completed: 1, total: 4 });
      setTimeout(() => handlers.complete(report), 10);
      return () => {};
    });
  });

  afterEach(() => cleanup());

  it('guides users to persistent context and switches the per-model costs with the scenario', async () => {
    const baseline = { status: 'estimated' as const, currency: 'USD', amount: 1 };
    const scenario = (id: BenefitReport['scenarios'][number]['id'], label: string, amount: number) => ({
      id, label, assumption: 'Scenario assumption', baseline, projected: { ...baseline, amount },
      modelCosts: [{ model: 'scenario-model', responseCount: 2, pricedResponseCount: 2, baseline, projected: { ...baseline, amount } }],
    });
    mocks.streamBenefitJob.mockImplementation((_id, handlers) => {
      handlers.complete({ ...report, scenarios: [scenario('persistent-context', '持续上下文扣减（推荐）', 0.9), scenario('historical-cache', '历史缓存比例延续', 0.8)] });
      return () => {};
    });
    render(<BenefitPage projectDir="/tmp/project" tokenizer="approx" tokenizerModel="gpt-4o" />);
    fireEvent.click(screen.getByRole('button', { name: '分析项目历史' }));
    const recommended = await screen.findByRole('button', { name: '持续上下文扣减（推荐）' });
    expect(recommended.classList.contains('active')).toBe(true);
    expect(screen.getAllByText('USD 1.000000 → USD 0.900000')).toHaveLength(2);
    fireEvent.click(screen.getByRole('button', { name: '历史缓存比例延续' }));
    expect(screen.getAllByText('USD 1.000000 → USD 0.800000')).toHaveLength(2);
    expect(screen.queryByText('USD 1.000000 → USD 0.900000')).toBeNull();
  });

  it('shows progress, supports turn/model/session filters, and paginates the trace table', async () => {
    render(<BenefitPage projectDir="/tmp/project" tokenizer="approx" tokenizerModel="gpt-4o" />);
    expect(screen.getByText('分析模式')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '分析项目历史' }));

    expect(await screen.findByText('Parsing fixture')).toBeTruthy();
    expect(await screen.findByText('逐响应明细')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'CSV' })).toBeTruthy();
    expect(mocks.startBenefitJob.mock.calls[0][0]).not.toHaveProperty('sinceHours');
    expect(mocks.startBenefitJob.mock.calls[0][0]).not.toHaveProperty('limit');
    expect(mocks.startBenefitJob.mock.calls[0][0].includeArchived).toBe(true);
    expect(screen.getByText('response-a')).toBeTruthy();
    expect(screen.getByText('response-b')).toBeTruthy();

    const selects = screen.getAllByRole('combobox');
    fireEvent.change(selects[2], { target: { value: 'turn-a' } });
    await waitFor(() => {
      expect(screen.getByText('response-a')).toBeTruthy();
      expect(screen.queryByText('response-b')).toBeNull();
    });
    expect(screen.getByText('来源行 12；展开可查看资源匹配')).toBeTruthy();
  });

  it('cancels the active job when the user presses cancel', async () => {
    mocks.streamBenefitJob.mockImplementation((_id, handlers) => {
      handlers.progress({ phase: 'reading', message: 'Reading fixture', completed: 0, total: 4 });
      return () => {};
    });
    render(<BenefitPage projectDir="/tmp/project" tokenizer="approx" tokenizerModel="gpt-4o" />);
    fireEvent.click(screen.getByRole('button', { name: '分析项目历史' }));
    fireEvent.click(await screen.findByRole('button', { name: '取消分析' }));

    expect(mocks.cancelBenefitJob).toHaveBeenCalledWith('benefit-job-1');
  });

  it('puts history recommendations first and keeps the calculation basis in a separate view', async () => {
    mocks.streamBenefitJob.mockImplementation((_id, handlers) => {
      handlers.complete(historyReport);
      return () => {};
    });
    render(<BenefitPage projectDir="/tmp/project" tokenizer="approx" tokenizerModel="gpt-4o" />);
    fireEvent.click(screen.getByRole('button', { name: '分析项目历史' }));

    expect(await screen.findByRole('heading', { name: '优化建议' })).toBeTruthy();
    expect(screen.getByText('Unused plugin')).toBeTruthy();
    expect(screen.getByText('控制待确认')).toBeTruthy();
    expect(screen.queryByText('逐响应明细')).toBeNull();
    expect(screen.getByRole('button', { name: 'Agent 协助' })).toBeTruthy();

    fireEvent.click(screen.getByRole('tab', { name: '收益依据' }));
    expect(await screen.findByRole('heading', { name: '收益依据' })).toBeTruthy();
    expect(screen.getByText('分析了哪些历史')).toBeTruthy();
    expect(screen.getByText('一次交互可触发多次响应', { exact: false })).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Agent 协助' }));
    expect(await screen.findByRole('dialog', { name: '让 Agent + Skill 协助审阅' })).toBeTruthy();
    expect(screen.getByDisplayValue(/skill-doctor-context-optimizer/)).toBeTruthy();
    fireEvent.keyDown(window, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog', { name: '让 Agent + Skill 协助审阅' })).toBeNull());
  });

  it('marks historical recommendations as Codex-only for other agents', () => {
    render(<BenefitPage projectDir="/tmp/project" platform="workbuddy" tokenizer="approx" tokenizerModel="gpt-4o" />);

    expect(screen.getByText('仅支持 Codex')).toBeTruthy();
    expect(screen.getByText('历史优化建议目前仅支持 Codex')).toBeTruthy();
    expect(screen.queryByText('分析模式')).toBeNull();
  });
});
