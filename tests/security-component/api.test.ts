import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import { startUiServer } from '../../src/ui-server/startUiServer';
import { upstreamInfo } from '../../src/security-component/component';

it('authenticates component requests and persists only validated reports', async () => {
  const root = mkdtempSync(join(tmpdir(), 'security-api-'));
  const server = await startUiServer({ projectDir: root, homeDir: root, port: 0 });
  const origin = new URL(server.url).origin;
  try {
    expect((await fetch(`${origin}/api/security-component`)).status).toBe(401);
    const bootstrap = await fetch(server.url, { redirect: 'manual' });
    const cookie = bootstrap.headers.get('set-cookie')!.split(';')[0];
    const request = (body?: unknown) => fetch(`${origin}/api/security-component`, { headers: { cookie, 'Content-Type': 'application/json' }, ...(body ? { method: 'POST', body: JSON.stringify(body) } : {}) });
    expect((await (await request()).json()).enabled).toBe(false);
    expect((await request({ action: 'prepare', mode: 'design', scope: 'docs', revision: 'abc' })).status).toBe(400);
    await request({ action: 'enable', enabled: true });
    const task = await (await request({ action: 'prepare', mode: 'design', scope: 'docs', revision: 'abc' })).json();
    expect(task.task).toContain(upstreamInfo().commit);
    expect((await request({ action: 'import', report: {} })).status).toBe(400);
    const report = { schemaVersion: 1, mode: 'code', upstreamCommit: upstreamInfo().commit, target: root, revision: 'abc', scope: 'src', findings: [] };
    expect((await request({ action: 'import', report })).status).toBe(200);
    expect((await (await request({ action: 'import', report })).json()).reports).toHaveLength(1);
  } finally {
    await server.close();
    rmSync(root, { recursive: true, force: true });
  }
});
