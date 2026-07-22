import { createHash, randomUUID } from 'node:crypto';
import * as fs from 'node:fs';
import { homedir } from 'node:os';
import { basename, dirname, join } from 'node:path';

import { loadRegistry } from '../install/registry.js';
import { getPlatformAdapters } from '../platforms/registry.js';
import type { InstallRegistry, RegistryEntry } from '../types/install.js';
import type { Platform, Scope } from '../types/skill.js';
import { loadManagedSkillCatalog, type ManagedSkill, type ManagedSkillSource } from './catalog.js';
import { getManagedSkillPaths } from './paths.js';
import { inspectSkillDirectory } from './skillDirectory.js';

export type DeploymentMode = 'symlink' | 'copy';

export interface CenterInstallation {
  id: string;
  targetId: string;
  platform: Platform;
  scope: Scope;
  projectDir?: string;
  mode: DeploymentMode;
  installedPath: string;
  installedRootPath?: string;
  deployedHash: string;
  installedAt: string;
}

export interface CenterSkill {
  id: string;
  name: string;
  rootPath: string;
  source: ManagedSkillSource;
  treeHash: string;
  addedAt: string;
  updatedAt: string;
  installations: CenterInstallation[];
}

export interface CenterStore {
  version: 1;
  skills: CenterSkill[];
}

export interface MigrateResult {
  skills: number;
  installations: number;
  backups: string[];
}

export class CenterStoreError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CenterStoreError';
  }
}

export function getCenterPath(homeDir = homedir()): string {
  return getManagedSkillPaths(homeDir).centerPath;
}

export function saveCenter(homeDir: string, store: CenterStore): void {
  if (!isCenterStore(store)) throw new CenterStoreError('Refusing to save an invalid center store.');
  const path = getCenterPath(homeDir);
  fs.mkdirSync(dirname(path), { recursive: true });
  const temporaryPath = join(dirname(path), `.${basename(path)}.${randomUUID()}.tmp`);
  try {
    fs.writeFileSync(temporaryPath, `${JSON.stringify(store, null, 2)}\n`, 'utf8');
    fs.renameSync(temporaryPath, path);
  } finally {
    fs.rmSync(temporaryPath, { force: true });
  }
}

export function loadCenter(homeDir = homedir()): CenterStore {
  const paths = getManagedSkillPaths(homeDir);
  if (!fs.existsSync(paths.centerPath)) {
    const hasLegacy =
      fs.existsSync(paths.catalogPath) || fs.existsSync(paths.deploymentsPath) || fs.existsSync(paths.registryPath);
    if (hasLegacy) {
      migrateToCenter(homeDir);
    } else {
      return { version: 1, skills: [] };
    }
  }
  return loadCenterStore(paths.centerPath);
}

export function migrateToCenter(homeDir: string): MigrateResult {
  const paths = getManagedSkillPaths(homeDir);
  if (fs.existsSync(paths.centerPath)) {
    const current = loadCenterStore(paths.centerPath);
    return { skills: current.skills.length, installations: current.skills.reduce((sum, s) => sum + s.installations.length, 0), backups: [] };
  }

  const skills: CenterSkill[] = loadManagedSkillCatalog(paths.catalogPath).skills.map((skill) => ({
    id: skill.id,
    name: skill.name,
    rootPath: skill.rootPath,
    source: skill.source,
    treeHash: skill.treeHash,
    addedAt: skill.addedAt,
    updatedAt: skill.updatedAt,
    installations: [],
  }));

  const byId = new Map(skills.map((skill) => [skill.id, skill]));
  for (const deployment of readDeploymentsRaw(paths.deploymentsPath)) {
    const skill = byId.get(deployment.skillId);
    if (!skill) continue;
    skill.installations.push({
      id: deployment.id,
      targetId: deployment.targetId,
      platform: deployment.platform,
      scope: deployment.scope,
      ...(deployment.projectDir ? { projectDir: deployment.projectDir } : {}),
      mode: deployment.mode,
      installedPath: deployment.installedPath,
      deployedHash: deployment.deployedHash,
      installedAt: deployment.installedAt,
    });
  }

  adoptLegacyRegistry(skills, paths.registryPath);

  const store: CenterStore = { version: 1, skills };
  saveCenter(homeDir, store);

  const backups: string[] = [];
  for (const legacyPath of [paths.catalogPath, paths.deploymentsPath, paths.registryPath]) {
    if (fs.existsSync(legacyPath)) {
      const backupPath = `${legacyPath}.pre-center.bak`;
      fs.renameSync(legacyPath, backupPath);
      backups.push(backupPath);
    }
  }

  return {
    skills: skills.length,
    installations: skills.reduce((sum, s) => sum + s.installations.length, 0),
    backups,
  };
}

// --- Convenience CRUD (self-persisting) -------------------------------------

export function upsertCenterSkill(homeDir: string, skill: CenterSkill): void {
  const store = loadCenter(homeDir);
  const index = store.skills.findIndex((entry) => entry.id === skill.id);
  if (index >= 0) store.skills[index] = skill;
  else store.skills.push(skill);
  saveCenter(homeDir, store);
}

