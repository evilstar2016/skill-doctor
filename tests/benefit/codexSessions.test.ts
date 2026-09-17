import { appendFileSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { analyzeCodexSessionFile, contextBlockAnalysisFromSession, isPathWithinProject, scanCodexSessions } from '../../src/benefit/codexSessions';

const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function sessionPath(codexHome: string, name: string): string {
  const filePath = join(codexHome, 'sessions', '2026', '09', '07', name);
  mkdirSync(dirname(filePath), { recursive: true });
  return filePath;
}

function writeJsonl(filePath: string, rows: unknown[]): void {
  writeFileSync(filePath, `${rows.map((row) => JSON.stringify(row)).join('\n')}\n`, 'utf8');
}

function usage(responseId: string, inputTokens: number, timestamp: string) {
  return {
    timestamp,
    type: 'token_usage_record',
    payload: {
      thread_id: 'thread-main',
      session_id: 'session-main',
      turn_id: 'turn-main',
      response_id: responseId,
      usage: {
        input_tokens: inputTokens,
        cached_input_tokens: inputTokens / 2,
        cache_write_input_tokens: 0,
        output_tokens: 20,
        reasoning_output_tokens: 5,
        total_tokens: inputTokens + 20,
      },
    },
  };
}

describe('scanCodexSessions', () => {
  it('uses directory boundaries and resolves existing symlinks for project matching', () => {
    const root = mkdtempSync('/tmp/skill-doctor-benefit-paths-');
    roots.push(root);
    const projectDir = join(root, 'project');
    const outsideDir = join(root, 'outside');
    mkdirSync(projectDir, { recursive: true });
    mkdirSync(outsideDir, { recursive: true });
    expect(isPathWithinProject(projectDir, join(root, 'project-other'))).toBe(false);
    expect(isPathWithinProject(projectDir, projectDir)).toBe(true);
    expect(isPathWithinProject(projectDir, join(projectDir, 'nested', 'package'))).toBe(true);
    try {
      symlinkSync(outsideDir, join(projectDir, 'linked-outside'), 'dir');
      expect(isPathWithinProject(projectDir, join(projectDir, 'linked-outside'))).toBe(false);
    } catch {
      // Some Windows or restricted CI environments do not permit symlink creation.
    }
  });

  it('stops before reading when the caller aborts', async () => {
    const controller = new AbortController();
    controller.abort();

    await expect(scanCodexSessions({
      projectDir: '/tmp/missing-project',
      codexHome: '/tmp/missing-codex',
      sinceMs: Date.now() - 60_000,
      signal: controller.signal,
    })).rejects.toMatchObject({ name: 'AbortError' });
  });

  it('selects recent project sessions, associates child threads, and sums response usage once', async () => {
    const root = mkdtempSync('/tmp/skill-doctor-benefit-');
    roots.push(root);
    const projectDir = join(root, 'project');
    const codexHome = join(root, 'codex');
    mkdirSync(projectDir, { recursive: true });
    const mainFile = sessionPath(codexHome, 'rollout-main.jsonl');
    const childFile = sessionPath(codexHome, 'rollout-child.jsonl');
    const otherFile = sessionPath(codexHome, 'rollout-other.jsonl');
    const now = new Date().toISOString();

    writeJsonl(mainFile, [
      { timestamp: now, type: 'session_meta', payload: { session_id: 'session-main', id: 'thread-main', timestamp: now, cwd: projectDir, cli_version: '0.1', source: 'vscode' } },
      { timestamp: now, type: 'turn_context', payload: { turn_id: 'turn-main', cwd: projectDir, workspace_roots: [projectDir], model: 'gpt-6-astra', effort: 'high' } },
      { timestamp: now, type: 'world_state', payload: { full: true, state: { agents_md: { directory: projectDir, text: '# Rules', complete: true }, host_skills: { body: 'host skill list', complete: true } } } },
      usage('response-main', 1000, now),
      usage('response-main', 1000, now),
      { timestamp: now, type: 'event_msg', payload: { type: 'item_completed', item: { type: 'CommandExecution', id: 'command-1' } } },
    ]);
    const childResponse = usage('response-child', 200, now);
    childResponse.payload.thread_id = 'thread-child';
    childResponse.payload.turn_id = 'turn-child';
    writeJsonl(childFile, [
      { timestamp: now, type: 'session_meta', payload: { session_id: 'session-main', id: 'thread-child', parent_thread_id: 'thread-main', timestamp: now, cwd: projectDir, source: { subagent: { other: 'guardian' } } } },
      { timestamp: now, type: 'turn_context', payload: { turn_id: 'turn-child', cwd: projectDir, model: 'gpt-6-astra', effort: 'low' } },
      childResponse,
    ]);
    writeJsonl(otherFile, [
      { timestamp: now, type: 'session_meta', payload: { session_id: 'session-other', id: 'thread-other', timestamp: now, cwd: join(root, 'other') } },
      usage('response-other', 9000, now),
    ]);

    const result = await scanCodexSessions({ projectDir, codexHome, sinceMs: Date.now() - 60_000, limit: 5 });

    expect(result.selected).toHaveLength(1);
    expect(result.selected[0].associatedFiles).toHaveLength(2);
    expect(result.selected[0].usage.map((record) => record.responseId)).toEqual(['response-child', 'response-main']);
    expect(result.selected[0].summary).toMatchObject({ inputTokens: 1200, cachedInputTokens: 600, totalTokens: 1240, responseCount: 2, completeResponseCount: 2 });
    expect(result.selected[0].analysis.contextSnapshots[0]).toMatchObject({ agentsText: '# Rules', agentsComplete: true, hostSkillsText: 'host skill list', hostSkillsComplete: true });
    expect(result.selected[0].usage.find((record) => record.responseId === 'response-main')?.contextSnapshotLine).toBe(3);
    expect(result.selected[0].usage.find((record) => record.responseId === 'response-child')?.contextSnapshotLine).toBeUndefined();
    expect(result.selected[0].events.commandExecutions).toBe(1);
    expect(result.selected[0].diagnostics.some((item) => item.code === 'usage.duplicate_response')).toBe(true);
    expect(result.skipped.some((entry) => entry.reason === 'outside-project')).toBe(true);
  });

  it('keeps old-directory recent continuations, excludes sibling worktrees, and honors archived opt-in and limits', async () => {
    const root = mkdtempSync('/tmp/skill-doctor-benefit-selection-');
    roots.push(root);
    const projectDir = join(root, 'repo');
    const worktreeDir = join(projectDir, '.worktrees', 'feature');
    const codexHome = join(root, 'codex');
    mkdirSync(projectDir, { recursive: true });
    mkdirSync(worktreeDir, { recursive: true });
    const now = new Date().toISOString();
    const oldPath = join(codexHome, 'sessions', '2024', '01', '01', 'old-rollout.jsonl');
    const secondPath = sessionPath(codexHome, 'second-rollout.jsonl');
    const worktreePath = sessionPath(codexHome, 'worktree-rollout.jsonl');
    const archivedPath = join(codexHome, 'archived_sessions', '2024', '01', '01', 'archived-rollout.jsonl');
    for (const filePath of [oldPath, archivedPath]) mkdirSync(dirname(filePath), { recursive: true });
    writeJsonl(oldPath, [
      { timestamp: now, type: 'session_meta', payload: { session_id: 'session-old', id: 'thread-old', timestamp: now, cwd: projectDir } },
      usage('response-old', 10, now),
    ]);
    writeJsonl(secondPath, [
      { timestamp: now, type: 'session_meta', payload: { session_id: 'session-second', id: 'thread-second', timestamp: now, cwd: projectDir } },
      usage('response-second', 20, now),
    ]);
    writeJsonl(worktreePath, [
      { timestamp: now, type: 'session_meta', payload: { session_id: 'session-worktree', id: 'thread-worktree', timestamp: now, cwd: worktreeDir } },
      usage('response-worktree', 30, now),
    ]);
    writeJsonl(archivedPath, [
      { timestamp: now, type: 'session_meta', payload: { session_id: 'session-archived', id: 'thread-archived', timestamp: now, cwd: projectDir } },
      usage('response-archived', 40, now),
    ]);

    const limited = await scanCodexSessions({ projectDir, codexHome, sinceMs: Date.now() - 60_000, limit: 1 });
    expect(limited.selected).toHaveLength(1);
    expect(limited.selected[0]?.session.sessionId).toBe('session-old');
    expect(limited.skipped.some((item) => item.reason === 'outside-project' && item.filePath === worktreePath)).toBe(true);

    const archived = await scanCodexSessions({ projectDir, codexHome, sinceMs: Date.now() - 60_000, limit: 5, includeArchived: true });
    expect(archived.selected.map((item) => item.session.sessionId)).toEqual(expect.arrayContaining(['session-old', 'session-second', 'session-archived']));
    expect(archived.selected.find((item) => item.session.sessionId === 'session-archived')?.session.archived).toBe(true);
  });

  it('uses inclusive time boundaries and restores state from before the window', async () => {
    const root = mkdtempSync('/tmp/skill-doctor-benefit-window-');
    roots.push(root);
    const projectDir = join(root, 'project');
    const codexHome = join(root, 'codex');
    mkdirSync(projectDir, { recursive: true });
    const filePath = sessionPath(codexHome, 'rollout-window.jsonl');
    const stateTime = '2026-09-07T08:00:00.000+08:00';
    const responseTime = '2026-09-07T08:00:01.000+08:00';
    writeJsonl(filePath, [
      { timestamp: stateTime, type: 'session_meta', payload: { session_id: 'session-window', id: 'thread-window', timestamp: stateTime, cwd: projectDir } },
      { timestamp: stateTime, type: 'world_state', payload: { full: true, state: { host_skills: { body: 'historical skills', complete: true } } } },
      usage('response-before-boundary', 10, stateTime),
      usage('response-at-boundary', 20, responseTime),
    ]);

    const result = await scanCodexSessions({ projectDir, codexHome, sinceMs: Date.parse(responseTime), untilMs: Date.parse(responseTime), limit: 5 });
    expect(result.selected[0]?.usage.map((item) => item.responseId)).toEqual(['response-at-boundary']);
    expect(result.selected[0]?.usage[0]?.contextSnapshotLine).toBe(2);
    expect(result.selected[0]?.analysis.contextSnapshots[0]?.hostSkillsText).toBe('historical skills');
  });

  it('keeps empty, corrupt, and incomplete files visible as diagnostics instead of zero-cost success', async () => {
    const root = mkdtempSync('/tmp/skill-doctor-benefit-invalid-');
    roots.push(root);
    const projectDir = join(root, 'project');
    const codexHome = join(root, 'codex');
    mkdirSync(projectDir, { recursive: true });
    const emptyPath = sessionPath(codexHome, 'empty.jsonl');
    const corruptPath = sessionPath(codexHome, 'corrupt.jsonl');
    const partialPath = sessionPath(codexHome, 'partial.jsonl');
    const now = new Date().toISOString();
    writeFileSync(emptyPath, '', 'utf8');
    writeFileSync(corruptPath, '{not-json}\n', 'utf8');
    writeJsonl(partialPath, [
      { timestamp: now, type: 'session_meta', payload: { session_id: 'session-partial-fields', id: 'thread-partial-fields', timestamp: now, cwd: projectDir } },
      { timestamp: now, type: 'token_usage_record', payload: { thread_id: 'thread-partial-fields', session_id: 'session-partial-fields', response_id: 'response-partial-fields', usage: { input_tokens: 10 } } },
    ]);

    const result = await scanCodexSessions({ projectDir, codexHome, sinceMs: Date.now() - 60_000, limit: 5 });
    expect(result.skipped.some((item) => item.reason === 'missing-valid-session-meta')).toBe(true);
    expect(result.selected[0]?.usage[0]).toMatchObject({ responseId: 'response-partial-fields', quality: 'partial' });
    expect(result.selected[0]?.diagnostics.some((item) => item.code === 'usage.partial_record')).toBe(true);
  });

  it('uses token_count only as a partial fallback when response usage records are absent', async () => {
    const root = mkdtempSync('/tmp/skill-doctor-benefit-fallback-');
    roots.push(root);
    const projectDir = join(root, 'project');
    const codexHome = join(root, 'codex');
    mkdirSync(projectDir, { recursive: true });
    const filePath = sessionPath(codexHome, 'rollout-fallback.jsonl');
    const now = new Date().toISOString();
    writeJsonl(filePath, [
      { timestamp: now, type: 'session_meta', payload: { session_id: 'session-fallback', id: 'thread-fallback', timestamp: now, cwd: projectDir } },
      { timestamp: now, type: 'event_msg', payload: { type: 'token_count', info: { last_token_usage: { input_tokens: 10, cached_input_tokens: 0, cache_write_input_tokens: 0, output_tokens: 2, reasoning_output_tokens: 1, total_tokens: 12 }, total_token_usage: { input_tokens: 10, cached_input_tokens: 0, cache_write_input_tokens: 0, output_tokens: 2, reasoning_output_tokens: 1, total_tokens: 12 } } } },
    ]);

    const result = await scanCodexSessions({ projectDir, codexHome, sinceMs: Date.now() - 60_000, limit: 5 });

    expect(result.selected[0].usage).toHaveLength(1);
    expect(result.selected[0].usage[0].sourceKind).toBe('token_count');
    expect(result.selected[0].usage[0].quality).toBe('partial');
    expect(result.selected[0].summary.completeResponseCount).toBe(0);
    expect(result.selected[0].diagnostics.some((item) => item.code === 'usage.token_count_fallback')).toBe(true);
  });

  it('keeps partial usage visible and does not sum cumulative token_count values twice', async () => {
    const root = mkdtempSync('/tmp/skill-doctor-benefit-partial-');
    roots.push(root);
    const projectDir = join(root, 'project');
    const codexHome = join(root, 'codex');
    mkdirSync(projectDir, { recursive: true });
    const partialPath = sessionPath(codexHome, 'rollout-partial.jsonl');
    const cumulativePath = sessionPath(codexHome, 'rollout-cumulative.jsonl');
    const now = new Date().toISOString();

    writeJsonl(partialPath, [
      { timestamp: now, type: 'session_meta', payload: { session_id: 'session-partial', id: 'thread-partial', timestamp: now, cwd: projectDir } },
      { timestamp: now, type: 'token_usage_record', payload: {
        thread_id: 'thread-partial', session_id: 'session-partial', response_id: 'response-partial',
        usage: { input_tokens: 10, cached_input_tokens: 0, cache_write_input_tokens: 0, reasoning_output_tokens: 1, total_tokens: 10 },
      } },
    ]);
    writeJsonl(cumulativePath, [
      { timestamp: now, type: 'session_meta', payload: { session_id: 'session-cumulative', id: 'thread-cumulative', timestamp: now, cwd: projectDir } },
      { timestamp: now, type: 'event_msg', payload: { type: 'token_count', info: { total_token_usage: { input_tokens: 10, cached_input_tokens: 0, cache_write_input_tokens: 0, output_tokens: 1, reasoning_output_tokens: 0, total_tokens: 10 } } } },
      { timestamp: now, type: 'event_msg', payload: { type: 'token_count', info: { total_token_usage: { input_tokens: 20, cached_input_tokens: 0, cache_write_input_tokens: 0, output_tokens: 2, reasoning_output_tokens: 0, total_tokens: 20 } } } },
    ]);

    const result = await scanCodexSessions({ projectDir, codexHome, sinceMs: Date.now() - 60_000, limit: 5 });
    const partial = result.selected.find((selection) => selection.session.sessionId === 'session-partial');
    const cumulative = result.selected.find((selection) => selection.session.sessionId === 'session-cumulative');

    expect(partial?.usage[0]).toMatchObject({ responseId: 'response-partial', quality: 'partial' });
    expect(partial?.summary.completeResponseCount).toBe(0);
    expect(partial?.diagnostics.some((item) => item.code === 'usage.partial_record')).toBe(true);
    expect(cumulative?.usage).toHaveLength(1);
    expect(cumulative?.usage[0].usage.inputTokens).toBe(20);
    expect(cumulative?.diagnostics.some((item) => item.code === 'usage.token_count_cumulative')).toBe(true);
  });

  it('does not treat usage-like fields inside compaction records as another response', async () => {
    const root = mkdtempSync('/tmp/skill-doctor-benefit-compacted-');
    roots.push(root);
    const projectDir = join(root, 'project');
    const codexHome = join(root, 'codex');
    mkdirSync(projectDir, { recursive: true });
    const filePath = sessionPath(codexHome, 'rollout-compacted.jsonl');
    const now = new Date().toISOString();
    writeJsonl(filePath, [
      { timestamp: now, type: 'session_meta', payload: { session_id: 'session-compacted', id: 'thread-compacted', timestamp: now, cwd: projectDir } },
      { timestamp: now, type: 'world_state', payload: { full: true, state: { host_skills: { body: 'before compaction' } } } },
      usage('response-compacted', 100, now),
      { timestamp: now, type: 'compacted', payload: { usage: { input_tokens: 999, total_tokens: 999 } } },
      usage('response-after-compaction', 120, now),
      { timestamp: now, type: 'world_state', payload: { full: true, state: { host_skills: { body: 'after compaction' } } } },
      usage('response-after-reanchor', 140, now),
    ]);

    const result = await scanCodexSessions({ projectDir, codexHome, sinceMs: Date.now() - 60_000, limit: 5 });

    expect(result.selected[0]?.usage).toHaveLength(3);
    expect(result.selected[0]?.summary.inputTokens).toBe(360);
    expect(result.selected[0]?.diagnostics.some((item) => item.code === 'usage.compacted_embedded_ignored')).toBe(true);
    expect(result.selected[0]?.diagnostics.some((item) => item.code === 'context.snapshot_invalidated_by_compaction')).toBe(true);
    expect(result.selected[0]?.usage.find((item) => item.responseId === 'response-after-compaction')?.contextSnapshotLine).toBeUndefined();
    expect(result.selected[0]?.usage.find((item) => item.responseId === 'response-after-reanchor')?.contextSnapshotLine).toBe(6);
  });

  it('filters responses whose turn cwd belongs to another project', async () => {
    const root = mkdtempSync('/tmp/skill-doctor-benefit-cwd-');
    roots.push(root);
    const projectDir = join(root, 'project');
    const otherDir = join(root, 'project-other');
    const codexHome = join(root, 'codex');
    mkdirSync(projectDir, { recursive: true });
    mkdirSync(otherDir, { recursive: true });
    const filePath = sessionPath(codexHome, 'rollout-cwd.jsonl');
    const now = new Date().toISOString();
    const outside = usage('response-outside', 900, now);
    outside.payload.turn_id = 'turn-other';
    writeJsonl(filePath, [
      { timestamp: now, type: 'session_meta', payload: { session_id: 'session-cwd', id: 'thread-cwd', timestamp: now, cwd: projectDir } },
      { timestamp: now, type: 'turn_context', payload: { turn_id: 'turn-main', cwd: projectDir, model: 'gpt-6-astra' } },
      usage('response-inside', 100, now),
      { timestamp: now, type: 'turn_context', payload: { turn_id: 'turn-other', cwd: otherDir, model: 'gpt-6-astra' } },
      outside,
    ]);

    const result = await scanCodexSessions({ projectDir, codexHome, sinceMs: Date.now() - 60_000, limit: 5 });

    expect(result.selected[0].usage.map((record) => record.responseId)).toEqual(['response-inside']);
    expect(result.selected[0].summary.inputTokens).toBe(100);
  });

  it('associates model and effort after a thread switches turn context', async () => {
    const root = mkdtempSync('/tmp/skill-doctor-benefit-model-switch-');
    roots.push(root);
    const projectDir = join(root, 'project');
    const codexHome = join(root, 'codex');
    mkdirSync(projectDir, { recursive: true });
    const filePath = sessionPath(codexHome, 'rollout-model-switch.jsonl');
    const first = usage('response-model-a', 100, new Date().toISOString());
    const second = usage('response-model-b', 200, new Date().toISOString());
    first.payload.turn_id = 'turn-a';
    second.payload.turn_id = 'turn-b';
    const now = new Date().toISOString();
    writeJsonl(filePath, [
      { timestamp: now, type: 'session_meta', payload: { session_id: 'session-model-switch', id: 'thread-model-switch', timestamp: now, cwd: projectDir } },
      { timestamp: now, type: 'turn_context', payload: { turn_id: 'turn-a', cwd: projectDir, model: 'model-a', effort: 'low' } },
      first,
      { timestamp: now, type: 'turn_context', payload: { turn_id: 'turn-b', cwd: projectDir, model: 'model-b', effort: 'high' } },
      second,
    ]);

    const result = await scanCodexSessions({ projectDir, codexHome, sinceMs: Date.now() - 60_000, limit: 5 });

    expect(result.selected[0]?.usage).toEqual(expect.arrayContaining([
      expect.objectContaining({ responseId: 'response-model-a', model: 'model-a', effort: 'low' }),
      expect.objectContaining({ responseId: 'response-model-b', model: 'model-b', effort: 'high' }),
    ]));
  });

  it('preserves full and delta world-state snapshots, including deletions', async () => {
    const root = mkdtempSync('/tmp/skill-doctor-benefit-world-state-');
    roots.push(root);
    const projectDir = join(root, 'project');
    const codexHome = join(root, 'codex');
    mkdirSync(projectDir, { recursive: true });
    const filePath = sessionPath(codexHome, 'rollout-world-state.jsonl');
    const first = '2026-09-07T00:00:00.000Z';
    const second = '2026-09-07T00:00:01.000Z';
    writeJsonl(filePath, [
      { timestamp: first, type: 'session_meta', payload: { session_id: 'session-world-state', id: 'thread-world-state', timestamp: first, cwd: projectDir } },
      { timestamp: first, type: 'world_state', payload: { full: true, state: { agents_md: { directory: projectDir, text: '# Rules' } } } },
      { timestamp: second, type: 'world_state', payload: { full: false, state: { agents_md: null } } },
      usage('response-world-state', 100, second),
    ]);

    const result = await scanCodexSessions({ projectDir, codexHome, sinceMs: Date.parse(first) - 1000, limit: 5 });
    const snapshots = result.selected[0].analysis.contextSnapshots;

    expect(snapshots).toHaveLength(2);
    expect(snapshots[0]).toMatchObject({ full: true, agentsText: '# Rules' });
    expect(snapshots[1]).toMatchObject({ full: false });
    expect(snapshots[1].agentsText).toBeUndefined();
  });

  it('reuses unchanged files from the local metadata index', async () => {
    const root = mkdtempSync('/tmp/skill-doctor-benefit-index-');
    roots.push(root);
    const projectDir = join(root, 'project');
    const codexHome = join(root, 'codex');
    mkdirSync(projectDir, { recursive: true });
    const filePath = sessionPath(codexHome, 'rollout-index.jsonl');
    const now = new Date().toISOString();
    writeJsonl(filePath, [
      { timestamp: now, type: 'session_meta', payload: { session_id: 'session-index', id: 'thread-index', timestamp: now, cwd: projectDir } },
      usage('response-index', 100, now),
    ]);

    const first = await scanCodexSessions({ projectDir, codexHome, homeDir: root, useIndex: true, sinceMs: Date.now() - 60_000, limit: 5 });
    const second = await scanCodexSessions({ projectDir, codexHome, homeDir: root, useIndex: true, sinceMs: Date.now() - 60_000, limit: 5 });

    expect(first.index.cacheHits).toBe(0);
    expect(second.index.cacheHits).toBe(1);
    expect(second.index.path).toBe(join(root, '.skill-doctor', 'benefit', 'session-index.json'));
    expect(second.selected[0].summary.inputTokens).toBe(100);

    appendFileSync(filePath, `${JSON.stringify(usage('response-index-2', 50, now))}\n`, 'utf8');
    const third = await scanCodexSessions({ projectDir, codexHome, homeDir: root, useIndex: true, sinceMs: Date.now() - 60_000, limit: 5 });

    expect(third.index.cacheHits).toBe(0);
    expect(third.index.incrementalFiles).toBe(1);
    expect(third.index.rebuiltFiles).toBe(0);
    expect(third.selected[0].summary).toMatchObject({ inputTokens: 150, responseCount: 2, completeResponseCount: 2 });
  });

  it('reloads historical context text from the local source when the metadata index omits正文', async () => {
    const root = mkdtempSync('/tmp/skill-doctor-benefit-index-context-');
    roots.push(root);
    const projectDir = join(root, 'project');
    const codexHome = join(root, 'codex');
    mkdirSync(projectDir, { recursive: true });
    const filePath = sessionPath(codexHome, 'rollout-index-context.jsonl');
    const now = new Date().toISOString();
    writeJsonl(filePath, [
      { timestamp: now, type: 'session_meta', payload: { session_id: 'session-index-context', id: 'thread-index-context', timestamp: now, cwd: projectDir } },
      { timestamp: now, type: 'world_state', payload: { full: true, state: { host_skills: { body: '### Available skills\n- removable-skill: description', complete: true } } } },
      usage('response-index-context', 100, now),
    ]);

    await scanCodexSessions({ projectDir, codexHome, homeDir: root, useIndex: true, sinceMs: Date.now() - 60_000, limit: 5 });
    const second = await scanCodexSessions({ projectDir, codexHome, homeDir: root, useIndex: true, sinceMs: Date.now() - 60_000, limit: 5 });

    expect(second.index.cacheHits).toBe(0);
    expect(second.selected[0]?.analysis.contextSnapshots[0]?.hostSkillsText).toContain('removable-skill');
    expect(second.diagnostics.some((item) => item.code === 'index.context_text_reloaded')).toBe(true);

    appendFileSync(filePath, `${JSON.stringify(usage('response-context-continued', 150, now))}\n`, 'utf8');
    const third = await scanCodexSessions({ projectDir, codexHome, homeDir: root, useIndex: true, sinceMs: Date.now() - 60_000, limit: 5 });
    expect(third.index.rebuiltFiles).toBe(1);
    expect(third.selected[0]?.analysis.contextSnapshots[0]?.hostSkillsText).toContain('removable-skill');
    expect(third.selected[0]?.usage.map((record) => record.contextSnapshotLine)).toEqual([2, 2]);
  });

  it('rebuilds the indexed analysis after a file is truncated or rewritten', async () => {
    const root = mkdtempSync('/tmp/skill-doctor-benefit-index-rebuild-');
    roots.push(root);
    const projectDir = join(root, 'project');
    const codexHome = join(root, 'codex');
    mkdirSync(projectDir, { recursive: true });
    const filePath = sessionPath(codexHome, 'rollout-index-rebuild.jsonl');
    const now = new Date().toISOString();
    const meta = { timestamp: now, type: 'session_meta', payload: { session_id: 'session-index-rebuild', id: 'thread-index-rebuild', timestamp: now, cwd: projectDir } };
    writeJsonl(filePath, [meta, usage('response-index-rebuild', 100, now)]);

    await scanCodexSessions({ projectDir, codexHome, homeDir: root, useIndex: true, sinceMs: Date.now() - 60_000, limit: 5 });
    writeJsonl(filePath, [meta]);
    const rebuilt = await scanCodexSessions({ projectDir, codexHome, homeDir: root, useIndex: true, sinceMs: Date.now() - 60_000, limit: 5 });

    expect(rebuilt.index.cacheHits).toBe(0);
    expect(rebuilt.index.incrementalFiles).toBe(0);
    expect(rebuilt.index.rebuiltFiles).toBe(1);
    expect(rebuilt.selected[0]?.summary.inputTokens).toBe(0);
  });

  it('extracts developer and user context blocks from response items and re-anchors after compaction', async () => {
    const root = mkdtempSync('/tmp/skill-doctor-benefit-response-context-');
    roots.push(root);
    const projectDir = join(root, 'project');
    const codexHome = join(root, 'codex');
    mkdirSync(projectDir, { recursive: true });
    const filePath = sessionPath(codexHome, 'rollout-response-context.jsonl');
    const now = new Date().toISOString();
    const developerText = [
      '<permissions instructions>',
      'Use the configured approval and sandbox policy.',
      '</permissions instructions>',
      '<collaboration_mode>',
      '# Collaboration Mode: Default',
      '</collaboration_mode>',
      '<apps_instructions>',
      'Apps may be triggered by explicit connector mentions.',
      '</apps_instructions>',
      '<plugins_instructions>',
      'Plugins contribute skills, MCP servers, and apps.',
      '</plugins_instructions>',
      '<app-context>',
      'Codex desktop host context.',
      '</app-context>',
      '<skills_instructions>',
      '- `r0` = `/tmp/skills`',
      '### Available skills',
      '- imagegen: Generate raster images.',
      '</skills_instructions>',
    ].join('\n');
    const userText = [
      '<recommended_plugins>',
      '- GitHub (github@openai-curated-remote)',
      '</recommended_plugins>',
      '<environment_context>',
      'cwd: /tmp/project',
      '</environment_context>',
    ].join('\n');
    const responseItem = (role: 'developer' | 'user', text: string) => ({
      timestamp: now,
      type: 'response_item',
      payload: { type: 'message', role, content: [{ type: 'input_text', text }] },
    });
    writeJsonl(filePath, [
      { timestamp: now, type: 'session_meta', payload: { session_id: 'session-response-context', id: 'thread-response-context', timestamp: now, cwd: projectDir } },
      responseItem('developer', developerText),
      responseItem('user', userText),
      usage('response-initial', 1000, now),
      { timestamp: now, type: 'compacted', payload: {} },
      responseItem('user', userText),
      usage('response-after-compaction', 900, now),
      { timestamp: now, type: 'world_state', payload: { full: true, state: {} } },
      responseItem('developer', developerText),
      responseItem('user', userText),
      usage('response-after-reanchor', 1100, now),
    ]);

    const result = await scanCodexSessions({ projectDir, codexHome, sinceMs: Date.now() - 60_000, limit: 5 });
    const selection = result.selected[0];
    const initial = selection?.analysis.contextSnapshots.slice(0, 2);
    const firstUsage = selection?.usage.find((record) => record.responseId === 'response-initial');
    const compactedUsage = selection?.usage.find((record) => record.responseId === 'response-after-compaction');
    const reanchoredUsage = selection?.usage.find((record) => record.responseId === 'response-after-reanchor');

    expect(initial).toHaveLength(2);
    expect(initial?.[0]).toMatchObject({ sourceKind: 'response_item', role: 'developer', contextBlocksComplete: true });
    expect(initial?.[1]).toMatchObject({ sourceKind: 'response_item', role: 'user', contextBlocksComplete: true });
    expect(initial?.flatMap((snapshot) => snapshot.contextBlocks ?? []).map((block) => block.id)).toEqual([
      'permissions_instructions',
      'collaboration_mode',
      'apps_instructions',
      'plugins_instructions',
      'app_context',
      'skills_instructions',
      'recommended_plugins',
      'environment_context',
    ]);
    expect(initial?.flatMap((snapshot) => snapshot.contextBlocks ?? [])
      .filter((block) => block.id !== 'skills_instructions')
      .every((block) => block.controllable === false)).toBe(true);
    expect(firstUsage).toMatchObject({ contextSnapshotLine: 3, contextSnapshotLines: [2, 3] });
    expect(compactedUsage?.contextSnapshotLine).toBeUndefined();
    expect(compactedUsage?.contextSnapshotLines).toBeUndefined();
    expect(reanchoredUsage).toMatchObject({ contextSnapshotLine: 10, contextSnapshotLines: [9, 10] });
    expect(selection?.diagnostics.some((item) => item.code === 'context.response_item_awaiting_full_snapshot')).toBe(true);
    expect(selection?.diagnostics.some((item) => item.code === 'context.snapshot_invalidated_by_compaction')).toBe(true);
  });

  it('uses content item metadata and ignores literal block tags in non-context items', async () => {
    const root = mkdtempSync('/tmp/skill-doctor-benefit-metadata-context-');
    roots.push(root);
    const filePath = sessionPath(join(root, 'codex'), 'rollout-metadata-context.jsonl');
    const now = new Date().toISOString();
    writeJsonl(filePath, [
      { timestamp: now, type: 'session_meta', payload: { session_id: 'session-metadata', id: 'thread-metadata', timestamp: now, cwd: join(root, 'project') } },
      {
        timestamp: now,
        type: 'response_item',
        payload: {
          type: 'message',
          role: 'developer',
          content: [{ type: 'input_text', text: 'Memory documentation mentions <skills_instructions> but is not a header item.' }],
          internal_chat_message_metadata_passthrough: { content_item_kinds: ['memories.instructions'] },
        },
      },
      {
        timestamp: now,
        type: 'response_item',
        payload: {
          type: 'message',
          role: 'user',
          content: [{ type: 'input_text', text: '<recommended_plugins>\n- GitHub (github@openai-curated-remote)\n</recommended_plugins>' }],
          internal_chat_message_metadata_passthrough: { content_item_kinds: ['plugins.recommendations'] },
        },
      },
    ]);

    const result = await analyzeCodexSessionFile(filePath);
    const blocks = result.contextSnapshots.flatMap((snapshot) => snapshot.contextBlocks ?? []);
    expect(blocks.map((block) => block.id)).toEqual(['recommended_plugins']);
    expect(blocks[0]).toMatchObject({
      evidenceLevel: 'runtime-item-observed',
      provenance: {
        sourcePath: filePath,
        role: 'user',
        contentItemKind: 'plugins.recommendations',
        contentItemIndex: 0,
        sessionId: 'session-metadata',
        threadId: 'thread-metadata',
      },
    });
    const header = contextBlockAnalysisFromSession(result);
    expect(header.verification?.find((entry) => entry.id === 'skills_instructions')).toMatchObject({ status: 'absent', evidenceLevel: 'runtime-item-observed' });
    expect(header.verification?.find((entry) => entry.id === 'recommended_plugins')).toMatchObject({ status: 'present' });
  });
});
