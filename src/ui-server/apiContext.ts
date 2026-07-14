import { loadUserConfig } from '../config/loadUserConfig';
import { loadEffectiveScanSources } from '../config/scanSources';
import { getManagedRegistry } from '../application/deployments';
import { getWhenToUseCachePath } from '../application/runtimePaths';
import { ScanManager } from './scanManager';

export interface ApiServerContext {
  projectDir: string;
  homeDir?: string;
  scans: ScanManager;
}

export interface ApiRequestContext extends ApiServerContext {
  getLoadedConfig(): ReturnType<typeof loadUserConfig>;
  getScanSources(projectDir?: string): ReturnType<typeof loadEffectiveScanSources>;
  getRegistry(): ReturnType<typeof getManagedRegistry>;
  getWhenToUseCachePath(): string;
  invalidateConfig(): void;
}

export function createApiRequestContext(context: ApiServerContext): ApiRequestContext {
  let loadedConfig: ReturnType<typeof loadUserConfig> | undefined;
  const scanSources = new Map<string, ReturnType<typeof loadEffectiveScanSources>>();
  let registry: ReturnType<typeof getManagedRegistry> | undefined;
  let whenToUseCachePath: string | undefined;

  const getLoadedConfig = (): ReturnType<typeof loadUserConfig> => {
    loadedConfig ??= loadUserConfig(context.homeDir);
    return loadedConfig;
  };
  const getScanSources = (projectDir = context.projectDir): ReturnType<typeof loadEffectiveScanSources> => {
    const cached = scanSources.get(projectDir);
    if (cached) return cached;
    const sources = loadEffectiveScanSources(projectDir, { homeDir: context.homeDir });
    scanSources.set(projectDir, sources);
    return sources;
  };

  return {
    ...context,
    getLoadedConfig,
    getScanSources,
    getRegistry: () => registry ??= getManagedRegistry(context.homeDir),
    getWhenToUseCachePath: () => whenToUseCachePath ??= getWhenToUseCachePath(context.homeDir),
    invalidateConfig: () => {
      loadedConfig = undefined;
      scanSources.clear();
    },
  };
}

