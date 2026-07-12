import { homedir } from 'node:os';
import { resolve } from 'node:path';

export interface ManagedSkillPaths {
  baseDir: string;
  skillsDir: string;
  catalogPath: string;
  deploymentsPath: string;
  registryPath: string;
  stagingDir: string;
  backupsDir: string;
}

export function getManagedSkillPaths(homeDir = homedir()): ManagedSkillPaths {
  const baseDir = resolve(homeDir, '.skill-doctor');
  return {
    baseDir,
    skillsDir: resolve(baseDir, 'skills'),
    catalogPath: resolve(baseDir, 'catalog.json'),
    deploymentsPath: resolve(baseDir, 'deployments.json'),
    registryPath: resolve(baseDir, 'registry.json'),
    stagingDir: resolve(baseDir, 'staging'),
    backupsDir: resolve(baseDir, 'backups'),
  };
}
