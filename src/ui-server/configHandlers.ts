import type { IncomingMessage, ServerResponse } from 'node:http';

import packageJson from '../../package.json';
import { saveUserConfig } from '../config/loadUserConfig';
import { validateScanSourcesConfig, withScanSources } from '../config/scanSources';
import { detectAgents } from '../discovery/detectAgents';
import { getPlatformCliValues, normalizePlatformName } from '../platforms/registry';
import { readJsonBody, requiredString, sendJson } from './apiPrimitives';
import type { ApiRequestContext } from './apiContext';

export async function handleConfigRoute(
  request: IncomingMessage,
  response: ServerResponse,
  url: URL,
  context: ApiRequestContext,
): Promise<boolean> {
  if (request.method === 'GET' && url.pathname === '/api/bootstrap') {
    const loaded = context.getLoadedConfig();
    const scanSources = context.getScanSources();
    const registry = context.getRegistry();
    sendJson(response, 200, {
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
    return true;
  }

  if (request.method === 'GET' && url.pathname === '/api/scan-sources') {
    sendJson(response, 200, {
      projectDir: context.projectDir,
      configPath: context.getLoadedConfig().path,
      sources: context.getScanSources(),
    });
    return true;
  }

  if (request.method === 'POST' && url.pathname === '/api/scan-sources/validate') {
    const body = await readJsonBody(request);
    const scanSources = validateScanSourcesConfig(body.scanSources);
    sendJson(response, 200, { valid: true, scanSources });
    return true;
  }

  if (request.method === 'PUT' && url.pathname === '/api/scan-sources') {
    const body = await readJsonBody(request);
    const scanSources = validateScanSourcesConfig(body.scanSources);
    saveUserConfig(withScanSources(context.getLoadedConfig().config, scanSources), context.homeDir);
    context.invalidateConfig();
    sendJson(response, 200, { saved: true, sources: context.getScanSources() });
    return true;
  }

  if (request.method === 'POST' && url.pathname === '/api/scan-sources/reset') {
    const body = await readJsonBody(request);
    const platform = normalizePlatformName(requiredString(body.platform, 'platform'));
    if (!platform || platform === 'unknown') throw new Error('Invalid platform.');
    const scanSources = { ...(context.getLoadedConfig().config.scanSources ?? {}) };
    delete scanSources[platform];
    saveUserConfig(withScanSources(context.getLoadedConfig().config, scanSources), context.homeDir);
    context.invalidateConfig();
    sendJson(response, 200, { reset: true, sources: context.getScanSources() });
    return true;
  }

  return false;
}

