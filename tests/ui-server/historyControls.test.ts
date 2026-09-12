import { existsSync, readFileSync, realpathSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { startUiServer, type UiServerHandle } from '../../src/ui-server/startUiServer';
import { BenefitManager } from '../../src/ui-server/benefitManager';
import { cleanupTempRoots, createTempRoot, writeFile } from '../helpers/cliHarness';

describe('benefit control HTTP API', () => {
  let handle: UiServerHandle | undefined;
  afterEach(async () => { await handle?.close(); vi.restoreAllMocks(); cleanupTempRoots(); });
  it('uses the server-held report, requires confirmation, writes project config and undoes', async () => {
    const root = createTempRoot(); const projectDir = join(root, 'project'); const homeDir = join(root, 'home');
    writeFile(join(projectDir, 'README.md'), 'fixture');
    vi.spyOn(BenefitManager.prototype, 'getReport').mockImplementation((id) => {
      if (id !== 'fixture-job') throw new Error('Report expired');
      return { kind: 'skill-doctor-codex-benefit-report', projectDir, historyAnalysis: { usageProfile: [] } } as any;
    });
    handle = await startUiServer({ projectDir, homeDir, port: 0 });
    const origin = new URL(handle.url).origin;
    const bootstrap = await fetch(handle.url, { redirect: 'manual' });
    const cookie = bootstrap.headers.get('set-cookie')!.split(';')[0];
    const post = (body: object, authorized = true) => fetch(`${origin}/api/benefits/control`, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: origin, ...(authorized ? { Cookie: cookie } : {}) }, body: JSON.stringify(body) });
    const input = { jobId: 'fixture-job', kind: 'recommendations', id: 'recommended_plugins', enabled: false, projectDir: homeDir };
    expect((await post(input, false)).status).toBe(401);
    const preview = await (await post(input)).json() as any;
    expect(preview.scope).toBe('project'); expect(preview.configPath).toBe(join(realpathSync(projectDir), '.codex/config.toml'));
    expect(preview.before).toBeUndefined(); expect(preview.after).toBeUndefined();
    expect(existsSync(preview.configPath)).toBe(false);
    expect((await post({ ...input, confirmation: 'wrong' })).status).toBe(500);
    const result = await (await post({ ...input, confirmation: preview.digest })).json() as any;
    expect(readFileSync(preview.configPath, 'utf8')).toContain('recommended_plugins = false');
    expect(existsSync(join(homeDir, '.codex/config.toml'))).toBe(false);
    expect((await post({ jobId: 'fixture-job', undo: result.operationId, confirmation: 'wrong' })).status).toBe(500);
    const restored = await (await post({ jobId: 'fixture-job', undo: result.operationId, confirmation: result.operationId })).json() as any;
    expect(restored.restored).toBe(true); expect(existsSync(preview.configPath)).toBe(false);
    expect((await post({ ...input, jobId: 'expired' })).status).toBe(500);
  });
});
