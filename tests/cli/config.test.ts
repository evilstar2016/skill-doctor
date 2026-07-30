import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { main } from '../../src/cli/index';

interface RunResult {
  stdout: string;
  stderr: string;
  status: number;
}

async function runMain(args: string[]): Promise<RunResult> {
  const stdoutChunks: string[] = [];
  const stderrChunks: string[] = [];
  const stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation((chunk: string | Uint8Array) => {
    stdoutChunks.push(typeof chunk === 'string' ? chunk : new TextDecoder().decode(chunk));
    return true;
  });
  const stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation((chunk: string | Uint8Array) => {
    stderrChunks.push(typeof chunk === 'string' ? chunk : new TextDecoder().decode(chunk));
    return true;
  });
  const prevExit = process.exitCode;
  let status = 0;
  try {
    await main(args);
  } finally {
    status = typeof process.exitCode === 'number' ? process.exitCode : 0;
    stdoutSpy.mockRestore();
    stderrSpy.mockRestore();
    process.exitCode = prevExit;
  }
  return {
    stdout: stdoutChunks.join(''),
    stderr: stderrChunks.join(''),
    status,
  };
}

describe('skill-doctor config command', () => {
  let home: string;

  beforeEach(() => {
    home = mkdtempSync(join(tmpdir(), 'skill-doctor-config-'));
    process.env.HOME = home;
    process.env.USERPROFILE = home;
  });

  afterEach(() => {
    rmSync(home, { recursive: true, force: true });
    delete process.env.HOME;
    delete process.env.USERPROFILE;
  });

  it('view reports no configuration when config.json is absent', async () => {
    const result = await runMain(['config', 'view', '--json']);
    expect(result.status).toBe(0);
    expect(JSON.parse(result.stdout)).toEqual({});
  });

  it('set analysis then view reflects the configured values', async () => {
    const setResult = await runMain([
      'config', 'set', 'analysis',
      '--base-url', 'http://localhost/v1',
      '--model', 'gpt-4o',
      '--api-key', 'secret',
      '--json',
    ]);
    expect(setResult.status).toBe(0);

    const view = await runMain(['config', 'view', '--json']);
    const parsed = JSON.parse(view.stdout);
    expect(parsed.analysis).toMatchObject({
      baseUrl: 'http://localhost/v1',
      model: 'gpt-4o',
      apiKeyConfigured: true,
    });
  });

  it('set merges partial updates with the existing service config', async () => {
    await runMain(['config', 'set', 'analysis', '--base-url', 'http://localhost/v1', '--model', 'gpt-4o', '--api-key', 'secret']);
    // Only update the api key; baseUrl/model must be preserved.
    const update = await runMain(['config', 'set', 'analysis', '--api-key', 'rotated', '--json']);
    expect(update.status).toBe(0);
    const parsed = JSON.parse(update.stdout);
    expect(parsed.analysis).toMatchObject({
      baseUrl: 'http://localhost/v1',
      model: 'gpt-4o',
      apiKeyConfigured: true,
    });

    // A sibling embedding config must survive an analysis update.
    await runMain(['config', 'set', 'embedding', '--base-url', 'http://localhost/v1', '--model', 'bge-m3']);
    const withBoth = await runMain(['config', 'view', '--json']);
    const both = JSON.parse(withBoth.stdout);
    expect(both.analysis.apiKeyConfigured).toBe(true);
    expect(both.embedding.model).toBe('bge-m3');
  });

  it('set --clear-api-key removes the stored key and keeps base/model', async () => {
    await runMain(['config', 'set', 'analysis', '--base-url', 'http://localhost/v1', '--model', 'gpt-4o', '--api-key', 'secret']);
    const cleared = await runMain(['config', 'set', 'analysis', '--clear-api-key', '--json']);
    expect(cleared.status).toBe(0);
    const parsed = JSON.parse(cleared.stdout);
    expect(parsed.analysis.apiKeyConfigured).toBe(false);
    expect(parsed.analysis.baseUrl).toBe('http://localhost/v1');
    expect(parsed.analysis.model).toBe('gpt-4o');
  });

  it('set without a service name fails with usage on stderr', async () => {
    const result = await runMain(['config', 'set', '--base-url', 'http://localhost/v1']);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('Usage: skill-doctor config set');
  });

  it('set with no fields fails', async () => {
    const result = await runMain(['config', 'set', 'analysis']);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('Nothing to set');
  });

  it('test fails deterministically when the service is not configured', async () => {
    const result = await runMain(['config', 'test', '--service', 'analysis', '--json']);
    expect(result.status).toBe(1);
    const parsed = JSON.parse(result.stdout);
    expect(parsed).toMatchObject({ ok: false, service: 'analysis' });
  });
});
