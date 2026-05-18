import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { dirname } from 'node:path';

import type { Platform } from '../types/skill.js';
import { findRegistryEntry, removeRegistryEntry } from './registry.js';

export interface UninstallSkillOptions {
  name: string;
  platform: Platform;
  registryPath: string;
  force: boolean;
}

function computeHash(filePath: string): string {
  const content = readFileSync(filePath);
  return `sha256:${createHash('sha256').update(content).digest('hex')}`;
}

export async function uninstallSkill(options: UninstallSkillOptions): Promise<void> {
  const { name, platform, registryPath, force } = options;
  const entry = findRegistryEntry(registryPath, name, platform);

  if (!entry) {
    throw new Error(`Skill '${name}' is not in the registry for platform '${platform}'`);
  }

  if (!existsSync(entry.installedPath)) {
    removeRegistryEntry(registryPath, name, platform);
    return;
  }

  const currentHash = computeHash(entry.installedPath);
  if (currentHash !== entry.contentHash && !force) {
    throw new Error(
      `Skill '${name}' was externally modified after install. Use --force to delete anyway.`,
    );
  }

  rmSync(entry.installedPath);

  const parentDir = dirname(entry.installedPath);
  try {
    const remaining = readdirSync(parentDir);
    if (remaining.length === 0) {
      rmSync(parentDir, { recursive: true });
    }
  } catch {
    // Parent removal is best-effort
  }

  removeRegistryEntry(registryPath, name, platform);
}