export function removeCenterSkill(homeDir: string, skillId: string): void {
  const store = loadCenter(homeDir);
  store.skills = store.skills.filter((entry) => entry.id !== skillId);
  saveCenter(homeDir, store);
}

export function upsertInstallation(homeDir: string, skillId: string, installation: CenterInstallation): void {
  const store = loadCenter(homeDir);
  const skill = store.skills.find((entry) => entry.id === skillId);
  if (!skill) throw new CenterStoreError(`Cannot add installation: skill '${skillId}' not found in center.`);
  const index = skill.installations.findIndex((entry) => entry.id === installation.id);
  if (index >= 0) skill.installations[index] = installation;
  else skill.installations.push(installation);
  saveCenter(homeDir, store);
}

export function removeInstallation(homeDir: string, skillId: string, installationId: string): void {
  const store = loadCenter(homeDir);
  const skill = store.skills.find((entry) => entry.id === skillId);
  if (skill) {
    skill.installations = skill.installations.filter((entry) => entry.id !== installationId);
    saveCenter(homeDir, store);
  }
}

export function loadManagedSkills(homeDir: string = homedir()): ManagedSkill[] {
  return loadCenter(homeDir).skills.map((skill) => ({
    id: skill.id,
    name: skill.name,
    rootPath: skill.rootPath,
    source: skill.source,
    treeHash: skill.treeHash,
    addedAt: skill.addedAt,
    updatedAt: skill.updatedAt,
  }));
}

export function upsertManagedSkill(homeDir: string, skill: ManagedSkill): void {
  const store = loadCenter(homeDir);
  const existing = store.skills.find((entry) => entry.id === skill.id);
  upsertCenterSkill(homeDir, {
    id: skill.id,
    name: skill.name,
    rootPath: skill.rootPath,
    source: skill.source,
    treeHash: skill.treeHash,
    addedAt: skill.addedAt,
    updatedAt: skill.updatedAt,
    installations: existing?.installations ?? [],
  });
}

// --- Registry-compatible install path (legacy direct installs) ---------------

function registrySkillId(name: string, platform: Platform, scope: Scope): string {
  return hashValue({ registry: true, name, platform, scope });
}

function registryInstallationId(targetId: string, installedPath: string): string {
  return hashValue({ install: true, targetId, installedPath });
}

function toRegistrySource(source: ManagedSkillSource): { source: 'local' | 'marketplace'; sourceRef: string } {
  switch (source.type) {
    case 'marketplace':
      return { source: 'marketplace', sourceRef: source.sourceRef };
    case 'local':
      return { source: 'local', sourceRef: source.originalPath };
    case 'agent-import':
      return { source: 'local', sourceRef: source.originalPath };
    case 'github':
      return { source: 'local', sourceRef: source.repositoryUrl };
  }
}

function resolveTargetDescriptor(platform: Platform, scope: Scope): { targetId: string; platform: Platform } | undefined {
  const adapter = getPlatformAdapters().find((candidate) => candidate.platform === platform);
  const target = adapter?.installTargets.find((candidate) => candidate.scope === scope);
  return target ? { targetId: target.targetId, platform: adapter!.platform } : undefined;
}

export function loadCenterRegistry(homeDir: string = homedir()): InstallRegistry {
  const store = loadCenter(homeDir);
  const entries: RegistryEntry[] = [];
  for (const skill of store.skills) {
    if (skill.installations.length === 0) continue;
    for (const installation of skill.installations) {
      entries.push({
        name: skill.name,
        platform: installation.platform,
        scope: installation.scope,
        installedPath: installation.installedPath,
        ...(installation.installedRootPath ? { installedRootPath: installation.installedRootPath } : {}),
        installedAt: installation.installedAt,
        contentHash: installation.deployedHash,
        ...toRegistrySource(skill.source),
      });
    }
  }
  return { version: 1, entries };
}

export function findRegistryInstall(
  homeDir: string,
  name: string,
  platform: Platform,
  scope: Scope,
): RegistryEntry | undefined {
  return loadCenterRegistry(homeDir).entries.find(
    (entry) => entry.name === name && entry.platform === platform && entry.scope === scope,
  );
}

export interface RegistryInstallInput {
  name: string;
  platform: Platform;
  scope: Scope;
  installedPath: string;
  installedRootPath?: string;
  installedAt: string;
  contentHash: string;
  source: 'local' | 'marketplace';
  sourceRef: string;
  mode: 'symlink' | 'copy';
}

export function upsertRegistryInstall(homeDir: string, input: RegistryInstallInput): void {
  const rootPath = input.installedRootPath ?? input.installedPath;
  const target = resolveTargetDescriptor(input.platform, input.scope);
  const targetId = target?.targetId ?? `${input.platform}:${input.scope}`;
  const skillId = registrySkillId(input.name, input.platform, input.scope);
  const now = new Date().toISOString();
  const skill: CenterSkill = {
    id: skillId,
    name: input.name,
    rootPath,
    source: input.source === 'marketplace'
      ? { type: 'marketplace', sourceRef: input.sourceRef }
      : { type: 'local', originalPath: input.sourceRef },
    treeHash: input.contentHash,
    addedAt: now,
    updatedAt: now,
    installations: [
      {
        id: registryInstallationId(targetId, rootPath),
        targetId,
        platform: input.platform,
        scope: input.scope,
        mode: input.mode,
        installedPath: input.installedPath,
        ...(input.installedRootPath ? { installedRootPath: input.installedRootPath } : {}),
        deployedHash: input.contentHash,
        installedAt: input.installedAt,
      },
    ],
  };
  upsertCenterSkill(homeDir, skill);
}

