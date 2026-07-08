import { homedir } from 'node:os';
import { join } from 'node:path';

import {
  getDefaultInstallTarget,
  getPlatformAdapter,
  resolvePlatformPathTemplate,
} from '../platforms/registry.js';
import type { Platform } from '../types/skill.js';

export interface ResolvedInstallTarget {
  platform: Platform;
  globalDir: string;
  layout: 'skill-dirs' | 'files';
}

export interface ResolveInstallTargetOptions {
  homeDir?: string;
  appDataDir?: string;
}

export class InstallTargetError extends Error {
  constructor(
    readonly code: 'unknown-platform' | 'unsupported-layout',
    message: string,
  ) {
    super(message);
    this.name = 'InstallTargetError';
  }
}

export function resolveInstallTarget(
  target: string,
  options: ResolveInstallTargetOptions = {},
): ResolvedInstallTarget {
  const adapter = getPlatformAdapter(target);
  if (!adapter || adapter.platform === 'unknown') {
    throw new InstallTargetError('unknown-platform', `Unknown platform '${target}'`);
  }

  const globalTarget = getDefaultInstallTarget(adapter);
  if (!globalTarget?.layout) {
    throw new InstallTargetError(
      'unsupported-layout',
      `Platform '${target}' uses a single-file layout and does not support individual skill installs.`,
    );
  }

  const homeDir = options.homeDir ?? homedir();
  const appDataDir = options.appDataDir ?? (process.env['APPDATA'] ?? join(homeDir, 'AppData', 'Roaming'));

  return {
    platform: adapter.platform,
    globalDir: resolvePlatformPathTemplate(globalTarget.path, homeDir, appDataDir),
    layout: globalTarget.layout,
  };
}

export function resolveInstallPath(
  globalDir: string,
  layout: 'skill-dirs' | 'files',
  skillName: string,
): string {
  if (layout === 'skill-dirs') {
    return join(globalDir, skillName, 'SKILL.md');
  }
  return join(globalDir, `${skillName}.md`);
}
