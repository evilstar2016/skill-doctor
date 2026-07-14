import { existsSync, statSync } from 'node:fs';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { resolve } from 'node:path';

import type { HealthCheckOptions } from '../application/types';
import { detectAgents } from '../discovery/detectAgents';
import { normalizePlatformName } from '../platforms/registry';
import type { Platform, Scope } from '../types/skill';
import { readJsonBody, sendJson } from './apiPrimitives';
import type { ApiRequestContext } from './apiContext';

export async function handleScanRoute(
  request: IncomingMessage,
  response: ServerResponse,
  url: URL,
  context: ApiRequestContext,
): Promise<boolean> {
  if (request.method === 'POST' && url.pathname === '/api/scans') {
    const body = await readJsonBody(request);
    const projectDir = readProjectDir(body.projectDir, context.projectDir);
    const scanOptions: HealthCheckOptions = {
      projectDir,
      scope: readScope(body.scope),
      platform: readPlatform(body.platform),
      includeContext: body.includeContext !== false,
      includeDisabled: body.includeDisabled !== false,
      includeCache: body.includeCache === true,
      discoverMcpTools: body.discoverMcpTools !== false,
      useAiAudit: body.useAiAudit === true,
      conflictStrategy: body.conflictStrategy === 'embedding' ? 'embedding' : 'token',
      analyzeConflicts: body.analyzeConflicts === true,
      budgetTokens: positiveInt(body.budgetTokens),
      tokenizer: body.tokenizer === 'approx' ? 'approx' : 'openai',
      tokenizerModel: typeof body.tokenizerModel === 'string' ? body.tokenizerModel : undefined,
      homeDir: context.homeDir,
    };
    sendJson(response, 202, { scanId: context.scans.start(scanOptions) });
    return true;
  }

  if (request.method === 'POST' && url.pathname === '/api/agents/detect') {
    const body = await readJsonBody(request);
    const projectDir = readProjectDir(body.projectDir, context.projectDir);
    const sources = context.getScanSources(projectDir);
    sendJson(response, 200, { projectDir, agents: detectAgents(projectDir, { homeDir: context.homeDir, sources }) });
    return true;
  }

  const eventMatch = url.pathname.match(/^\/api\/scans\/([^/]+)\/events$/);
  if (request.method === 'GET' && eventMatch) {
    response.statusCode = 200;
    response.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    response.setHeader('Connection', 'keep-alive');
    if (!context.scans.subscribe(eventMatch[1], response)) sendJson(response, 404, { error: { code: 'scan_not_found', message: 'Scan not found.' } });
    return true;
  }

  const cancelMatch = url.pathname.match(/^\/api\/scans\/([^/]+)\/cancel$/);
  if (request.method === 'POST' && cancelMatch) {
    sendJson(response, context.scans.cancel(cancelMatch[1]) ? 200 : 404, { cancelled: true });
    return true;
  }

  if (request.method === 'GET' && url.pathname === '/api/snapshots/current') {
    if (context.scans.currentSnapshot) sendJson(response, 200, context.scans.currentSnapshot);
    else sendJson(response, 404, { error: { code: 'no_snapshot', message: 'Run a scan first.' } });
    return true;
  }

  return false;
}

function readProjectDir(value: unknown, fallback: string): string {
  const projectDir = resolve(typeof value === 'string' && value.trim() ? value.trim() : fallback);
  if (!existsSync(projectDir)) throw new Error(`项目目录不存在：${projectDir}`);
  if (!statSync(projectDir).isDirectory()) throw new Error(`项目路径不是目录：${projectDir}`);
  return projectDir;
}

function readScope(value: unknown): Scope | 'all' {
  return value === 'project' || value === 'global' ? value : 'all';
}

function readPlatform(value: unknown): Platform | null {
  if (value === null || value === undefined || value === 'all') return null;
  if (typeof value !== 'string') return null;
  return normalizePlatformName(value);
}

function positiveInt(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isInteger(value) && value > 0 ? value : undefined;
}

