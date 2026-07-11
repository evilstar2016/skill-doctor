import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

import { getPlatformAdapters, resolvePlatformPathTemplate } from '../platforms/registry';
import type { Platform } from '../types/skill';

export interface DetectedAgent {
  platform: Platform;
  displayName: string;
  projectDetected: boolean;
  globalDetected: boolean;
  recommended: boolean;
}

export function detectAgents(
  projectDir: string,
  options: { homeDir?: string; appDataDir?: string } = {},
): DetectedAgent[] {
  const homeDir = options.homeDir ?? homedir();
  const appDataDir = options.appDataDir ?? (process.env['APPDATA'] ?? join(homeDir, 'AppData', 'Roaming'));

  return getPlatformAdapters().flatMap((adapter) => {
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
