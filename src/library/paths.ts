import * as fs from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve, sep } from 'node:path';

import { getCenterSettingsPath, getCenterStatePath, loadCenterLibrarySettings } from './centerSettings.js';

export interface ManagedSkillPaths {
  baseDir: string;
  settingsPath: string;
  skillsDir: string;
  centerPath: string;
  catalogPath: string;
  deploymentsPath: string;
  registryPath: string;
  stagingDir: string;
  backupsDir: string;
}

export function getManagedSkillPaths(homeDir = homedir()): ManagedSkillPaths {
  const skillsDir = loadCenterLibrarySettings(homeDir).rootPath;
  const baseDir = getCenterStatePath(homeDir);
  migrateLegacyLibraryState(skillsDir, baseDir);
  return {
    baseDir,
    settingsPath: getCenterSettingsPath(homeDir),
    skillsDir,
    centerPath: resolve(baseDir, 'center.json'),
    catalogPath: resolve(baseDir, 'catalog.json'),
    deploymentsPath: resolve(baseDir, 'deployments.json'),
    registryPath: resolve(baseDir, 'registry.json'),
    stagingDir: resolve(baseDir, 'staging'),
    backupsDir: resolve(baseDir, 'backups'),
  };
}

function migrateLegacyLibraryState(skillsDir: string, stateDir: string): void {
  const legacyCenterPath = join(skillsDir, 'center.json');
  const stateCenterPath = join(stateDir, 'center.json');
  if (!fs.existsSync(legacyCenterPath) || fs.existsSync(stateCenterPath)) return;

  let center: { version?: unknown; skills?: Array<{ rootPath?: unknown }> };
  try {
    center = JSON.parse(fs.readFileSync(legacyCenterPath, 'utf8')) as typeof center;
    if (center.version !== 1 || !Array.isArray(center.skills)) return;
  } catch {
    return;
  }

  const legacySkillsDir = join(skillsDir, 'skills');
  if (fs.existsSync(legacySkillsDir)) {
    for (const entry of fs.readdirSync(legacySkillsDir, { withFileTypes: true })) {
      const from = join(legacySkillsDir, entry.name);
      const to = join(skillsDir, entry.name);
      if ((entry.isDirectory() || entry.isSymbolicLink()) && !fs.existsSync(to)) fs.renameSync(from, to);
    }
    if (fs.readdirSync(legacySkillsDir).length === 0) fs.rmdirSync(legacySkillsDir);
  }

  for (const name of ['center.json', 'catalog.json', 'deployments.json', 'registry.json', 'staging', 'backups']) {
    const from = join(skillsDir, name);
    const to = join(stateDir, name);
    if (!fs.existsSync(from) || fs.existsSync(to)) continue;
    fs.mkdirSync(stateDir, { recursive: true });
    fs.renameSync(from, to);
  }

  const legacyPrefix = `${legacySkillsDir}${sep}`;
  for (const skill of center.skills) {
    if (typeof skill.rootPath === 'string' && skill.rootPath.startsWith(legacyPrefix)) {
      skill.rootPath = join(skillsDir, skill.rootPath.slice(legacyPrefix.length));
    }
  }
  fs.writeFileSync(stateCenterPath, `${JSON.stringify(center, null, 2)}\n`, 'utf8');
}
