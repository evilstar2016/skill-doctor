import { createServer, type Server } from 'node:http';
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
