import * as fs from 'node:fs';
import { homedir } from 'node:os';
import { basename, isAbsolute, join, relative, resolve } from 'node:path';

import { loadCenterLibrarySettings, saveCenterLibrarySettings } from './centerSettings.js';
import { loadCenter, saveCenter, type CenterInstallation } from './centerStore.js';
import { createSkillLink } from './deployments.js';
import { isDirectChildOfLibrary } from './paths.js';

export interface CenterLibraryChangePreview {
  /** Managed skills that would disappear from the active library view after the switch. */
  affected: number;
  names: string[];
}

export interface CenterLibraryMigrationResult {
  moved: number;
  relinked: number;
  /** Skill names that could not be moved (target already occupied or move failed). */
  skipped: string[];
}

/** Skills registered under the current library root that the new root would no longer cover. */
export function previewCenterLibraryChange(rootPath: string, homeDir = homedir()): CenterLibraryChangePreview {
  assertAbsolutePath(rootPath);
  const target = resolve(rootPath);
  const current = loadCenterLibrarySettings(homeDir).rootPath;
  if (target === current) return { affected: 0, names: [] };
  const store = loadCenter(homeDir);
  const names = store.skills
    .filter((skill) => isDirectChildOfLibrary(skill.rootPath, current) && !isDirectChildOfLibrary(skill.rootPath, target))
    .map((skill) => skill.name);
  return { affected: names.length, names };
}

/**
 * Switch the central library root while carrying managed skills over:
 * move each affected skill directory into the new root, remap its ledger
 * record, re-create symlink installations so they point at the new
 * location, and persist the new library path.
 */
export function migrateCenterLibrary(rootPath: string, homeDir = homedir()): CenterLibraryMigrationResult {
  assertAbsolutePath(rootPath);
  const target = resolve(rootPath);
  const current = loadCenterLibrarySettings(homeDir).rootPath;
  if (target === current) return { moved: 0, relinked: 0, skipped: [] };
  // Refuse targets inside the current library: moved entries would be re-adopted
  // as duplicates by the library scan, and a skill could be moved into itself.
  const targetInsideCurrent = relative(current, target);
  if (targetInsideCurrent && !targetInsideCurrent.startsWith('..') && !isAbsolute(targetInsideCurrent)) {
    throw new Error('The new library path must not be inside the current library.');
  }

  const store = loadCenter(homeDir);
  const affected = store.skills.filter(
    (skill) => isDirectChildOfLibrary(skill.rootPath, current) && !isDirectChildOfLibrary(skill.rootPath, target),
  );
  fs.mkdirSync(target, { recursive: true });

  const result: CenterLibraryMigrationResult = { moved: 0, relinked: 0, skipped: [] };
  for (const skill of affected) {
    const destination = join(target, basename(skill.rootPath));
    try {
      moveDirectory(skill.rootPath, destination);
      result.relinked += relinkInstallations(skill.rootPath, destination, skill.installations);
      skill.rootPath = destination;
      skill.updatedAt = new Date().toISOString();
      result.moved += 1;
    } catch {
      result.skipped.push(skill.name);
    }
  }

  saveCenter(homeDir, store);
  saveCenterLibrarySettings(target, homeDir);
  return result;
}

function assertAbsolutePath(rootPath: string): void {
  if (!isAbsolute(rootPath)) throw new Error('Center library path must be absolute.');
}

function moveDirectory(source: string, destination: string): void {
  if (pathExists(destination)) throw new Error(`Destination already exists: ${destination}`);
  try {
    fs.renameSync(source, destination);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'EXDEV') throw error;
    fs.cpSync(source, destination, { recursive: true });
    fs.rmSync(source, { recursive: true, force: true });
  }
}

/** Re-create symlink-mode installations so they resolve to the moved skill directory. */
function relinkInstallations(oldRoot: string, newRoot: string, installations: CenterInstallation[]): number {
  let relinked = 0;
  for (const installation of installations) {
    if (installation.mode !== 'symlink') continue;
    let stats: fs.Stats;
    try {
      stats = fs.lstatSync(installation.installedPath);
    } catch {
      continue;
    }
    if (!stats.isSymbolicLink() || !linkPointsTo(installation.installedPath, oldRoot)) continue;
    // rmSync on a symlink removes the link itself, never the target.
    fs.rmSync(installation.installedPath, { force: true });
    createSkillLink(newRoot, installation.installedPath);
    relinked += 1;
  }
  return relinked;
}

function linkPointsTo(linkPath: string, target: string): boolean {
  // After the move the old target is gone, so realpath on the link fails;
  // fall back to comparing the raw link text against the old root.
  try {
    return fs.realpathSync(linkPath) === fs.realpathSync(target);
  } catch {
    try {
      return resolve(fs.readlinkSync(linkPath)) === resolve(target);
    } catch {
      return false;
    }
  }
}

function pathExists(path: string): boolean {
  try {
    fs.lstatSync(path);
    return true;
  } catch {
    return false;
  }
}
