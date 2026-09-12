import { describe, expect, it } from 'vitest';

import { reconstructHistoricalContext } from '../../src/benefit/contextEvidence';
import { createTokenCounter } from '../../src/context/tokenCounter';
import { estimateCodexBenefit } from '../../src/benefit/estimateBenefit';
import type { CodexContextStateSnapshot, CodexSessionFileAnalysis, CodexSessionScanResult, OptimizationPlan } from '../../src/benefit/types';

function scan(): CodexSessionScanResult {
  const timestamp = '2026-09-07T00:00:00.000Z';
  const record = {
    responseId: 'response-1',
    sessionId: 'session-1',
    threadId: 'thread-1',
    timestamp,
    usage: { inputTokens: 1000, cachedInputTokens: 500, cacheWriteInputTokens: 0, outputTokens: 100, reasoningOutputTokens: 20, totalTokens: 1100 },
    sourcePath: '/tmp/session.jsonl',
    line: 1,
    archived: false,
    sourceKind: 'token_usage_record' as const,
    quality: 'complete' as const,
    model: 'gpt-6-astra',
  };
  return {
    codexHome: '/tmp/codex',
    sessionRoots: ['/tmp/codex/sessions'],
    projectDir: '/tmp/project',
    sinceMs: Date.parse(timestamp) - 1000,
    untilMs: Date.parse(timestamp) + 1000,
    requestedLimit: 20,
    candidates: [],
    adapter: { id: 'codex-rollout-jsonl', version: '1', observedEventTypes: ['token_usage_record'] },
    counts: { discoveredFiles: 1, projectCandidates: 1, selectedFiles: 1, skippedFiles: 0, skippedByReason: {} },
    index: { enabled: false, cacheHits: 0, incrementalFiles: 0, rebuiltFiles: 0 },
    selected: [{
      session: { filePath: '/tmp/session.jsonl', sessionId: 'session-1', threadId: 'thread-1', timestamp, cwd: '/tmp/project', archived: false },
      analysis: {} as never,
      usage: [record],
      associatedFiles: [],
      summary: { inputTokens: 1000, cachedInputTokens: 500, cacheWriteInputTokens: 0, outputTokens: 100, reasoningOutputTokens: 20, totalTokens: 1100, responseCount: 1, completeResponseCount: 1 },
      events: { itemTypes: {}, toolCalls: 0, commandExecutions: 0, fileChanges: 0, mcpCalls: 0, compactions: 0, completedTurns: 1, failedTurns: 0, cancelledTurns: 0 },
      firstTimestamp: timestamp,
      lastTimestamp: timestamp,
      status: 'complete',
      diagnostics: [],
    }],
    skipped: [],
    diagnostics: [],
    generatedAt: timestamp,
  };
}

function plan(): OptimizationPlan {
  return {
    id: 'plan-1',
    sourcePath: '/tmp/plan.json',
    sourceKind: 'explicit',
    projectDir: '/tmp/project',
    baseline: { totalEstimatedTokens: 1000 },
    estimate: { fixedEstimatedTokens: 200, estimatedAfterTokens: 800, billingMeasurement: false },
  };
}

