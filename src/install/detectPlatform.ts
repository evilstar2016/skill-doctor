import { existsSync } from 'node:fs';
import { homedir as osHomedir } from 'node:os';

import { getPlatformAdapters, resolvePlatformPathTemplate } from '../platforms/registry.js';
import type { Platform } from '../types/skill.js';

export interface DetectedPlatform {
  platform: Platform;
  globalDir: string;
  layout: 'skill-dirs' | 'files';
}

interface DetectOptions {
  homeDir?: string;
  appDataDir?: string;
}

export function detectPlatform(options: DetectOptions = {}): DetectedPlatform | undefined {
  const homeDir = options.homeDir ?? osHomedir();
  const appDataDir = options.appDataDir ?? (process.env['APPDATA'] ?? homeDir);

  const sorted = [
    ...getPlatformAdapters().filter((p) => p.confidence === 'high'),
    ...getPlatformAdapters().filter((p) => p.confidence === 'low'),
  ];

  for (const def of sorted) {
    const globalTargets = def.installTargets.filter((entry) => entry.scope === 'global');
    for (const target of globalTargets) {
      const resolvedDir = resolvePlatformPathTemplate(target.path, homeDir, appDataDir);
      if (existsSync(resolvedDir)) {
        return { platform: def.platform, globalDir: resolvedDir, layout: target.layout };
      }
    }
    const detectedByMarker = (def.detectionPaths?.global ?? [])
      .some((path) => existsSync(resolvePlatformPathTemplate(path, homeDir, appDataDir)));
    const defaultTarget = globalTargets[0];
    if (detectedByMarker && defaultTarget) {
      return {
        platform: def.platform,
        globalDir: resolvePlatformPathTemplate(defaultTarget.path, homeDir, appDataDir),
        layout: defaultTarget.layout,
      };
    }
  }

  return undefined;
}
