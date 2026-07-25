import { homedir } from 'node:os';
import { resolve } from 'node:path';

import { getCenterSettingsPath, loadCenterLibrarySettings } from './centerSettings.js';

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
  const baseDir = loadCenterLibrarySettings(homeDir).rootPath;
  return {
    baseDir,
    settingsPath: getCenterSettingsPath(homeDir),
    skillsDir: resolve(baseDir, 'skills'),
    centerPath: resolve(baseDir, 'center.json'),
    catalogPath: resolve(baseDir, 'catalog.json'),
    deploymentsPath: resolve(baseDir, 'deployments.json'),
    registryPath: resolve(baseDir, 'registry.json'),
    stagingDir: resolve(baseDir, 'staging'),
    backupsDir: resolve(baseDir, 'backups'),
  };
}
