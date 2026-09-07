import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { main } from '../../src/cli/index';

interface RunResult {
  stdout: string;
  stderr: string;
  status: number;
}

async function runMain(args: string[]): Promise<RunResult> {
  const stdout: string[] = [];
  const stderr: string[] = [];
  const stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation((chunk: string | Uint8Array) => {
    stdout.push(typeof chunk === 'string' ? chunk : new TextDecoder().decode(chunk));
    return true;
  });
  const stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation((chunk: string | Uint8Array) => {
    stderr.push(typeof chunk === 'string' ? chunk : new TextDecoder().decode(chunk));
    return true;
  });
  const previousExitCode = process.exitCode;
  process.exitCode = undefined;
  let status = 0;
  try {
    await main(args);
  } finally {
    status = typeof process.exitCode === 'number' ? process.exitCode : 0;
    stdoutSpy.mockRestore();
    stderrSpy.mockRestore();
  }
  process.exitCode = previousExitCode;
  return { stdout: stdout.join(''), stderr: stderr.join(''), status };
}

describe('benefit CLI', () => {
  let root: string;
  let previousHome: string | undefined;
  let previousUserProfile: string | undefined;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'skill-doctor-benefit-cli-'));
    previousHome = process.env.HOME;
    previousUserProfile = process.env.USERPROFILE;
    process.env.HOME = join(root, 'home');
    process.env.USERPROFILE = join(root, 'home');
  });

  afterEach(() => {
    if (previousHome === undefined) delete process.env.HOME;
    else process.env.HOME = previousHome;
    if (previousUserProfile === undefined) delete process.env.USERPROFILE;
    else process.env.USERPROFILE = previousUserProfile;
    rmSync(root, { recursive: true, force: true });
  });

  it('emits the same structured report as the estimator for a fixture session', async () => {
    const projectDir = join(root, 'project');
    const sessionDir = join(process.env.HOME!, '.codex', 'sessions', '2026', '09', '07');
    const sessionPath = join(sessionDir, 'rollout-cli.jsonl');
    const now = new Date().toISOString();
    mkdirSync(projectDir, { recursive: true });
    mkdirSync(sessionDir, { recursive: true });
    writeFileSync(sessionPath, [
      { timestamp: now, type: 'session_meta', payload: { session_id: 'session-cli', id: 'thread-cli', timestamp: now, cwd: projectDir } },
      { timestamp: now, type: 'turn_context', payload: { turn_id: 'turn-cli', cwd: projectDir, model: 'gpt-6-astra', effort: 'high' } },
      { timestamp: now, type: 'token_usage_record', payload: {
        thread_id: 'thread-cli', session_id: 'session-cli', turn_id: 'turn-cli', response_id: 'response-cli',
        usage: { input_tokens: 1000, cached_input_tokens: 100, cache_write_input_tokens: 0, output_tokens: 20, reasoning_output_tokens: 5, total_tokens: 1020 },
      } },
    ].map((row) => JSON.stringify(row)).join('\n') + '\n', 'utf8');
    const planDir = join(process.env.HOME!, '.skill-doctor', 'context-optimizer', 'plans');
    mkdirSync(planDir, { recursive: true });
    writeFileSync(join(planDir, 'plan-cli.json'), JSON.stringify({
      schemaVersion: 1,
      kind: 'skill-doctor-context-plan',
      id: 'plan-cli',
      createdAt: now,
      projectDir,
      inventoryFingerprint: createHash('sha256').update('[]').digest('hex'),
      baseline: { totalEstimatedTokens: 1000 },
      estimate: { fixedEstimatedTokens: 100, estimatedAfterTokens: 900 },
    }), 'utf8');

    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(() => {
      throw new Error('network access is forbidden in benefit analysis');
    });
    const result = await runMain(['benefit', '--project', projectDir, '--since', '24h', '--limit', '5', '--tokenizer', 'approx', '--json']);
    fetchSpy.mockRestore();
    const report = JSON.parse(result.stdout) as { plan?: { id: string }; savings: { status: string; inputTokens?: number }; index: { enabled: boolean }; simulation: { reexecutedCodex: boolean; tokenizer: { mode: string } } };

    expect(result.status).toBe(0);
    expect(result.stderr).toBe('');
    expect(report.plan?.id).toBe('plan-cli');
    expect(report.savings).toMatchObject({ status: 'estimated', inputTokens: 100 });
    expect(report.index.enabled).toBe(true);
    expect(report.simulation.reexecutedCodex).toBe(false);
    expect(report.simulation.tokenizer.mode).toBe('approx');
    expect(fetchSpy).not.toHaveBeenCalled();

    const invalidRetention = await runMain(['benefit', '--project', projectDir, '--retention-days', '0', '--json']);
    expect(invalidRetention.status).toBe(1);
    expect(invalidRetention.stderr).toContain('Invalid --retention-days');

    const htmlPath = join(root, 'benefit.html');
    const htmlResult = await runMain(['benefit', '--project', projectDir, '--since', '24h', '--limit', '5', '--format', 'html', '--output', htmlPath]);
    expect(htmlResult.status).toBe(0);
    expect(readFileSync(htmlPath, 'utf8')).toContain('<!doctype html>');
    expect(readFileSync(htmlPath, 'utf8')).not.toContain(projectDir);

    const deleteEntryResult = await runMain(['benefit', '--project', projectDir, '--delete-index-entry', sessionPath, '--json']);
    expect(JSON.parse(deleteEntryResult.stdout)).toMatchObject({ deleted: true, deletedEntries: 1, kind: 'skill-doctor-benefit-index-entry' });
    await runMain(['benefit', '--project', projectDir, '--since', '24h', '--limit', '5', '--json']);

    const deleteResult = await runMain(['benefit', '--project', projectDir, '--delete-index', '--json']);
    expect(JSON.parse(deleteResult.stdout)).toMatchObject({ deleted: true, kind: 'skill-doctor-benefit-index' });
    expect(existsSync(join(process.env.HOME!, '.skill-doctor', 'benefit', 'session-index.json'))).toBe(false);
  });
});
