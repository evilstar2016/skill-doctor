import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

import { getPlatformAdapters, resolvePlatformPathTemplate } from '../platforms/registry';
import type { Platform } from '../types/skill';
import type { EffectiveScanSource } from '../config/scanSources';

export interface DetectedAgent {
  platform: Platform;
  displayName: string;
  projectDetected: boolean;
  globalDetected: boolean;
  recommended: boolean;
}

export function detectAgents(
  projectDir: string,
  options: { homeDir?: string; appDataDir?: string; sources?: EffectiveScanSource[] } = {},
): DetectedAgent[] {
  const homeDir = options.homeDir ?? homedir();
  const appDataDir = options.appDataDir ?? (process.env['APPDATA'] ?? join(homeDir, 'AppData', 'Roaming'));

  return getPlatformAdapters().flatMap((adapter) => {
    if (options.sources) {
      const enabled = options.sources.filter((entry) => entry.platform === adapter.platform && entry.enabled);
      const projectDetected = enabled.some((entry) => entry.scope === 'project' && entry.status === 'exists');
      const globalDetected = enabled.some((entry) => entry.scope === 'global' && entry.status === 'exists');
      if (!projectDetected && !globalDetected) return [];
      return [{
        platform: adapter.platform,
        displayName: adapter.displayName,
        projectDetected,
        globalDetected,
        recommended: projectDetected,
      }];
    }
    const projectPaths = [
      ...adapter.project.map((target) => join(projectDir, target.path)),
      ...adapter.mcpConfigFiles.filter((source) => source.scope === 'project').map((source) => join(projectDir, source.path)),
    ];
    const globalPaths = [
      ...adapter.global.map((target) => resolvePlatformPathTemplate(target.path, homeDir, appDataDir)),
      ...adapter.mcpConfigFiles
        .filter((source) => source.scope === 'global')
        .map((source) => resolvePlatformPathTemplate(source.path, homeDir, appDataDir)),
    ];
    const projectDetected = projectPaths.some(existsSync);
    const globalDetected = globalPaths.some(existsSync);
    if (!projectDetected && !globalDetected) return [];
    return [{
      platform: adapter.platform,
      displayName: adapter.displayName,
      projectDetected,
      globalDetected,
      recommended: projectDetected,
    }];
  });
}
