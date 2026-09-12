// @vitest-environment jsdom
import React from 'react';
import { cleanup, render, screen, fireEvent } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { HistoryBenefitSummary } from '../../web/src/components/HistoryBenefitSummary';
import type { OfflineHistoryAnalysis } from '../../src/benefit/historyTypes';

const history: OfflineHistoryAnalysis = {
  mode: 'latest-catalog-projection', assumption: 'simulation',
  historyCoverage: { since: new Date(0).toISOString(), until: '2026-09-12T00:20:40Z', sessionCount: 66, fileCount: 137, includesArchived: true, limited: false, incompleteFiles: 0, userMessages: 20 },
  baselineSession: { sessionId: 'baseline-id', sourcePath: '/private/project/session.jsonl', firstTimestamp: '2026-09-06T14:40:36Z', lastTimestamp: '2026-09-09T13:48:17Z', rule: 'most responses', userMessageCount: 20, userMessageItemCount: 18, distinctTurnCount: 21, completedTurnCount: 21, responseCount: 895 },
  catalogSources: [{ kind: 'skills_instructions', sessionId: 'catalog-id', timestamp: '2026-09-11T14:40:30Z', sourcePath: '/private/project/catalog.jsonl', line: 32, sha256: 'test-catalog-hash' }],
  usageProfile: [], childUsage: { responseCount: 17, inputTokens: 580769, cachedInputTokens: 306944 },
  descriptionTokensPerResponse: 2040, blockDeltas: { skills_instructions: 771, recommended_plugins: 1269 },
  pluginControl: { perId: 'tool_suggest.disabled_tools', wholeBlock: 'features.tool_suggest=false', runtimeVerified: false, replacementRisk: true, wholeBlockSelected: false, impact: 'installation suggestions' },
  responses: [], turnBreakdown: [], historicalReplay: { inputTokens: 0, coveredResponses: 0, unknownResponses: 895 },
};

afterEach(cleanup);

describe('HistoryBenefitSummary', () => {
  it('shows scannable summary metrics and keeps technical evidence collapsed', () => {
    const { container } = render(<HistoryBenefitSummary history={history} />);
    expect(screen.getByText('每次模型响应预计减少')).toBeTruthy();
    expect(screen.getByText('全部可读历史', { exact: false })).toBeTruthy();
    expect(container.textContent).not.toContain('1970-01-01');
    expect(screen.getByText('证据不足，暂不可估')).toBeTruthy();
    expect(container.querySelector('pre')).toBeNull();
    const path = screen.getByText('/private/project/session.jsonl');
    const disclosure = path.closest('details')!;
    expect(disclosure.open).toBe(false);
    fireEvent.click(screen.getByText('会话与目录来源'));
    expect(screen.getByText('SHA256 test-catalog-hash')).toBeTruthy();
    expect(container.querySelectorAll('.history-benefit-metric')).toHaveLength(4);
  });

  it('distinguishes a known zero replay from an unavailable replay and warns on limited history', () => {
    render(<HistoryBenefitSummary history={{ ...history, historicalReplay: { inputTokens: 0, coveredResponses: 1, unknownResponses: 0 }, historyCoverage: { ...history.historyCoverage, limited: true, incompleteFiles: 2 } }} />);
    expect(screen.queryByText('证据不足，暂不可估')).toBeNull();
    expect(screen.getByText('0 Token')).toBeTruthy();
    expect(screen.getByText(/2 个文件不完整/)).toBeTruthy();
  });

  it('renders the compact conclusion with independent recommendation and control counts', () => {
    const compactHistory = { ...history, usageProfile: [
      { kind: 'recommended_plugins', name: 'Unused plugin', id: 'unused@remote', explicitMentionCount: 0, activationCount: 0, observedReadCount: 0, usedSessionCount: 0, evidence: [], recommendation: 'review-disable', control: 'source-supported', reason: 'Unused.' },
      { kind: 'skills_instructions', name: 'Unknown skill', id: 'unknown', explicitMentionCount: 0, activationCount: 0, observedReadCount: 0, usedSessionCount: 0, evidence: [], recommendation: 'unknown', control: 'unverified', reason: 'Unknown.' },
      { kind: 'skills_instructions', name: 'Used skill', id: 'used', sourcePath: '/tmp/used/SKILL.md', explicitMentionCount: 1, activationCount: 1, observedReadCount: 0, usedSessionCount: 1, evidence: [], recommendation: 'retain', control: 'source-supported', reason: 'Used.' },
    ] as OfflineHistoryAnalysis['usageProfile'] };
    render(<HistoryBenefitSummary history={compactHistory} compact onOpenEvidence={() => undefined} />);
    expect(screen.getByText('每次模型响应预计减少')).toBeTruthy();
    expect(screen.getByText('查看收益依据')).toBeTruthy();
    expect(screen.getByText('建议分类待确认')).toBeTruthy();
    expect(screen.queryByText('首次交互累计')).toBeNull();
  });
});