describe('estimateCodexBenefit', () => {
  it('deducts a retained Skill prefix on cold, cached, partially cached and cache-write responses', () => {
    const base = scan();
    const text = '### Available skills\n- imagegen: Generate raster images.\n- review-agent: Review code.';
    const retained = '### Available skills\n- review-agent: Review code.';
    const delta = Math.ceil(text.length / 4) - Math.ceil(retained.length / 4);
    const original = base.selected[0].usage[0];
    base.selected[0].usage = [0, 500, 2, 0].map((cached, index) => ({
      ...original,
      responseId: `response-${index}`,
      line: 4 + index,
      contextSnapshotLine: 3,
      usage: { ...original.usage, cachedInputTokens: cached, cacheWriteInputTokens: index === 3 ? 50 : 0 },
    }));
    base.selected[0].associatedFiles = [{
      meta: base.selected[0].session,
      contextSnapshots: [{ timestamp: base.generatedAt, full: true, hostSkillsText: text, sourcePath: original.sourcePath, line: 3 }],
    } as CodexSessionFileAnalysis];
    const report = estimateCodexBenefit({ scan: base, tokenizer: 'approx', plan: {
      ...plan(), operations: [{ affectedItems: [{ id: 'imagegen', name: 'imagegen', resource: 'skill' }] }],
    }, priceTable: {
      schemaVersion: 1, name: 'synthetic', updatedAt: '2026-09-09', channel: 'test', serviceTier: 'test', unit: 'USD per 1M tokens',
      prices: [{ model: original.model, provider: 'test', currency: 'USD', inputPerMillion: 10, cachedInputPerMillion: 1, cacheWriteInputPerMillion: 12, outputPerMillion: 20, maxInputTokens: 200_000 }],
    } });

    expect(report.responses.map((response) => response.estimatedInputSavings)).toEqual([delta, delta, delta, delta]);
    expect(report.savings.inputTokens).toBe(delta * 4);
    expect(report.projected.outputTokens).toBe(report.baseline.outputTokens);
    expect(report.responses.map((response) => response.projectedAfter?.cachedInputTokens)).toEqual([0, 500 - delta, 0, 0]);
    expect(report.responses[3].projectedAfter?.cacheWriteInputTokens).toBe(50 - delta);
    const expectedSavings = (delta * 10 + delta + 2 + (delta - 2) * 10 + delta * 12) / 1_000_000;
    expect(report.scenarios[0].id).toBe('persistent-context');
    expect(report.scenarios[0].savings).toBeCloseTo(expectedSavings, 8);
    expect(report.modelCosts[0].savings).toBeCloseTo(expectedSavings, 8);
    expect(report.scenarios[0].modelCosts).toEqual(report.modelCosts);
    expect(report.resourceContributions[0]).toMatchObject({ responseCount: 4, inputSavings: delta * 4 });
  });

  it('projects input and cost savings while keeping output unchanged', () => {
    const report = estimateCodexBenefit({
      scan: scan(),
      plan: plan(),
      priceTable: { schemaVersion: 1, name: 'test', updatedAt: '2026-09-07', channel: 'test', serviceTier: 'test', unit: 'USD per 1M tokens', prices: [{ model: 'gpt-6-astra', provider: 'test', currency: 'USD', inputPerMillion: 20, cachedInputPerMillion: 2, cacheWriteInputPerMillion: 25, outputPerMillion: 75, maxInputTokens: 200_000 }] },
    });

    expect(report.savings).toMatchObject({ status: 'estimated', inputTokens: 200, totalTokens: 200, inputTokenPercent: 20, totalTokenPercent: 18.18 });
    expect(report.baseline.outputTokens).toBe(100);
    expect(report.projected.outputTokens).toBe(100);
    expect(report.projected.inputTokens).toBe(800);
    expect(report.scenarios).toHaveLength(2);
    expect(report.scenarios[0].projected.status).toBe('estimated');
    expect(report.scenarios[1].parameters).toMatchObject({ firstResponses: 1, affectedResponseRange: 'all-covered-responses' });
    expect(report.baseline.inputTokens).toBe(report.responses.reduce((sum, response) => sum + response.before.inputTokens, 0));
    expect(report.projected.inputTokens).toBe(report.responses.reduce((sum, response) => sum + (response.projectedAfter?.inputTokens ?? response.before.inputTokens), 0));
  });

  it('keeps mixed currencies separate instead of summing them as one amount', () => {
    const base = scan();
    const second = { ...base.selected[0].usage[0], responseId: 'response-eur', model: 'other-model', usage: { ...base.selected[0].usage[0].usage, inputTokens: 200, cachedInputTokens: 0, totalTokens: 300 } };
    base.selected[0] = {
      ...base.selected[0],
      usage: [...base.selected[0].usage, second],
      summary: { ...base.selected[0].summary, inputTokens: 1200, totalTokens: 1400, responseCount: 2, completeResponseCount: 2 },
    };
    const report = estimateCodexBenefit({
      scan: base,
      plan: plan(),
      priceTable: {
        schemaVersion: 1,
        name: 'mixed',
        updatedAt: '2026-09-07',
        channel: 'test',
        serviceTier: 'test',
        unit: 'currency per 1M tokens',
        prices: [
          { model: 'gpt-6-astra', provider: 'test', currency: 'USD', inputPerMillion: 20, cachedInputPerMillion: 2, cacheWriteInputPerMillion: 25, outputPerMillion: 75, maxInputTokens: 200_000 },
          { model: 'other-model', provider: 'test', currency: 'EUR', inputPerMillion: 10, cachedInputPerMillion: 1, cacheWriteInputPerMillion: 12, outputPerMillion: 30, maxInputTokens: 200_000 },
        ],
      },
    });

    expect(report.scenarios[0]?.baseline.status).toBe('estimated');
    expect(report.scenarios[0]?.baseline.unpricedResponseCount).toBe(1);
    expect(report.modelCosts).toEqual(expect.arrayContaining([
      expect.objectContaining({ model: 'gpt-6-astra', baseline: expect.objectContaining({ status: 'estimated', currency: 'USD' }) }),
      expect.objectContaining({ model: 'other-model', baseline: expect.objectContaining({ status: 'estimated', currency: 'EUR' }) }),
    ]));
  });

  it('keeps projected metrics at baseline and marks savings unavailable without a plan', () => {
    const report = estimateCodexBenefit({ scan: scan() });

    expect(report.savings.status).toBe('not_applicable');
    expect(report.projected).toEqual(report.baseline);
    expect(report.scenarios).toHaveLength(0);
    expect(report.modelCosts[0]).toMatchObject({ model: 'gpt-6-astra', pricedResponseCount: 1, baseline: { status: 'estimated' } });
    expect(report.costCoverage).toMatchObject({ pricedResponseCount: 1, responsePercent: 100 });
  });

  it('keeps zero-input baselines valid without inventing a percentage', () => {
    const base = scan();
    base.selected[0].usage[0].usage = { ...base.selected[0].usage[0].usage, inputTokens: 0, totalTokens: 100 };
    base.selected[0].summary = { ...base.selected[0].summary, inputTokens: 0, totalTokens: 100 };
    const report = estimateCodexBenefit({ scan: base, plan: plan() });

    expect(report.savings).toMatchObject({ status: 'estimated', inputTokens: 0, totalTokens: 0 });
    expect(report.savings.inputTokenPercent).toBeUndefined();
  });

  it('keeps cached input partitions valid after a large projected reduction', () => {
    const report = estimateCodexBenefit({
      scan: scan(),
      plan: { ...plan(), estimate: { fixedEstimatedTokens: 800, estimatedAfterTokens: 200, billingMeasurement: false } },
    });

    expect(report.projected.inputTokens).toBe(200);
    expect(report.projected.cachedInputTokens).toBeLessThanOrEqual(report.projected.inputTokens);
    expect(report.scenarios[0]?.baseline.status).toBe('estimated');
  });

  it('preserves a negative static difference as an estimated increase', () => {
    const report = estimateCodexBenefit({
      scan: scan(),
      plan: {
        ...plan(),
        estimate: { fixedEstimatedTokens: -100, estimatedAfterTokens: 1100, billingMeasurement: false },
      },
    });

    expect(report.savings).toMatchObject({ status: 'estimated', inputTokens: -100, totalTokens: -100 });
    expect(report.projected.inputTokens).toBe(1100);
    expect(report.projected.totalTokens).toBe(1200);
    expect(report.baseline.affectedResponseCount).toBe(1);
  });

  it('keeps valid failed-turn usage in the aggregate without adding reasoning twice', () => {
    const base = scan();
    base.selected[0].events.failedTurns = 1;
    const report = estimateCodexBenefit({ scan: base, plan: plan() });

    expect(report.baseline).toMatchObject({ responseCount: 1, inputTokens: 1000, outputTokens: 100, reasoningOutputTokens: 20, totalTokens: 1100 });
    expect(report.projected.totalTokens).toBe(900);
  });

  it('does not copy the main-thread estimate to a child without a context snapshot', () => {
    const base = scan();
    const child = {
      ...base.selected[0].usage[0],
      responseId: 'response-child',
      threadId: 'thread-child',
      usage: { inputTokens: 500, cachedInputTokens: 0, cacheWriteInputTokens: 0, outputTokens: 10, reasoningOutputTokens: 2, totalTokens: 510 },
    };
    const childAnalysis = { meta: { filePath: '/tmp/child.jsonl', sessionId: 'session-1', threadId: 'thread-child', parentThreadId: 'thread-1', timestamp: base.generatedAt, cwd: '/tmp/project', archived: false }, contextSnapshots: [], cwdCandidates: ['/tmp/project'], workspaceRoots: [], usageRecords: [], modelContexts: [], events: base.selected[0].events, status: 'complete', diagnostics: [], bytes: 1, lineCount: 1, observedEventTypes: [] } as CodexSessionFileAnalysis;
    base.selected[0] = {
      ...base.selected[0],
      usage: [...base.selected[0].usage, child],
      associatedFiles: [childAnalysis],
      summary: { ...base.selected[0].summary, inputTokens: 1500, outputTokens: 110, totalTokens: 1610, responseCount: 2, completeResponseCount: 2 },
    };

    const report = estimateCodexBenefit({ scan: base, plan: plan() });

    expect(report.baseline.inputTokens).toBe(1500);
    expect(report.projected.inputTokens).toBe(1300);
    expect(report.savings.inputTokens).toBe(200);
    expect(report.responses.find((response) => response.responseId === 'response-child')).toMatchObject({ status: 'unknown' });
    expect(report.projected.responseCount).toBe(2);
    expect(report.projected.affectedResponseCount).toBe(1);
  });

  it('requires historical resource evidence before applying a per-resource plan', () => {
    const base = scan();
    base.selected[0].usage[0].contextSnapshotLine = 3;
    base.selected[0].associatedFiles = [{
      meta: { filePath: '/tmp/session.jsonl', sessionId: 'session-1', threadId: 'thread-1', timestamp: base.selected[0].session.timestamp, cwd: '/tmp/project', archived: false },
      usageRecords: base.selected[0].usage,
      modelContexts: [],
      contextSnapshots: [{ timestamp: base.selected[0].session.timestamp, full: true, hostSkillsText: 'unrelated skill', hostSkillsTextChars: 15, sourcePath: '/tmp/session.jsonl', line: 3 }],
      cwdCandidates: ['/tmp/project'],
      workspaceRoots: [],
      observedEventTypes: ['world_state'],
      events: base.selected[0].events,
      status: 'complete',
      diagnostics: [],
      bytes: 1,
      lineCount: 3,
    }];
    const report = estimateCodexBenefit({
      scan: base,
      plan: {
        ...plan(),
        operations: [{ affectedItems: [{ id: 'skill-id', name: 'planned-skill', resource: 'skill', sourcePath: '/tmp/planned-skill/SKILL.md' }] }],
      },
    });

    expect(report.planCoverage.status).toBe('unknown');
    expect(report.savings.status).toBe('unknown');
    expect(report.responses[0]).toMatchObject({ status: 'unknown', evidence: 'unknown' });
  });

  it('applies a resource plan only to responses with a matching historical snapshot', () => {
    const base = scan();
    base.selected[0].usage[0].contextSnapshotLine = 3;
    base.selected[0].associatedFiles = [{
      meta: { filePath: '/tmp/session.jsonl', sessionId: 'session-1', threadId: 'thread-1', timestamp: base.selected[0].session.timestamp, cwd: '/tmp/project', archived: false },
      usageRecords: base.selected[0].usage,
      modelContexts: [],
      contextSnapshots: [{ timestamp: base.selected[0].session.timestamp, full: true, hostSkillsText: 'planned-skill appears here', hostSkillsTextChars: 25, sourcePath: '/tmp/session.jsonl', line: 3 }],
      cwdCandidates: ['/tmp/project'],
      workspaceRoots: [],
      observedEventTypes: ['world_state'],
      events: base.selected[0].events,
      status: 'complete',
      diagnostics: [],
      bytes: 1,
      lineCount: 3,
    }];
    const report = estimateCodexBenefit({
      scan: base,
      plan: {
        ...plan(),
        operations: [{ affectedItems: [{ id: 'skill-id', name: 'planned-skill', resource: 'skill', sourcePath: '/tmp/planned-skill/SKILL.md' }] }],
      },
    });

    expect(report.planCoverage.status).toBe('matched');
    expect(report.savings.status).toBe('unknown');
    expect(report.responses[0]).toMatchObject({ status: 'unknown', evidence: 'historical-context', contextSnapshotLine: 3 });
  });

  it('recounts removable historical skill-list text when the rollout exposes structured entries', () => {
    const base = scan();
    base.selected[0].usage[0].contextSnapshotLine = 3;
    base.selected[0].associatedFiles = [{
      meta: { filePath: '/tmp/session.jsonl', sessionId: 'session-1', threadId: 'thread-1', timestamp: base.selected[0].session.timestamp, cwd: '/tmp/project', archived: false },
      usageRecords: base.selected[0].usage,
      modelContexts: [],
      contextSnapshots: [{ timestamp: base.selected[0].session.timestamp, full: true, hostSkillsText: '### Available skills\n- planned-skill: A long description that is part of the historical list\n- retained-skill: keep this entry', hostSkillsTextChars: 130, sourcePath: '/tmp/session.jsonl', line: 3 }],
      cwdCandidates: ['/tmp/project'],
      workspaceRoots: [],
      observedEventTypes: ['world_state'],
      events: base.selected[0].events,
      status: 'complete',
      diagnostics: [],
      bytes: 1,
      lineCount: 3,
    }];
    const report = estimateCodexBenefit({
      scan: base,
      plan: {
        ...plan(),
        operations: [{ affectedItems: [{ id: 'skill-id', name: 'planned-skill', resource: 'skill', sourcePath: '/tmp/planned-skill/SKILL.md' }] }],
      },
      tokenizer: 'approx',
    });

    expect(report.simulation.method).toBe('historical-context-text-diff');
    expect(report.evidence.dynamicResourceTextReconstructed).toBe(true);
    expect(report.evidence.textReconstructedResponseCount).toBe(1);
    expect(report.responses[0]?.evidence).toBe('text-reconstructed');
    expect(report.responses[0]?.estimatedInputSavings).toBeGreaterThan(0);
    expect(report.savings.inputTokens).not.toBe(200);
    expect(report.evidence.tokenizer).toMatchObject({ mode: 'approx' });
    expect(report.resourceContributions[0]).toMatchObject({ resourceId: 'skill-id', responseCount: 1 });
    expect(report.provenance.contextSnapshots[0]).toMatchObject({
      sourcePath: '/tmp/session.jsonl',
      line: 3,
      recoverable: true,
      hostSkillsTextSha256: expect.any(String),
    });
  });

  it('records tokenizer fallback when the requested model has no known encoding', () => {
    const base = scan();
    base.selected[0].usage[0].contextSnapshotLine = 3;
    base.selected[0].associatedFiles = [{
      meta: { filePath: '/tmp/session.jsonl', sessionId: 'session-1', threadId: 'thread-1', timestamp: base.selected[0].session.timestamp, cwd: '/tmp/project', archived: false },
      usageRecords: base.selected[0].usage,
      modelContexts: [],
      contextSnapshots: [{ timestamp: base.selected[0].session.timestamp, full: true, hostSkillsText: '### Available skills\n- planned-skill: removable', hostSkillsTextChars: 48, sourcePath: '/tmp/session.jsonl', line: 3 }],
      cwdCandidates: ['/tmp/project'],
      workspaceRoots: [],
      observedEventTypes: ['world_state'],
      events: base.selected[0].events,
      status: 'complete',
      diagnostics: [],
      bytes: 1,
      lineCount: 3,
    }];
    const report = estimateCodexBenefit({
      scan: base,
      plan: { ...plan(), operations: [{ affectedItems: [{ id: 'skill-id', name: 'planned-skill', resource: 'skill' }] }] },
      tokenizerModel: 'future-unknown-tokenizer',
    });

    expect(report.evidence.tokenizer).toMatchObject({ mode: 'openai', fallback: true });
    expect(report.responses[0]?.evidence).toBe('text-reconstructed');
  });

  it('does not infer removal from a truncated or duplicated historical skill list', () => {
    const base = scan();
    base.selected[0].usage[0].contextSnapshotLine = 3;
    base.selected[0].associatedFiles = [{
      meta: { filePath: '/tmp/session.jsonl', sessionId: 'session-1', threadId: 'thread-1', timestamp: base.selected[0].session.timestamp, cwd: '/tmp/project', archived: false },
      usageRecords: base.selected[0].usage,
      modelContexts: [],
      contextSnapshots: [{
        timestamp: base.selected[0].session.timestamp,
        full: true,
        hostSkillsText: '### Available skills\n- retained-skill: one\n... more skills omitted',
        hostSkillsTextChars: 64,
        hostSkillsTruncated: true,
        sourcePath: '/tmp/session.jsonl',
        line: 3,
      }],
      cwdCandidates: ['/tmp/project'],
      workspaceRoots: [],
      observedEventTypes: ['world_state'],
      events: base.selected[0].events,
      status: 'complete',
      diagnostics: [],
      bytes: 1,
      lineCount: 3,
    }];
    const report = estimateCodexBenefit({
      scan: base,
      plan: {
        ...plan(),
        operations: [{ affectedItems: [{ id: 'disabled-id', name: 'disabled-skill', resource: 'skill', enabled: false }] }],
      },
    });

    expect(report.planCoverage.status).toBe('unknown');
    expect(report.savings.status).toBe('unknown');
    expect(report.responses[0]).toMatchObject({ status: 'unknown', evidence: 'unknown' });
  });

  it('does not apply a fingerprinted plan without a successful current-inventory validation', () => {
    const report = estimateCodexBenefit({
      scan: scan(),
      plan: { ...plan(), inventoryFingerprint: 'expected-fingerprint' },
    });

    expect(report.savings.status).toBe('unknown');
    expect(report.planCoverage.inventoryStatus).toBe('unknown');
    expect(report.diagnostics.some((item) => item.code === 'plan.inventory_drift')).toBe(true);
  });

  it('counts a retained recommended-plugin block on every response sharing its anchor', () => {
    const base = scan();
    const blockText = '<recommended_plugins>\n- GitHub (github@openai-curated-remote)\n</recommended_plugins>';
    const block = {
      id: 'recommended_plugins' as const,
      tag: '<recommended_plugins>',
      role: 'user' as const,
      activation: 'initial-context' as const,
      complete: true,
      estimatedChars: blockText.length,
      estimatedTokens: 20,
      text: blockText,
      textSha256: 'block-hash',
      controllable: false,
      recommendation: 'observe',
      sourcePath: '/tmp/session.jsonl',
      line: 3,
    };
    const snapshot: CodexContextStateSnapshot = {
      timestamp: base.generatedAt,
      full: false,
      sourceKind: 'response_item',
      role: 'user',
      contextTextChars: blockText.length,
      contextBlocksComplete: true,
      contextBlocks: [block],
      sourcePath: '/tmp/session.jsonl',
      line: 3,
    };
    base.selected[0].usage = [
      { ...base.selected[0].usage[0], responseId: 'response-context-1', line: 4, contextSnapshotLine: 3, contextSnapshotLines: [3] },
      { ...base.selected[0].usage[0], responseId: 'response-context-2', line: 5, contextSnapshotLine: 3, contextSnapshotLines: [3] },
    ];
    base.selected[0].summary = { ...base.selected[0].summary, inputTokens: 2000, totalTokens: 2200, responseCount: 2, completeResponseCount: 2 };
    base.selected[0].associatedFiles = [{
      meta: base.selected[0].session,
      usageRecords: base.selected[0].usage,
      modelContexts: [],
      contextSnapshots: [snapshot],
      cwdCandidates: ['/tmp/project'],
      workspaceRoots: [],
      observedEventTypes: ['response_item'],
      events: base.selected[0].events,
      status: 'complete',
      diagnostics: [],
      bytes: 1,
      lineCount: 3,
    } as CodexSessionFileAnalysis];

    const report = estimateCodexBenefit({
      scan: base,
      tokenizer: 'approx',
      plan: {
        ...plan(),
        operations: [{ affectedItems: [{
          id: 'codex:context-block:recommended_plugins',
          name: 'recommended_plugins',
          resource: 'context-block',
          kind: 'context-block',
          blockId: 'recommended_plugins',
          enabled: false,
          controllable: false,
        }] }],
      },
    });

    expect(report.planCoverage).toMatchObject({ status: 'matched', matchedResourceCount: 1 });
    expect(report.evidence).toMatchObject({
      historicalContextBlockCount: 1,
      historicalContextBlockKinds: { recommended_plugins: 1 },
      historicalContextBlockTokenCount: expect.any(Number),
    });
    expect(report.responses[0]).toMatchObject({ status: 'estimated', evidence: 'text-reconstructed' });
    expect(report.responses[0]?.estimatedInputSavings).toBeGreaterThan(0);
    expect(report.responses[1]).toMatchObject({ status: 'estimated', evidence: 'text-reconstructed', estimatedInputSavings: report.responses[0]?.estimatedInputSavings });
    expect(report.savings.inputTokens).toBe(2 * report.responses[0]!.estimatedInputSavings!);
    expect(report.provenance.contextSnapshots[0]).toMatchObject({ sourceKind: 'response_item', role: 'user', contextBlocks: [{ id: 'recommended_plugins', textSha256: 'block-hash' }] });
    expect(report.provenance.contextSnapshots[0]).not.toHaveProperty('contextBlocks[0].text');
  });

  it('keeps incomplete or indexed-without-text context blocks unknown', () => {
    const base = scan();
    base.selected[0].usage[0].contextSnapshotLine = 3;
    base.selected[0].associatedFiles = [{
      meta: base.selected[0].session,
      contextSnapshots: [{
        timestamp: base.generatedAt,
        full: false,
        sourceKind: 'response_item',
        role: 'user',
        contextBlocks: [{
          id: 'recommended_plugins',
          tag: '<recommended_plugins>',
          role: 'user',
          activation: 'initial-context',
          complete: false,
          estimatedChars: 30,
          estimatedTokens: 8,
          recommendation: 'observe',
          sourcePath: '/tmp/session.jsonl',
          line: 3,
        }],
        sourcePath: '/tmp/session.jsonl',
        line: 3,
      }],
    } as CodexSessionFileAnalysis];
    const report = estimateCodexBenefit({
      scan: base,
      plan: {
        ...plan(),
        operations: [{ affectedItems: [{ id: 'recommended-id', name: 'recommended_plugins', resource: 'context-block', blockId: 'recommended_plugins', enabled: false }] }],
      },
    });

    expect(report.planCoverage.status).toBe('unknown');
    expect(report.savings.status).toBe('unknown');
    expect(report.responses[0]).toMatchObject({ status: 'unknown', evidence: 'unknown' });
  });

  it('keeps a complete indexed context block without text unknown', () => {
    const base = scan();
    base.selected[0].usage[0].contextSnapshotLine = 3;
    base.selected[0].associatedFiles = [{
      meta: base.selected[0].session,
      contextSnapshots: [{
        timestamp: base.generatedAt,
        full: false,
        sourceKind: 'response_item',
        role: 'user',
        contextBlocks: [{
          id: 'recommended_plugins',
          tag: '<recommended_plugins>',
          role: 'user',
          activation: 'initial-context',
          complete: true,
          estimatedChars: 30,
          estimatedTokens: 8,
          recommendation: 'observe',
          sourcePath: '/tmp/session.jsonl',
          line: 3,
        }],
        sourcePath: '/tmp/session.jsonl',
        line: 3,
      }],
    } as CodexSessionFileAnalysis];
    const report = estimateCodexBenefit({
      scan: base,
      plan: {
        ...plan(),
        operations: [{ affectedItems: [{ id: 'recommended-id', name: 'recommended_plugins', resource: 'context-block', blockId: 'recommended_plugins', enabled: false }] }],
      },
    });

    expect(report.planCoverage.status).toBe('unknown');
    expect(report.savings.status).toBe('unknown');
    expect(report.responses[0]).toMatchObject({ status: 'unknown', evidence: 'unknown' });
  });

  it('recomputes Skill root aliases instead of subtracting only the selected catalog line', () => {
    const text = [
      '- `r0-shared-root-with-a-long-name` = `/tmp/roots`',
      '- `r1` = `/tmp/other`',
      '### Available skills',
      '- remove-me: remove this entry',
      '- keep-me: retain this entry',
    ].join('\n');
    const snapshot: CodexContextStateSnapshot = {
      timestamp: '2026-09-07T00:00:00.000Z',
      full: false,
      contextBlocks: [{
        id: 'skills_instructions',
        tag: '<skills_instructions>',
        role: 'developer',
        activation: 'initial-context',
        complete: true,
        estimatedChars: text.length,
        text,
        recommendation: 'rebuild',
        sourcePath: '/tmp/session.jsonl',
        line: 2,
      }],
      sourcePath: '/tmp/session.jsonl',
      line: 2,
    };
    const selected = { id: 'remove-id', name: 'remove-me', resource: 'skill', sourcePath: '/tmp/roots/remove-me/SKILL.md', rootAlias: 'r0-shared-root-with-a-long-name', enabled: false };
    const retained = { id: 'keep-id', name: 'keep-me', resource: 'skill', sourcePath: '/tmp/roots/keep-me/SKILL.md', rootAlias: 'r0-shared-root-with-a-long-name', enabled: true };
    const counter = createTokenCounter({ tokenizer: 'openai', tokenizerModel: 'gpt-4o' });
    const withoutRetained = reconstructHistoricalContext([selected], snapshot, counter, { inventory: [selected] });
    const withRetained = reconstructHistoricalContext([selected], snapshot, counter, { inventory: [selected, retained] });

    expect(withoutRetained.status).toBe('estimated');
    expect(withRetained.status).toBe('estimated');
    expect(withoutRetained.afterTokens).toBe(withRetained.afterTokens);
    expect(withoutRetained.inputSavings).toBe(withRetained.inputSavings);
  });

  it('applies only the verifiable subset when a multi-resource plan is partially present', () => {
    const base = scan();
    base.selected[0].usage[0].contextSnapshotLine = 3;
    base.selected[0].associatedFiles = [{
      meta: { filePath: '/tmp/session.jsonl', sessionId: 'session-1', threadId: 'thread-1', timestamp: base.selected[0].session.timestamp, cwd: '/tmp/project', archived: false },
      usageRecords: base.selected[0].usage,
      modelContexts: [],
      contextSnapshots: [{ timestamp: base.selected[0].session.timestamp, full: true, hostSkillsText: '### Available skills\n- present-skill: removable\n- retained-skill: keep this entry', hostSkillsTextChars: 88, sourcePath: '/tmp/session.jsonl', line: 3 }],
      cwdCandidates: ['/tmp/project'],
      workspaceRoots: [],
      observedEventTypes: ['world_state'],
      events: base.selected[0].events,
      status: 'complete',
      diagnostics: [],
      bytes: 1,
      lineCount: 3,
    }];
    const report = estimateCodexBenefit({
      scan: base,
      plan: {
        ...plan(),
        operations: [{ affectedItems: [
          { id: 'present-id', name: 'present-skill', resource: 'skill' },
          { id: 'missing-id', name: 'missing-skill', resource: 'skill' },
        ] }],
      },
      tokenizer: 'approx',
    });

    expect(report.planCoverage.status).toBe('partial');
    expect(report.responses[0]).toMatchObject({ status: 'estimated', evidence: 'text-reconstructed' });
    expect(report.resourceContributions.map((item) => item.resourceId)).toContain('present-id');
  });

  it('keeps a historical response already in the target state at zero delta', () => {
    const base = scan();
    base.selected[0].usage[0].contextSnapshotLine = 3;
    base.selected[0].associatedFiles = [{
      meta: { filePath: '/tmp/session.jsonl', sessionId: 'session-1', threadId: 'thread-1', timestamp: base.selected[0].session.timestamp, cwd: '/tmp/project', archived: false },
      usageRecords: base.selected[0].usage,
      modelContexts: [],
      contextSnapshots: [{ timestamp: base.selected[0].session.timestamp, full: true, hostSkillsText: '### Available skills\n- retained-skill: keep this entry', hostSkillsTextChars: 52, sourcePath: '/tmp/session.jsonl', line: 3 }],
      cwdCandidates: ['/tmp/project'],
      workspaceRoots: [],
      observedEventTypes: ['world_state'],
      events: base.selected[0].events,
      status: 'complete',
      diagnostics: [],
      bytes: 1,
      lineCount: 3,
    }];
    const report = estimateCodexBenefit({
      scan: base,
      plan: {
        ...plan(),
        operations: [{ affectedItems: [{ id: 'disabled-id', name: 'disabled-skill', resource: 'skill', enabled: false }] }],
      },
    });

    expect(report.planCoverage.alreadyOptimizedResourceCount).toBe(1);
    expect(report.planCoverage.alreadyOptimizedResponseCount).toBe(1);
    expect(report.responses[0]).toMatchObject({ evidence: 'already-optimized', estimatedInputSavings: 0 });
    expect(report.savings).toMatchObject({ status: 'estimated', inputTokens: 0 });
  });

  it('reconstructs a disabled AGENTS file only when its historical path is explicit', () => {
    const base = scan();
    base.selected[0].usage[0].contextSnapshotLine = 3;
    base.selected[0].associatedFiles = [{
      meta: { filePath: '/tmp/session.jsonl', sessionId: 'session-1', threadId: 'thread-1', timestamp: base.selected[0].session.timestamp, cwd: '/tmp/project', archived: false },
      usageRecords: base.selected[0].usage,
      modelContexts: [],
      contextSnapshots: [{ timestamp: base.selected[0].session.timestamp, full: true, agentsText: '# Historical rules\nKeep commands short', agentsDirectory: '/tmp/project', agentsTextChars: 34, sourcePath: '/tmp/session.jsonl', line: 3 }],
      cwdCandidates: ['/tmp/project'],
      workspaceRoots: [],
      observedEventTypes: ['world_state'],
      events: base.selected[0].events,
      status: 'complete',
      diagnostics: [],
      bytes: 1,
      lineCount: 3,
    }];
    const report = estimateCodexBenefit({
      scan: base,
      plan: {
        ...plan(),
        operations: [{ affectedItems: [{ id: 'agents-id', name: 'AGENTS.md', resource: 'agents', sourcePath: '/tmp/project/AGENTS.md', enabled: false }] }],
      },
      tokenizer: 'approx',
    });

    expect(report.responses[0]).toMatchObject({ status: 'estimated', evidence: 'text-reconstructed' });
    expect(report.resourceContributions[0]?.resourceId).toBe('agents-id');
  });

  it('requires validation for persisted optimizer plans without a fingerprint', () => {
    const report = estimateCodexBenefit({
      scan: scan(),
      plan: { ...plan(), sourceKind: 'plan', kind: 'skill-doctor-context-plan' },
    });

    expect(report.planCoverage.inventoryStatus).toBe('unknown');
    expect(report.savings.status).toBe('unknown');
    expect(report.diagnostics.some((item) => item.code === 'plan.inventory_drift')).toBe(true);
  });
});
