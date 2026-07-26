import * as fs from 'node:fs';
import { homedir } from 'node:os';
import { dirname, isAbsolute, join, resolve } from 'node:path';

export interface CenterLibrarySettings {
  version: 1;
  rootPath: string;
}

export function getDefaultCenterLibraryPath(homeDir = homedir()): string {
  return resolve(homeDir, '.skill-doctor', 'skills');
}

export function getCenterSettingsPath(homeDir = homedir()): string {
  return resolve(homeDir, '.skill-doctor', 'center-settings.json');
}

export function getCenterStatePath(homeDir = homedir()): string {
  return resolve(homeDir, '.skill-doctor', 'center');
}

export function loadCenterLibrarySettings(homeDir = homedir()): CenterLibrarySettings {
  const rootPath = getDefaultCenterLibraryPath(homeDir);
  const settingsPath = getCenterSettingsPath(homeDir);
  if (!fs.existsSync(settingsPath)) return { version: 1, rootPath };
  try {
    const value = JSON.parse(fs.readFileSync(settingsPath, 'utf8')) as Partial<CenterLibrarySettings>;
    if (value.version !== 1 || typeof value.rootPath !== 'string' || !isAbsolute(value.rootPath)) return { version: 1, rootPath };
    return { version: 1, rootPath: resolve(value.rootPath) };
  } catch {
    return { version: 1, rootPath };
  }
}

export function saveCenterLibrarySettings(rootPath: string, homeDir = homedir()): CenterLibrarySettings {
  if (!isAbsolute(rootPath)) throw new Error('Center library path must be absolute.');
  const settings: CenterLibrarySettings = { version: 1, rootPath: resolve(rootPath) };
  const settingsPath = getCenterSettingsPath(homeDir);
  fs.mkdirSync(dirname(settingsPath), { recursive: true });
  fs.writeFileSync(settingsPath, `${JSON.stringify(settings, null, 2)}\n`, 'utf8');
  return settings;
}
