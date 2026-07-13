import { createReadStream, existsSync, realpathSync, statSync } from 'node:fs';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { dirname, extname, relative, resolve, sep } from 'node:path';

import packageJson from '../../package.json';
import { executeDuplicateCleanup, exportSnapshotDashboard, getManagedRegistry, getResourceDetail, installManagedSkill, compareResources, uninstallManagedSkill, commitManagedAgentSkillImport, previewManagedAgentSkillImport, commitManagedSkillDeployment, getManagedSkillDeploymentTargets, getManagedSkillLibrary, previewManagedSkillDeployment, syncManagedSkillDeployment, uninstallManagedSkillDeployment } from '../application/actions';
import type { HealthCheckOptions } from '../application/types';
import { loadUserConfig, saveUserConfig } from '../config/loadUserConfig';
import { loadEffectiveScanSources, validateScanSourcesConfig, withScanSources } from '../config/scanSources';
import { detectAgents } from '../discovery/detectAgents';
import { toggleCodexResource } from '../context/codexControls';
import { getPlatformCliValues, normalizePlatformName } from '../platforms/registry';
import type { AgentImportDecision } from '../library/importAgentSkills';
import type { Platform, Scope } from '../types/skill';
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

const BODY_LIMIT = 1024 * 1024;

export async function startUiServer(options: StartUiServerOptions): Promise<UiServerHandle> {
  const host = options.host ?? '127.0.0.1';
  if (host !== '127.0.0.1' && host !== 'localhost') throw new Error('Skill Doctor UI only binds to loopback addresses.');
  const projectDir = resolve(options.projectDir);
  const executablePath = process.argv[1] && existsSync(process.argv[1]) ? realpathSync(process.argv[1]) : process.argv[1] ?? '';
  const bundledUiDir = resolve(dirname(executablePath), 'ui');
  const uiDir = options.uiDir ?? (existsSync(bundledUiDir) ? bundledUiDir : resolve(process.cwd(), 'dist/ui'));
  const security = createUiSessionSecurity();
  const scans = new ScanManager();
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
        await handleApi(request, response, url, { projectDir, homeDir: options.homeDir, scans, port });
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

interface ApiContext {
  projectDir: string;
  homeDir?: string;
  scans: ScanManager;
  port: number;
}

async function handleApi(request: IncomingMessage, response: ServerResponse, url: URL, context: ApiContext): Promise<void> {
  if (request.method === 'GET' && url.pathname === '/api/bootstrap') {
    const loaded = loadUserConfig(context.homeDir);
    const scanSources = loadEffectiveScanSources(context.projectDir, { homeDir: context.homeDir });
    const registry = getManagedRegistry(context.homeDir);
    return sendJson(response, 200, {
      version: packageJson.version,
      projectDir: context.projectDir,
      configPath: loaded.path,
      defaultScope: 'all',
      supportedPlatforms: getPlatformCliValues(),
      detectedAgents: detectAgents(context.projectDir, { homeDir: context.homeDir, sources: scanSources }),
      capabilities: context.scans.currentSnapshot?.capabilities ?? {
        aiAuditConfigured: Boolean(loaded.config.analysis?.baseUrl && loaded.config.analysis.model),
        embeddingConfigured: Boolean(loaded.config.embedding?.baseUrl && loaded.config.embedding.model),
        canToggleCodexResources: true,
        canExecuteCleanup: false,
        canInstall: true,
        canUninstall: registry.entries.length > 0,
        canExportDashboard: true,
      },
      registry: registry.entries,
      snapshot: context.scans.currentSnapshot,
    });
  }

  if (request.method === 'GET' && url.pathname === '/api/scan-sources') {
    return sendJson(response, 200, {
      projectDir: context.projectDir,
      configPath: loadUserConfig(context.homeDir).path,
      sources: loadEffectiveScanSources(context.projectDir, { homeDir: context.homeDir }),
    });
  }

  if (request.method === 'POST' && url.pathname === '/api/scan-sources/validate') {
    const body = await readJsonBody(request);
    const scanSources = validateScanSourcesConfig(body.scanSources);
    return sendJson(response, 200, { valid: true, scanSources });
  }

  if (request.method === 'PUT' && url.pathname === '/api/scan-sources') {
    const body = await readJsonBody(request);
    const scanSources = validateScanSourcesConfig(body.scanSources);
    const loaded = loadUserConfig(context.homeDir);
    saveUserConfig(withScanSources(loaded.config, scanSources), context.homeDir);
    return sendJson(response, 200, {
      saved: true,
      sources: loadEffectiveScanSources(context.projectDir, { homeDir: context.homeDir }),
    });
  }

  if (request.method === 'POST' && url.pathname === '/api/scan-sources/reset') {
    const body = await readJsonBody(request);
    const platform = normalizePlatformName(requiredString(body.platform, 'platform'));
    if (!platform || platform === 'unknown') throw new Error('Invalid platform.');
    const loaded = loadUserConfig(context.homeDir);
    const scanSources = { ...(loaded.config.scanSources ?? {}) };
    delete scanSources[platform];
    saveUserConfig(withScanSources(loaded.config, scanSources), context.homeDir);
    return sendJson(response, 200, {
      reset: true,
      sources: loadEffectiveScanSources(context.projectDir, { homeDir: context.homeDir }),
    });
  }

  if (request.method === 'POST' && url.pathname === '/api/scans') {
    const body = await readJsonBody(request);
    const projectDir = readProjectDir(body.projectDir, context.projectDir);
    const scope = readScope(body.scope);
    const platform = readPlatform(body.platform);
    const scanOptions: HealthCheckOptions = {
      projectDir,
      scope,
      platform,
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
    return sendJson(response, 202, { scanId: context.scans.start(scanOptions) });
  }

  if (request.method === 'POST' && url.pathname === '/api/agents/detect') {
    const body = await readJsonBody(request);
    const projectDir = readProjectDir(body.projectDir, context.projectDir);
    const sources = loadEffectiveScanSources(projectDir, { homeDir: context.homeDir });
    return sendJson(response, 200, { projectDir, agents: detectAgents(projectDir, { homeDir: context.homeDir, sources }) });
  }

  if (request.method === 'POST' && url.pathname === '/api/library/import/preview') {
    return sendJson(response, 200, previewManagedAgentSkillImport(context.projectDir, context.homeDir));
  }

  if (request.method === 'POST' && url.pathname === '/api/library/import/commit') {
    const body = await readJsonBody(request);
    const decisions = readImportDecisions(body.decisions);
    return sendJson(response, 200, commitManagedAgentSkillImport(
      context.projectDir,
      requiredString(body.planId, 'planId'),
      decisions,
      context.homeDir,
    ));
  }

  if (request.method === 'GET' && url.pathname === '/api/library/skills') {
    return sendJson(response, 200, getManagedSkillLibrary(context.projectDir, context.homeDir));
  }

  if (request.method === 'GET' && url.pathname === '/api/deployments/targets') {
    return sendJson(response, 200, { targets: getManagedSkillDeploymentTargets(context.projectDir, context.homeDir) });
  }

  if (request.method === 'POST' && url.pathname === '/api/deployments/preview') {
    const body = await readJsonBody(request);
    return sendJson(response, 200, previewManagedSkillDeployment(
      context.projectDir,
      requiredString(body.skillId, 'skillId'),
      readTargetIds(body.targetIds),
      readDeploymentMode(body.mode),
      context.homeDir,
    ));
  }

  if (request.method === 'POST' && url.pathname === '/api/deployments/commit') {
    const body = await readJsonBody(request);
    return sendJson(response, 200, commitManagedSkillDeployment(
      context.projectDir,
      requiredString(body.skillId, 'skillId'),
      readTargetIds(body.targetIds),
      readDeploymentMode(body.mode),
      requiredString(body.planId, 'planId'),
      body.force === true,
      context.homeDir,
    ));
  }

  const deploymentSyncMatch = url.pathname.match(/^\/api\/deployments\/([^/]+)\/sync$/);
  if (request.method === 'POST' && deploymentSyncMatch) {
    const body = await readJsonBody(request);
    return sendJson(response, 200, syncManagedSkillDeployment(context.projectDir, decodeURIComponent(deploymentSyncMatch[1]), body.force === true, context.homeDir));
  }

  const deploymentMatch = url.pathname.match(/^\/api\/deployments\/([^/]+)$/);
  if (request.method === 'DELETE' && deploymentMatch) {
    const body = await readJsonBody(request);
    return sendJson(response, 200, uninstallManagedSkillDeployment(
      context.projectDir,
      decodeURIComponent(deploymentMatch[1]),
      body.unregisterOnly === true,
      body.force === true,
      context.homeDir,
    ));
  }

  const eventMatch = url.pathname.match(/^\/api\/scans\/([^/]+)\/events$/);
  if (request.method === 'GET' && eventMatch) {
    response.statusCode = 200;
    response.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    response.setHeader('Connection', 'keep-alive');
    if (!context.scans.subscribe(eventMatch[1], response)) return sendJson(response, 404, { error: { code: 'scan_not_found', message: 'Scan not found.' } });
    return;
  }

  const cancelMatch = url.pathname.match(/^\/api\/scans\/([^/]+)\/cancel$/);
  if (request.method === 'POST' && cancelMatch) {
    return sendJson(response, context.scans.cancel(cancelMatch[1]) ? 200 : 404, { cancelled: true });
  }

  if (request.method === 'GET' && url.pathname === '/api/snapshots/current') {
    return context.scans.currentSnapshot
      ? sendJson(response, 200, context.scans.currentSnapshot)
      : sendJson(response, 404, { error: { code: 'no_snapshot', message: 'Run a scan first.' } });
  }

  const resourceMatch = url.pathname.match(/^\/api\/resources\/(.+)$/);
  if (request.method === 'GET' && resourceMatch) {
    const snapshot = requireSnapshot(context);
    return sendJson(response, 200, await getResourceDetail(snapshot, decodeURIComponent(resourceMatch[1]), context.homeDir));
  }

  if (request.method === 'POST' && url.pathname === '/api/compare') {
    const snapshot = requireSnapshot(context);
    const body = await readJsonBody(request);
    return sendJson(response, 200, await compareResources(snapshot, requiredString(body.leftId, 'leftId'), requiredString(body.rightId, 'rightId'), snapshot.target.projectDir, context.homeDir));
  }

  if (request.method === 'POST' && url.pathname === '/api/context/toggle') {
    const body = await readJsonBody(request);
    const result = await toggleCodexResource(context.scans.currentSnapshot?.target.projectDir ?? context.projectDir, requiredString(body.id, 'id'), body.enabled === true, { homeDir: context.homeDir });
    return sendJson(response, 200, result);
  }

  if (request.method === 'POST' && url.pathname === '/api/cleanup') {
    const snapshot = requireSnapshot(context);
    const body = await readJsonBody(request);
    const result = executeDuplicateCleanup(snapshot, requiredString(body.issueId, 'issueId'), requiredString(body.removePath, 'removePath'), requiredString(body.confirmation, 'confirmation'));
    return sendJson(response, 200, result);
  }

  if (request.method === 'POST' && url.pathname === '/api/install') {
    const body = await readJsonBody(request);
    const result = await installManagedSkill({
      source: requiredString(body.source, 'source'),
      sourceType: body.sourceType === 'marketplace' ? 'marketplace' : 'local',
      target: requiredString(body.target, 'target'),
      link: body.link === true,
      homeDir: context.homeDir,
    });
    return sendJson(response, 200, result);
  }

  if (request.method === 'POST' && url.pathname === '/api/uninstall') {
    const body = await readJsonBody(request);
    const platform = normalizePlatformName(requiredString(body.platform, 'platform'));
    if (!platform) throw new Error('Invalid platform.');
    await uninstallManagedSkill(requiredString(body.name, 'name'), platform, body.force === true, context.homeDir);
    return sendJson(response, 200, { removed: true });
  }

  if (request.method === 'GET' && url.pathname === '/api/export/dashboard') {
    const snapshot = requireSnapshot(context);
    const html = exportSnapshotDashboard(snapshot);
    response.statusCode = 200;
    response.setHeader('Content-Type', 'text/html; charset=utf-8');
    response.setHeader('Content-Disposition', 'attachment; filename="skill-doctor-dashboard.html"');
    response.end(html);
    return;
  }

  sendJson(response, 404, { error: { code: 'not_found', message: 'API route not found.' } });
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

async function readJsonBody(request: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.length;
    if (size > BODY_LIMIT) throw new Error('Request body is too large.');
    chunks.push(buffer);
  }
  if (chunks.length === 0) return {};
  const parsed = JSON.parse(Buffer.concat(chunks).toString('utf8'));
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('JSON body must be an object.');
  return parsed as Record<string, unknown>;
}

function sendJson(response: ServerResponse, status: number, value: unknown): void {
  if (response.headersSent) {
    response.end();
    return;
  }
  response.statusCode = status;
  response.setHeader('Content-Type', 'application/json; charset=utf-8');
  response.end(JSON.stringify(value));
}

function requireSnapshot(context: ApiContext) {
  if (!context.scans.currentSnapshot) throw new Error('Run a scan first.');
  return context.scans.currentSnapshot;
}

function requiredString(value: unknown, name: string): string {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${name} is required.`);
  return value;
}

function readImportDecisions(value: unknown): AgentImportDecision[] {
  if (!Array.isArray(value)) throw new Error('decisions must be an array.');
  return value.map((entry) => {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) throw new Error('Each import decision must be an object.');
    const decision = entry as Record<string, unknown>;
    const action = decision.action;
    if (action !== 'keep-copy' && action !== 'replace-with-link' && action !== 'keep-separate' && action !== 'use-managed-link' && action !== 'register' && action !== 'skip') {
      throw new Error('Invalid import decision action.');
    }
    return {
      candidateId: requiredString(decision.candidateId, 'candidateId'),
      action,
      ...(typeof decision.name === 'string' ? { name: decision.name } : {}),
    };
  });
}

function readTargetIds(value: unknown): string[] {
  if (!Array.isArray(value) || value.length === 0 || value.some((entry) => typeof entry !== 'string' || !entry)) {
    throw new Error('targetIds must be a non-empty array of target IDs.');
  }
  return value;
}

function readDeploymentMode(value: unknown): 'symlink' | 'copy' {
  if (value !== 'symlink' && value !== 'copy') throw new Error('mode must be symlink or copy.');
  return value;
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