export function removeRegistryInstall(homeDir: string, name: string, platform: Platform, scope: Scope): void {
  removeCenterSkill(homeDir, registrySkillId(name, platform, scope));
}

// --- Internals --------------------------------------------------------------

function loadCenterStore(path: string): CenterStore {
  try {
    const value = JSON.parse(fs.readFileSync(path, 'utf8')) as unknown;
    if (!isCenterStore(value)) throw new CenterStoreError(`Invalid center store: ${path}`);
    return value;
  } catch (error) {
    if (error instanceof CenterStoreError) throw error;
    throw new CenterStoreError(`Unable to read center store: ${path}`);
  }
}

interface RawDeployment {
  id: string;
  skillId: string;
  targetId: string;
  platform: Platform;
  scope: Scope;
  projectDir?: string;
  mode: DeploymentMode;
  installedPath: string;
  deployedHash: string;
  installedAt: string;
}

function readDeploymentsRaw(path: string): RawDeployment[] {
  if (!fs.existsSync(path)) return [];
  try {
    const value = JSON.parse(fs.readFileSync(path, 'utf8')) as unknown;
    if (value && typeof value === 'object' && Array.isArray((value as { deployments?: unknown }).deployments)) {
      return (value as { deployments: RawDeployment[] }).deployments;
    }
  } catch {
    // Corrupt deployment store is ignored during migration; catalog is authoritative.
  }
  return [];
}

function adoptLegacyRegistry(skills: CenterSkill[], registryPath: string): void {
  if (!fs.existsSync(registryPath)) return;
  const entries = loadRegistry(registryPath).entries;
  if (entries.length === 0) return;

  const allInstallations = skills.flatMap((skill) => skill.installations);
  for (const entry of entries) {
    const covered = allInstallations.find(
      (installation) => installation.installedPath === entry.installedPath || installation.installedPath === dirname(entry.installedPath),
    );
    if (covered) continue;

    const rootPath = entry.installedRootPath ?? dirname(entry.installedPath);
    let skill: CenterSkill | undefined;
    try {
      const contentRoot = fs.lstatSync(rootPath).isSymbolicLink() ? fs.realpathSync(rootPath) : rootPath;
      const treeHash = inspectSkillDirectory(contentRoot).treeHash;
      skill = skills.find((candidate) => candidate.treeHash === treeHash);
    } catch {
      // A legacy record without a valid existing directory remains unmigrated.
    }
    if (!skill) continue;

    const target = resolveTargetDescriptor(entry.platform, entry.scope);
    if (!target) continue;

    const mode: DeploymentMode = fs.lstatSync(rootPath).isSymbolicLink() ? 'symlink' : 'copy';
    skill.installations.push({
      id: randomUUID(),
      targetId: target.targetId,
      platform: entry.platform,
      scope: entry.scope,
      mode,
      installedPath: rootPath,
      deployedHash: skill.treeHash,
      installedAt: entry.installedAt,
    });
  }
}

function isCenterStore(value: unknown): value is CenterStore {
  return isRecord(value) && value.version === 1 && Array.isArray(value.skills) && value.skills.every(isCenterSkill);
}

function isCenterSkill(value: unknown): value is CenterSkill {
  return (
    isRecord(value) &&
    isString(value.id) &&
    isString(value.name) &&
    isString(value.rootPath) &&
    isManagedSkillSource(value.source) &&
    isString(value.treeHash) &&
    isString(value.addedAt) &&
    isString(value.updatedAt) &&
    Array.isArray(value.installations) &&
    value.installations.every(isCenterInstallation)
  );
}

function isCenterInstallation(value: unknown): value is CenterInstallation {
  return (
    isRecord(value) &&
    isString(value.id) &&
    isString(value.targetId) &&
    isString(value.platform) &&
    (value.scope === 'global' || value.scope === 'project') &&
    (value.mode === 'symlink' || value.mode === 'copy') &&
    isString(value.installedPath) &&
    isString(value.deployedHash) &&
    isString(value.installedAt) &&
    (value.installedRootPath === undefined || isString(value.installedRootPath)) &&
    (value.projectDir === undefined || isString(value.projectDir))
  );
}

function isManagedSkillSource(value: unknown): boolean {
  if (!isRecord(value) || typeof value.type !== 'string') return false;
  if (value.type === 'local' || value.type === 'marketplace') return isString(value.originalPath) || isString(value.sourceRef);
  if (value.type === 'agent-import') return isString(value.originalPath) && isString(value.platform);
  if (value.type === 'github') return isString(value.repositoryUrl) && isString(value.resolvedCommit);
  return false;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

export function hashValue(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}
