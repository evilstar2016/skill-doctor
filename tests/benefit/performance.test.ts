import { mkdirSync, mkdtempSync, rmSync, writeFileSync, appendFileSync } from 'node:fs';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { scanCodexSessions } from '../../src/benefit/codexSessions';

const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function jsonl(rows: unknown[]): string {
  return `${rows.map((row) => JSON.stringify(row)).join('\n')}\n`;
}

describe('benefit scan performance fixture', () => {
  it('records first-index and incremental timings for a fixed fixture', async () => {
    const root = mkdtempSync('/tmp/skill-doctor-benefit-performance-');
    roots.push(root);
    const projectDir = join(root, 'project');
    const codexHome = join(root, 'codex');
    const sessionDir = join(codexHome, 'sessions', '2026', '09', '07');
    mkdirSync(projectDir, { recursive: true });
    mkdirSync(sessionDir, { recursive: true });
    const timestamp = new Date().toISOString();
    const files: string[] = [];
    for (let index = 0; index < 24; index += 1) {
      const filePath = join(sessionDir, `rollout-${index}.jsonl`);
      files.push(filePath);
      writeFileSync(filePath, jsonl([
        { timestamp, type: 'session_meta', payload: { session_id: `session-${index}`, id: `thread-${index}`, timestamp, cwd: projectDir } },
        { timestamp, type: 'token_usage_record', payload: { thread_id: `thread-${index}`, session_id: `session-${index}`, turn_id: `turn-${index}`, response_id: `response-${index}`, usage: { input_tokens: 100, cached_input_tokens: 20, cache_write_input_tokens: 0, output_tokens: 10, reasoning_output_tokens: 1, total_tokens: 110 } } },
      ]), 'utf8');
    }

    const first = await scanCodexSessions({ projectDir, codexHome, homeDir: root, useIndex: true, sinceMs: Date.now() - 60_000, limit: 30 });
    const indexed = await scanCodexSessions({ projectDir, codexHome, homeDir: root, useIndex: true, sinceMs: Date.now() - 60_000, limit: 30 });
    appendFileSync(files[0], `${JSON.stringify({ timestamp, type: 'token_usage_record', payload: { thread_id: 'thread-0', session_id: 'session-0', turn_id: 'turn-0', response_id: 'response-0-2', usage: { input_tokens: 20, cached_input_tokens: 0, cache_write_input_tokens: 0, output_tokens: 4, reasoning_output_tokens: 0, total_tokens: 24 } } })}\n`, 'utf8');
    const incremental = await scanCodexSessions({ projectDir, codexHome, homeDir: root, useIndex: true, sinceMs: Date.now() - 60_000, limit: 30 });

    expect(first.timings).toMatchObject({ totalMs: expect.any(Number), parseMs: expect.any(Number) });
    expect(first.timings?.peakRssBytes).toBeGreaterThan(0);
    expect(indexed.index.cacheHits).toBe(24);
    expect(incremental.index.incrementalFiles).toBe(1);
    expect(incremental.selected.find((selection) => selection.session.sessionId === 'session-0')?.summary.inputTokens).toBe(120);

    // The fixture is intentionally small; this budget catches accidental full-history work without making a machine-specific claim.
    expect(first.timings?.totalMs).toBeLessThan(10_000);
    expect(incremental.timings?.totalMs).toBeLessThan(10_000);
  });
});
