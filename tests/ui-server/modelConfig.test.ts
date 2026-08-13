import { createServer, get as httpGet, type Server } from 'node:http';
import { type AddressInfo } from 'node:net';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { startUiServer, type UiServerHandle } from '../../src/ui-server/startUiServer';
import { cleanupTempRoots, createTempRoot, writeFile } from '../helpers/cliHarness';

describe('UI model configuration', () => {
  let handle: UiServerHandle | undefined;
  let modelServer: Server | undefined;

  afterEach(async () => {
    await handle?.close();
    await closeServer(modelServer);
    cleanupTempRoots();
  });

  it('bootstrap capabilities reflect current model config even when an older snapshot exists', async () => {
    const root = createTempRoot();
    const projectDir = join(root, 'project');
    const homeDir = join(root, 'home');
    const uiDir = join(root, 'ui');
    writeFile(join(uiDir, 'index.html'), '<div id="root">Skill Doctor</div>');
    writeFile(join(projectDir, '.keep'), '');

    handle = await startUiServer({ projectDir, homeDir, uiDir, port: 0 });
    const baseUrl = `http://${handle.host}:${handle.port}`;
    const session = await fetch(handle.url, { redirect: 'manual' });
    const cookie = session.headers.get('set-cookie')!.split(';')[0];
    const headers = { Cookie: cookie, Origin: baseUrl, 'Content-Type': 'application/json' };

    // Run a scan before any model is configured so the cached snapshot has model capabilities false.
    const beforeConfig = await fetch(`${baseUrl}/api/bootstrap`, { headers: { Cookie: cookie } }).then((res) => res.json());
    expect(beforeConfig.capabilities.aiAuditConfigured).toBe(false);
    expect(beforeConfig.capabilities.embeddingConfigured).toBe(false);

    await runScanAndWait(baseUrl, cookie);

    const snapshotCapabilities = await fetch(`${baseUrl}/api/snapshots/current`, { headers: { Cookie: cookie } }).then((res) => res.json());
    expect(snapshotCapabilities.capabilities.aiAuditConfigured).toBe(false);
    expect(snapshotCapabilities.capabilities.embeddingConfigured).toBe(false);

    // Save model configuration; bootstrap must now report the updated capabilities.
    const saved = await fetch(`${baseUrl}/api/model-config`, {
      method: 'PUT', headers,
      body: JSON.stringify({
        analysis: { baseUrl: 'http://localhost/v1', model: 'chat-model' },
        embedding: { baseUrl: 'http://localhost/v1', model: 'embed-model' },
      }),
    });
    expect(saved.status).toBe(200);

    const afterConfig = await fetch(`${baseUrl}/api/bootstrap`, { headers: { Cookie: cookie } }).then((res) => res.json());
    expect(afterConfig.capabilities.aiAuditConfigured).toBe(true);
    expect(afterConfig.capabilities.embeddingConfigured).toBe(true);
    // Snapshot itself should not have been mutated by the bootstrap call.
    expect(afterConfig.snapshot?.capabilities.aiAuditConfigured).toBe(false);
  });

  it('persists model configuration, hides saved keys, and tests standard API calls', async () => {
    const root = createTempRoot();
    const projectDir = join(root, 'project');
    const homeDir = join(root, 'home');
    const uiDir = join(root, 'ui');
    writeFile(join(uiDir, 'index.html'), '<div id="root">Skill Doctor</div>');
    writeFile(join(projectDir, '.keep'), '');
    modelServer = createServer((request, response) => {
      response.setHeader('Content-Type', 'application/json');
      if (request.url === '/v1/chat/completions') response.end(JSON.stringify({ choices: [{ message: { content: 'OK' } }] }));
      else if (request.url === '/v1/embeddings') response.end(JSON.stringify({ data: [{ embedding: [0.1] }] }));
      else response.writeHead(404).end(JSON.stringify({ error: { message: 'not found' } }));
    });
    await listen(modelServer);
    const modelUrl = `http://127.0.0.1:${(modelServer.address() as AddressInfo).port}/v1`;

    handle = await startUiServer({ projectDir, homeDir, uiDir, port: 0 });
    const baseUrl = `http://${handle.host}:${handle.port}`;
    const session = await fetch(handle.url, { redirect: 'manual' });
    const cookie = session.headers.get('set-cookie')!.split(';')[0];
    const headers = { Cookie: cookie, Origin: baseUrl, 'Content-Type': 'application/json' };

    const saved = await fetch(`${baseUrl}/api/model-config`, {
      method: 'PUT', headers,
      body: JSON.stringify({
        analysis: { baseUrl: modelUrl, model: 'chat-model', apiKey: 'secret', timeoutMs: 5000 },
        embedding: { baseUrl: modelUrl, model: 'embed-model' },
      }),
    });
    expect(saved.status).toBe(200);
    expect((await saved.json()).config.analysis).toEqual(expect.objectContaining({ model: 'chat-model', apiKeyConfigured: true }));

    const loaded = await fetch(`${baseUrl}/api/model-config`, { headers: { Cookie: cookie } });
    expect(await loaded.json()).toEqual({
      analysis: { baseUrl: modelUrl, model: 'chat-model', timeoutMs: 5000, apiKeyConfigured: true },
      embedding: { baseUrl: modelUrl, model: 'embed-model', apiKeyConfigured: false },
    });

    const analysisTest = await fetch(`${baseUrl}/api/model-config/test`, { method: 'POST', headers, body: JSON.stringify({ kind: 'analysis' }) });
    const embeddingTest = await fetch(`${baseUrl}/api/model-config/test`, { method: 'POST', headers, body: JSON.stringify({ kind: 'embedding' }) });
    expect(await analysisTest.json()).toEqual({ message: 'Analysis model is reachable.' });
    expect(await embeddingTest.json()).toEqual({ message: 'Embedding model is reachable.' });
  });
});

function listen(server: Server): Promise<void> {
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      server.off('error', reject);
      resolve();
    });
  });
}

function closeServer(server: Server | undefined): Promise<void> {
  if (!server?.listening) return Promise.resolve();
  return new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
}

async function runScanAndWait(baseUrl: string, cookie: string): Promise<void> {
  const response = await fetch(`${baseUrl}/api/scans`, {
    method: 'POST',
    headers: { Cookie: cookie, Origin: baseUrl, 'Content-Type': 'application/json' },
    body: JSON.stringify({}),
  });
  const { scanId } = await response.json() as { scanId: string };

  return new Promise((resolve, reject) => {
    const url = new URL(`${baseUrl}/api/scans/${encodeURIComponent(scanId)}/events`);
    const request = httpGet(url, { headers: { Cookie: cookie, Host: url.host } });
    const timeout = setTimeout(() => { request.destroy(); reject(new Error('Scan did not complete in time.')); }, 10000);

    let buffer = '';
    request.on('response', (incoming) => {
      incoming.setEncoding('utf8');
      incoming.on('data', (chunk: string) => {
        buffer += chunk;
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';
        for (const line of lines) {
          if (line.startsWith('event: complete')) { clearTimeout(timeout); request.destroy(); resolve(); return; }
          if (line.startsWith('event: error')) { clearTimeout(timeout); request.destroy(); reject(new Error('Scan failed.')); return; }
        }
      });
      incoming.on('end', () => { clearTimeout(timeout); resolve(); });
      incoming.on('error', (error) => { clearTimeout(timeout); request.destroy(); reject(error); });
    });
    request.on('error', (error) => { clearTimeout(timeout); reject(error); });
  });
}
