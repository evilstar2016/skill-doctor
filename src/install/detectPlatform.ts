import { existsSync } from 'node:fs';
import { normalize } from 'node:path';
import { homedir as osHomedir } from 'node:os';

import { PLATFORM_PATHS } from '../discovery/resolvePaths.js';

export interface DetectedPlatform {
  platform: string;
  globalDir: string;
  layout: 'skill-dirs' | 'files';
}

interface DetectOptions {
  homeDir?: string;
  appDataDir?: string;
}

function resolveTemplate(template: string, homeDir: string, appDataDir: string): string {
  return normalize(
    template
      .replace(/^~(?=[/\\]|$)/, homeDir)
      .replace(/%USERPROFILE%/gi, homeDir)
      .replace(/%APPDATA%/gi, appDataDir),
  );
}

export function detectPlatform(options: DetectOptions = {}): DetectedPlatform | undefined {
  const homeDir = options.homeDir ?? osHomedir();
  const appDataDir = options.appDataDir ?? (process.env['APPDATA'] ?? homeDir);

  const sorted = [
    ...PLATFORM_PATHS.filter((p) => p.confidence === 'high'),
    ...PLATFORM_PATHS.filter((p) => p.confidence === 'low'),
  ];

  for (const def of sorted) {
    for (const target of def.global) {
      if (target.mode !== 'recursive-dir' || !target.layout) continue;
      const resolvedDir = resolveTemplate(target.path, homeDir, appDataDir);
      if (existsSync(resolvedDir)) {
        return { platform: def.platform, globalDir: resolvedDir, layout: target.layout };
      }
    }
  }

  return undefined;
}
