import { describe, expect, it } from 'vitest';

import { estimateCodexBenefit } from '../../src/benefit/estimateBenefit';
import { renderBenefitHtml, redactBenefitReport } from '../../src/render/renderBenefit';
import type { CodexSessionScanResult } from '../../src/benefit/types';

function report() {
  const timestamp = '2026-09-07T00:00:00.000Z';
  const scan: CodexSessionScanResult = {
    codexHome: '/private/codex',
    sessionRoots: ['/private/codex/sessions'],
    projectDir: '/private/project',
    sinceMs: Date.parse(timestamp) - 1000,
    untilMs: Date.parse(timestamp) + 1000,
    requestedLimit: 1,
    candidates: [],
    selected: [{
      session: { filePath: '/private/session.jsonl', sessionId: 'session', threadId: 'thread', timestamp, cwd: '/private/project', archived: false },
      analysis: {} as never,
      usage: [{
        responseId: 'response', sessionId: 'session', threadId: 'thread', timestamp,
        usage: { inputTokens: 100, cachedInputTokens: 0, cacheWriteInputTokens: 0, outputTokens: 10, reasoningOutputTokens: 1, totalTokens: 110 },
        sourcePath: '/private/session.jsonl', line: 2, archived: false, sourceKind: 'token_usage_record', quality: 'complete', model: 'gpt-6-astra',
      }],
      associatedFiles: [],
      summary: { inputTokens: 100, cachedInputTokens: 0, cacheWriteInputTokens: 0, outputTokens: 10, reasoningOutputTokens: 1, totalTokens: 110, responseCount: 1, completeResponseCount: 1 },
      events: { itemTypes: {}, toolCalls: 0, commandExecutions: 0, fileChanges: 0, mcpCalls: 0, compactions: 0, completedTurns: 1, failedTurns: 0, cancelledTurns: 0 },
      firstTimestamp: timestamp, lastTimestamp: timestamp, status: 'complete', diagnostics: [],
    }],
    skipped: [],
    counts: { discoveredFiles: 1, projectCandidates: 1, selectedFiles: 1, skippedFiles: 0, skippedByReason: {} },
    index: { enabled: false, cacheHits: 0, incrementalFiles: 0, rebuiltFiles: 0 },
    readBoundaries: [{ filePath: '/private/session.jsonl', archived: false, size: 10, mtimeMs: 1, readOffset: 10 }],
    adapter: { id: 'fixture', version: '1', observedEventTypes: [] },
    diagnostics: [],
    generatedAt: timestamp,
  };
  return estimateCodexBenefit({ scan, plan: { id: 'plan', sourcePath: '/private/plan.json', sourceKind: 'explicit', estimate: { fixedEstimatedTokens: 10 } } });
}

describe('benefit rendering', () => {
  it('redacts local paths and escapes values in static HTML', () => {
    const value = report();
    value.responses[0].responseId = '<script>alert(1)</script>';
    value.diagnostics.push({ code: 'test.path', severity: 'warning', message: 'Read /private/secret/session.jsonl' });
    value.resourceContributions.push({ resourceId: '/private/secret/SKILL.md', responseCount: 1, inputSavings: 1, interactionTokens: 0 });
    const redacted = redactBenefitReport(value);
    const html = renderBenefitHtml(value);

    expect(redacted.projectDir).toBe('[redacted]');
    expect(JSON.stringify(redacted)).not.toContain('/private/');
    expect(html).toContain('<!doctype html>');
    expect(html).not.toContain('/private/');
    expect(html).not.toContain('<script');
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(html).toContain('费用情景');
    expect(html).toContain('未重新执行 Codex');
  });
});
