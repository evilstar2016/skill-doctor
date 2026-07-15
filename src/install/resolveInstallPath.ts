import { homedir } from 'node:os';
import { isAbsolute, join, resolve } from 'node:path';

import {
  getPlatformAdapter,
  resolvePlatformPathTemplate,
} from '../platforms/registry.js';
import type { Platform, Scope } from '../types/skill.js';

export interface ResolvedInstallTarget {
  platform: Platform;
  scope: Scope;
  globalDir: string;
  layout: 'skill-dirs' | 'files';
}

export interface ResolveInstallTargetOptions {
  homeDir?: string;
  appDataDir?: string;
  projectDir?: string;
  scope?: Scope;
}

export class InstallTargetError extends Error {
  constructor(
    readonly code: 'unknown-platform' | 'unsupported-layout' | 'unsupported-scope' | 'missing-project-dir',
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

  const scope = options.scope ?? 'global';
  const installTarget = adapter.installTargets.find((entry) => entry.scope === scope);
  if (!installTarget) {
    throw new InstallTargetError(
      'unsupported-scope',
      `Platform '${target}' does not support ${scope} skill installs.`,
    );
  }
  if (!installTarget.layout) throw new InstallTargetError('unsupported-layout', `Platform '${target}' does not support individual skill installs.`);
  if (scope === 'project' && !options.projectDir) {
    throw new InstallTargetError('missing-project-dir', 'projectDir is required for project skill installs.');
  }

  const homeDir = options.homeDir ?? homedir();
  const appDataDir = options.appDataDir ?? (process.env['APPDATA'] ?? join(homeDir, 'AppData', 'Roaming'));
  const expandedPath = resolvePlatformPathTemplate(installTarget.path, homeDir, appDataDir);
  const baseDir = scope === 'project' ? options.projectDir! : homeDir;

  return {
    platform: adapter.platform,
    scope,
    globalDir: isAbsolute(expandedPath) ? expandedPath : resolve(baseDir, expandedPath),
    layout: installTarget.layout,
  };
}

export function listInstallTargetScopes(
  target: string,
  options: Omit<ResolveInstallTargetOptions, 'scope'> = {},
): ResolvedInstallTarget[] {
  return (['global', 'project'] as Scope[]).flatMap((scope) => {
    try {
      return [resolveInstallTarget(target, { ...options, scope })];
    } catch (error) {
      if (error instanceof InstallTargetError && (error.code === 'unsupported-scope' || error.code === 'missing-project-dir')) return [];
      throw error;
    }
  });
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
