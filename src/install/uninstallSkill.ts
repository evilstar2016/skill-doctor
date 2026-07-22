import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync, realpathSync, rmSync } from 'node:fs';
import { dirname } from 'node:path';

import type { Platform, Scope } from '../types/skill.js';
import { hashSkillDirectory } from '../library/skillDirectory.js';
import { findRegistryInstall, removeRegistryInstall } from '../library/centerStore.js';

export interface UninstallSkillOptions {
  name: string;
  platform: Platform;
  homeDir: string;
  force: boolean;
  scope?: Scope;
}

function computeHash(filePath: string): string {
  const content = readFileSync(filePath);
  return `sha256:${createHash('sha256').update(content).digest('hex')}`;
}

export async function uninstallSkill(options: UninstallSkillOptions): Promise<void> {
  const { name, platform, homeDir, force } = options;
  const scope = options.scope ?? 'global';
  const entry = findRegistryInstall(homeDir, name, platform, scope);

  if (!entry) {
    throw new Error(`Skill '${name}' is not in the registry for platform '${platform}'`);
  }

  if (!existsSync(entry.installedPath)) {
    removeRegistryInstall(homeDir, name, platform, scope);
    return;
  }

  const currentHash = entry.installedRootPath
    ? hashSkillDirectory(realpathSync(entry.installedRootPath))
    : computeHash(entry.installedPath);
  if (currentHash !== entry.contentHash && !force) {
    throw new Error(
      `Skill '${name}' was externally modified after install. Use --force to delete anyway.`,
    );
  }

  const installedRootPath = entry.installedRootPath ?? entry.installedPath;
  rmSync(installedRootPath, { recursive: true, force: true });

  const parentDir = dirname(installedRootPath);
  try {
    const remaining = readdirSync(parentDir);
    if (remaining.length === 0) {
      rmSync(parentDir, { recursive: true });
    }
  } catch {
    // Parent removal is best-effort
  }

  removeRegistryInstall(homeDir, name, platform, scope);
}
