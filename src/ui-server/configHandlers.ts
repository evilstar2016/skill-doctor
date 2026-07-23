import type { IncomingMessage, ServerResponse } from 'node:http';

import packageJson from '../../package.json';
import { saveUserConfig } from '../config/loadUserConfig';
import { modelConfigView, validateModelConfig, withModelConfig } from '../config/modelConfig';
import { validateScanSourcesConfig, withScanSources } from '../config/scanSources';
import { detectAgents } from '../discovery/detectAgents';
import { testOpenAiCompatibleModel } from '../models/testOpenAiCompatible';
import { getPlatformCliValues, normalizePlatformName } from '../platforms/registry';
import { zhMessage } from '../i18n';
import { readJsonBody, requiredString, sendJson } from './apiPrimitives';
import type { ApiRequestContext } from './apiContext';
import { pickNativeDirectory } from './nativeDirectoryPicker';

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

  if (request.method === 'GET' && url.pathname === '/api/model-config') {
    sendJson(response, 200, modelConfigView(context.getLoadedConfig().config));
    return true;
  }

  if (request.method === 'PUT' && url.pathname === '/api/model-config') {
    const body = await readJsonBody(request);
    const modelConfig = validateModelConfig(body);
    saveUserConfig(withModelConfig(context.getLoadedConfig().config, modelConfig), context.homeDir);
    context.invalidateConfig();
    sendJson(response, 200, { saved: true, config: modelConfigView(context.getLoadedConfig().config) });
    return true;
  }

  if (request.method === 'POST' && url.pathname === '/api/model-config/test') {
    const body = await readJsonBody(request);
    const kind = requiredString(body.kind, 'kind');
    if (kind !== 'analysis' && kind !== 'embedding') throw new Error('kind must be analysis or embedding.');
    const config = context.getLoadedConfig().config[kind];
    if (!config) throw new Error(`${kind} model service is not configured.`);
    sendJson(response, 200, await testOpenAiCompatibleModel(kind, config));
    return true;
  }

  if (request.method === 'POST' && url.pathname === '/api/project-directory/pick') {
    const projectDir = await pickNativeDirectory(zhMessage('picker.projectDirectory'));
    sendJson(response, 200, projectDir ? { projectDir } : { cancelled: true });
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
