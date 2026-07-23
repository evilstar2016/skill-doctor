import { createReadStream, existsSync, realpathSync, statSync } from 'node:fs';
import { createServer, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { dirname, extname, relative, resolve, sep } from 'node:path';

import { sendJson } from './apiPrimitives';
import { handleApi } from './router';
import { ScanManager } from './scanManager';
import { createUiSessionSecurity } from './security';

export interface StartUiServerOptions {
  projectDir: string;
  port?: number;
  host?: string;
  homeDir?: string;
  uiDir?: string;
}

export interface UiServerHandle {
  url: string;
  port: number;
  host: string;
  close(): Promise<void>;
}

export async function startUiServer(options: StartUiServerOptions): Promise<UiServerHandle> {
  const host = options.host ?? '127.0.0.1';
  if (host !== '127.0.0.1' && host !== 'localhost') throw new Error('Skill Doctor UI only binds to loopback addresses.');
  const projectDir = resolve(options.projectDir);
  const executablePath = process.argv[1] && existsSync(process.argv[1]) ? realpathSync(process.argv[1]) : process.argv[1] ?? '';
  const bundledUiDir = resolve(dirname(executablePath), 'ui');
  const uiDir = options.uiDir ?? (existsSync(bundledUiDir) ? bundledUiDir : resolve(process.cwd(), 'dist/ui'));
  const security = createUiSessionSecurity();
  const scans = new ScanManager(options.homeDir);
  let port = options.port ?? 0;

  const server = createServer(async (request, response) => {
    security.setSecurityHeaders(response);
    try {
      const url = new URL(request.url ?? '/', `http://${request.headers.host ?? '127.0.0.1'}`);
      if (!security.validateHost(request, port)) return sendJson(response, 403, { error: { code: 'invalid_host', message: 'Request host is not allowed.' } });
      if (security.acceptBootstrap(url.pathname, response)) return;
      if (!security.authorize(request)) return sendJson(response, 401, { error: { code: 'unauthorized', message: 'Open the UI using the URL printed by skill-doctor.' } });
      if (request.method !== 'GET' && !security.validateOrigin(request, port)) {
        return sendJson(response, 403, { error: { code: 'invalid_origin', message: 'Request origin is not allowed.' } });
      }
      if (url.pathname.startsWith('/api/')) {
        await handleApi(request, response, url, { projectDir, homeDir: options.homeDir, scans });
        return;
      }
      serveStatic(response, uiDir, url.pathname);
    } catch (error) {
      sendJson(response, 500, { error: { code: 'internal_error', message: error instanceof Error ? error.message : String(error) } });
    }
  });

  await new Promise<void>((resolveListen, reject) => {
    server.once('error', reject);
    server.listen(port, host, () => resolveListen());
  });
  port = (server.address() as AddressInfo).port;

  return {
    url: `http://${host}:${port}${security.sessionPath}`,
    port,
    host,
    close: () => new Promise<void>((resolveClose, reject) => server.close((error) => error ? reject(error) : resolveClose())),
  };
}

function serveStatic(response: ServerResponse, uiDir: string, pathname: string): void {
  const requested = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '');
  const candidate = resolve(uiDir, requested);
  const assetRelativePath = relative(resolve(uiDir), candidate);
  if (assetRelativePath.startsWith('..') || assetRelativePath.includes(`${sep}..${sep}`)) {
    return sendJson(response, 403, { error: { code: 'invalid_path', message: 'Invalid asset path.' } });
  }
  const path = existsSync(candidate) && statSync(candidate).isFile() ? candidate : resolve(uiDir, 'index.html');
  if (!existsSync(path)) return sendJson(response, 503, { error: { code: 'ui_not_built', message: 'UI assets are missing. Run npm run build:ui.' } });
  response.statusCode = 200;
  response.setHeader('Content-Type', mimeType(path));
  createReadStream(path).pipe(response);
}

function mimeType(path: string): string {
  return ({ '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.json': 'application/json; charset=utf-8' } as Record<string, string>)[extname(path)] ?? 'application/octet-stream';
}
