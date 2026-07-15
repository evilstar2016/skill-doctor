import { createHash, randomUUID } from 'node:crypto';
import * as fs from 'node:fs';
import { homedir } from 'node:os';
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';

import { loadRegistry } from '../install/registry.js';
import { getPlatformAdapters, resolvePlatformPathTemplate, type PlatformInstallTarget } from '../platforms/registry.js';
import type { Platform, Scope } from '../types/skill.js';
import type { RegistryEntry } from '../types/install.js';
import { type ManagedSkill, loadManagedSkillCatalog } from './catalog.js';
import { getManagedSkillPaths } from './paths.js';
import { copySkillDirectory, inspectSkillDirectory } from './skillDirectory.js';

export type DeploymentMode = 'symlink' | 'copy';
export type DeploymentStatus = 'synced' | 'outdated' | 'modified' | 'missing' | 'conflict';

export interface SkillDeployment {
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
  status: DeploymentStatus;
}

export interface SkillDeploymentStore {
  version: 1;
  deployments: SkillDeployment[];
}

export interface ResolvedSkillDeploymentTarget {
  targetId: string;
  platform: Platform;
  scope: Scope;
  directory: string;
  layout: 'skill-dirs';
  projectDir?: string;
}

export interface DeploymentPreviewTarget extends ResolvedSkillDeploymentTarget {
  installedPath: string;
  precondition: string;
  state: 'available' | 'managed-link' | 'occupied';
  deploymentId?: string;
  status?: DeploymentStatus;
}

export interface SkillDeploymentPreview {
  planId: string;
  skillId: string;
  sourceHash: string;
  mode: DeploymentMode;
  targets: DeploymentPreviewTarget[];
}

export interface DeploymentCommitOutcome {
  targetId: string;
  deploymentId?: string;
  status: 'deployed' | 'registered' | 'unchanged' | 'failed';
  completedSteps: string[];
  failedStep?: string;
  rollback?: { originalRestored: boolean };
  message?: string;
}

export interface DeploymentCommitResult {
  planId: string;
  outcomes: DeploymentCommitOutcome[];
  needsRescan: boolean;
}

export interface ManagedSkillDeploymentList {
  skills: ManagedSkill[];
  deployments: SkillDeployment[];
  legacy: LegacyRegistryEntry[];
}

export interface LegacyRegistryEntry {
  entry: RegistryEntry;
  status: 'migrated' | 'pending-adoption';
  deploymentId?: string;
}

export class SkillDeploymentError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SkillDeploymentError';
  }
}

export function loadSkillDeploymentStore(path: string): SkillDeploymentStore {
  if (!fs.existsSync(path)) return { version: 1, deployments: [] };
  try {
    const value = JSON.parse(fs.readFileSync(path, 'utf8')) as unknown;
    if (!isSkillDeploymentStore(value)) throw new SkillDeploymentError(`Invalid deployment store: ${path}`);
    return value;
  } catch (error) {
    if (error instanceof SkillDeploymentError) throw error;
    throw new SkillDeploymentError(`Unable to read deployment store: ${path}`);
  }
}

export function saveSkillDeploymentStore(path: string, store: SkillDeploymentStore): void {
  if (!isSkillDeploymentStore(store)) throw new SkillDeploymentError('Refusing to save an invalid deployment store.');
  fs.mkdirSync(dirname(path), { recursive: true });
  const temporaryPath = join(dirname(path), `.${basename(path)}.${randomUUID()}.tmp`);
  try {
    fs.writeFileSync(temporaryPath, `${JSON.stringify(store, null, 2)}\n`, 'utf8');
    fs.renameSync(temporaryPath, path);
  } finally {
    fs.rmSync(temporaryPath, { force: true });
  }
}

export function listSkillDeploymentTargets(projectDir: string, options: { homeDir?: string; appDataDir?: string } = {}): ResolvedSkillDeploymentTarget[] {
  const homeDir = options.homeDir ?? homedir();
  const appDataDir = options.appDataDir ?? process.env['APPDATA'] ?? join(homeDir, 'AppData', 'Roaming');
  const resolvedProjectDir = resolve(projectDir);
  return getPlatformAdapters().flatMap((adapter) => adapter.installTargets)
    .filter((target) => target.layout === 'skill-dirs')
    .map((target) => resolveTarget(target, resolvedProjectDir, homeDir, appDataDir))
    .filter((target) => isWritableParent(target.directory));
}

export function previewSkillDeployment(options: {
  skillId: string;
  targetIds: string[];
  mode: DeploymentMode;
  projectDir: string;
  homeDir?: string;
  appDataDir?: string;
}): SkillDeploymentPreview {
  const context = loadContext(options.projectDir, options.homeDir, options.appDataDir);
  const skill = requireSkill(context.skills, options.skillId);
  const sourceHash = currentSkillHash(skill);
  const targets = selectTargets(context.targets, options.targetIds).map((target) => previewTarget(target, skill, context.store.deployments));
  const stableTargets = [...targets].sort((left, right) => left.targetId.localeCompare(right.targetId));
  return {
    planId: hashValue({ skillId: skill.id, sourceHash, mode: options.mode, targets: stableTargets.map((target) => ({ targetId: target.targetId, precondition: target.precondition })) }),
    skillId: skill.id,
    sourceHash,
    mode: options.mode,
    targets: stableTargets,
  };
}

export function commitSkillDeployment(options: {
  skillId: string;
  targetIds: string[];
  mode: DeploymentMode;
  planId: string;
  projectDir: string;
  homeDir?: string;
  appDataDir?: string;
  force?: boolean;
}): DeploymentCommitResult {
  const preview = previewSkillDeployment(options);
  if (preview.planId !== options.planId) throw new SkillDeploymentError('Deployment preview is stale. Preview again before committing.');
  const context = loadContext(options.projectDir, options.homeDir, options.appDataDir);
  const skill = requireSkill(context.skills, options.skillId);
  const outcomes = preview.targets.map((target) => {
    try {
      return deployTarget(target, skill, options.mode, context.store, context.storePath, options.force === true);
    } catch (error) {
      return {
        targetId: target.targetId,
        status: 'failed' as const,
        completedSteps: ['precondition-recheck'],
        failedStep: 'deploy',
        ...(error instanceof DeploymentWriteError ? { rollback: { originalRestored: error.originalRestored } } : {}),
        message: errorMessage(error),
      };
    }
  });
  return { planId: preview.planId, outcomes, needsRescan: outcomes.some((outcome) => outcome.status !== 'unchanged') };
}

export function listManagedSkillDeployments(projectDir: string, options: { homeDir?: string; appDataDir?: string } = {}): ManagedSkillDeploymentList {
  const context = loadContext(projectDir, options.homeDir, options.appDataDir);
  const legacy = adoptLegacyRegistryEntries(context);
  const deployments = context.store.deployments.map((deployment) => withStatus(deployment, context.skills.find((skill) => skill.id === deployment.skillId))).sort((left, right) => left.id.localeCompare(right.id));
  if (JSON.stringify(deployments) !== JSON.stringify(context.store.deployments)) {
    context.store.deployments = deployments;
    saveSkillDeploymentStore(context.storePath, context.store);
  }
  return { skills: context.skills, deployments, legacy };
}

export function syncSkillDeployment(options: {
  deploymentId: string;
  projectDir: string;
  homeDir?: string;
  appDataDir?: string;
  force?: boolean;
}): SkillDeployment {
  const context = loadContext(options.projectDir, options.homeDir, options.appDataDir);
  const deployment = requireDeployment(context.store, options.deploymentId);
  const skill = requireSkill(context.skills, deployment.skillId);
  if (deployment.mode !== 'copy') throw new SkillDeploymentError('Only copy deployments can be synchronized.');
  const status = getDeploymentStatus(deployment, skill);
  if (status === 'modified' && !options.force) throw new SkillDeploymentError('Modified copies require force confirmation before synchronization.');
  if (status !== 'outdated' && status !== 'modified') throw new SkillDeploymentError(`Deployment is ${status}; it cannot be synchronized.`);
  replaceWithDeployment(deployment.installedPath, skill, 'copy', options.force === true);
  const updated: SkillDeployment = { ...deployment, deployedHash: currentSkillHash(skill), installedAt: new Date().toISOString(), status: 'synced' };
  replaceDeployment(context.store, updated);
  saveSkillDeploymentStore(context.storePath, context.store);
  return updated;
}

export function uninstallSkillDeployment(options: {
  deploymentId: string;
  projectDir: string;
  homeDir?: string;
  appDataDir?: string;
  unregisterOnly?: boolean;
  force?: boolean;
}): { deploymentId: string; removed: boolean; unregistered: boolean; status: DeploymentStatus } {
  const context = loadContext(options.projectDir, options.homeDir, options.appDataDir);
  const deployment = requireDeployment(context.store, options.deploymentId);
  const skill = context.skills.find((entry) => entry.id === deployment.skillId);
  const status = getDeploymentStatus(deployment, skill);
  if (!options.unregisterOnly && (status === 'modified' || status === 'conflict') && !options.force) {
    throw new SkillDeploymentError('Modified or conflicting deployments require unregister-only or force confirmation.');
  }
  let removed = false;
  if (!options.unregisterOnly && status !== 'missing') {
    fs.rmSync(deployment.installedPath, { recursive: true, force: true });
    removed = true;
  }
  context.store.deployments = context.store.deployments.filter((entry) => entry.id !== deployment.id);
  saveSkillDeploymentStore(context.storePath, context.store);
  return { deploymentId: deployment.id, removed, unregistered: true, status };
}

function loadContext(projectDir: string, homeDir: string | undefined, appDataDir: string | undefined) {
  const paths = getManagedSkillPaths(homeDir);
  return {
    paths,
    storePath: paths.deploymentsPath,
    store: loadSkillDeploymentStore(paths.deploymentsPath),
    skills: loadManagedSkillCatalog(paths.catalogPath).skills,
    targets: listSkillDeploymentTargets(projectDir, { homeDir, appDataDir }),
    projectDir: resolve(projectDir),
  };
}

function resolveTarget(target: PlatformInstallTarget, projectDir: string, homeDir: string, appDataDir: string): ResolvedSkillDeploymentTarget {
  const directory = target.scope === 'global'
    ? resolvePlatformPathTemplate(target.path, homeDir, appDataDir)
    : resolveProjectTarget(projectDir, target.path);
  return {
    targetId: target.targetId,
    platform: findTargetPlatform(target.targetId),
    scope: target.scope,
    directory,
    layout: 'skill-dirs',
    ...(target.scope === 'project' ? { projectDir } : {}),
  };
}

function resolveProjectTarget(projectDir: string, template: string): string {
  if (isAbsolute(template)) throw new SkillDeploymentError(`Project deployment target must be relative: ${template}`);
  const directory = resolve(projectDir, template);
  const pathFromProject = relative(projectDir, directory);
  if (pathFromProject === '..' || pathFromProject.startsWith(`..${sep}`) || isAbsolute(pathFromProject)) {
    throw new SkillDeploymentError(`Project deployment target escapes the current project: ${template}`);
  }
  return directory;
}

function findTargetPlatform(targetId: string): Platform {
  for (const adapter of getPlatformAdapters()) {
    if (adapter.installTargets.some((target) => target.targetId === targetId)) return adapter.platform;
  }
  throw new SkillDeploymentError(`Unknown deployment target '${targetId}'.`);
}

function isWritableParent(directory: string): boolean {
  let candidate = directory;
  while (!fs.existsSync(candidate)) {
    const parent = dirname(candidate);
    if (parent === candidate) return false;
    candidate = parent;
  }
  try {
    return fs.statSync(candidate).isDirectory() && (fs.accessSync(candidate, fs.constants.W_OK), true);
  } catch {
    return false;
  }
}

function selectTargets(targets: ResolvedSkillDeploymentTarget[], targetIds: string[]): ResolvedSkillDeploymentTarget[] {
  if (!Array.isArray(targetIds) || targetIds.length === 0) throw new SkillDeploymentError('Select at least one deployment target.');
  const uniqueIds = [...new Set(targetIds)];
  if (uniqueIds.length !== targetIds.length) throw new SkillDeploymentError('Deployment targets must be unique.');
  return uniqueIds.map((targetId) => {
    const target = targets.find((entry) => entry.targetId === targetId);
    if (!target) throw new SkillDeploymentError(`Deployment target '${targetId}' is unavailable or not writable.`);
    return target;
  });
}

function previewTarget(target: ResolvedSkillDeploymentTarget, skill: ManagedSkill, deployments: SkillDeployment[]): DeploymentPreviewTarget {
  const installedPath = safeInstalledPath(target.directory, skill.name);
  const deployment = deployments.find((entry) => entry.targetId === target.targetId && entry.installedPath === installedPath);
  const status = deployment ? getDeploymentStatus(deployment, skill) : undefined;
  const state = targetState(installedPath, skill);
  return { ...target, installedPath, precondition: targetPrecondition(installedPath), state, ...(deployment ? { deploymentId: deployment.id, status } : {}) };
}

function deployTarget(target: DeploymentPreviewTarget, skill: ManagedSkill, mode: DeploymentMode, store: SkillDeploymentStore, storePath: string, force: boolean): DeploymentCommitOutcome {
  if (targetPrecondition(target.installedPath) !== target.precondition) throw new SkillDeploymentError('Deployment target changed after preview. Preview again before committing.');
  const existing = target.deploymentId ? store.deployments.find((entry) => entry.id === target.deploymentId) : undefined;
  if (existing && existing.skillId === skill.id && existing.mode === mode && target.status === 'synced') {
    return { targetId: target.targetId, deploymentId: existing.id, status: 'unchanged', completedSteps: ['precondition-recheck', 'already-synced'] };
  }
  if (target.state === 'managed-link' && mode === 'symlink' && !existing) {
    const deployment = createDeployment(target, skill, mode);
    store.deployments.push(deployment);
    saveSkillDeploymentStore(storePath, store);
    return { targetId: target.targetId, deploymentId: deployment.id, status: 'registered', completedSteps: ['precondition-recheck', 'registered-existing-link'] };
  }
  if (target.state !== 'available' && !force) throw new SkillDeploymentError('Target is occupied. Force confirmation is required to replace it.');
  const rollback = replaceWithDeployment(target.installedPath, skill, mode, force);
  const deployment = createDeployment(target, skill, mode);
  store.deployments = store.deployments.filter((entry) => entry.id !== existing?.id && entry.installedPath !== target.installedPath);
  store.deployments.push(deployment);
  saveSkillDeploymentStore(storePath, store);
  return { targetId: target.targetId, deploymentId: deployment.id, status: 'deployed', completedSteps: ['precondition-recheck', 'write-temporary-deployment', 'replace-target', 'save-deployment'], ...(rollback ? { rollback } : {}) };
}

function replaceWithDeployment(installedPath: string, skill: ManagedSkill, mode: DeploymentMode, force: boolean): { originalRestored: boolean } | undefined {
  const parent = dirname(installedPath);
  fs.mkdirSync(parent, { recursive: true });
  const temporaryPath = join(parent, `.skill-doctor-deploy-${randomUUID()}`);
  const backupPath = join(parent, `.skill-doctor-backup-${randomUUID()}`);
  let movedOriginal = false;
  try {
    if (mode === 'symlink') {
      fs.symlinkSync(skill.rootPath, temporaryPath, 'dir');
      if (fs.realpathSync(temporaryPath) !== fs.realpathSync(skill.rootPath)) throw new SkillDeploymentError('Temporary deployment link does not resolve to the managed skill.');
    } else {
      copySkillDirectory(skill.rootPath, temporaryPath);
      if (inspectSkillDirectory(temporaryPath).treeHash !== currentSkillHash(skill)) throw new SkillDeploymentError('Temporary deployment copy does not match the managed skill.');
    }
    if (pathExists(installedPath)) {
      if (!force) throw new SkillDeploymentError('Target is occupied. Force confirmation is required to replace it.');
      fs.renameSync(installedPath, backupPath);
      movedOriginal = true;
    }
    fs.renameSync(temporaryPath, installedPath);
    if (movedOriginal) fs.rmSync(backupPath, { recursive: true, force: true });
    return undefined;
  } catch (error) {
    fs.rmSync(temporaryPath, { recursive: true, force: true });
    let originalRestored = !movedOriginal;
    if (movedOriginal && pathExists(backupPath)) {
      try {
        if (pathExists(installedPath)) fs.rmSync(installedPath, { recursive: true, force: true });
        fs.renameSync(backupPath, installedPath);
        originalRestored = true;
      } catch {
        originalRestored = false;
      }
    }
    throw new DeploymentWriteError(errorMessage(error), originalRestored);
  }
}

function createDeployment(target: DeploymentPreviewTarget, skill: ManagedSkill, mode: DeploymentMode): SkillDeployment {
  return {
    id: randomUUID(),
    skillId: skill.id,
    targetId: target.targetId,
    platform: target.platform,
    scope: target.scope,
    ...(target.scope === 'project' ? { projectDir: target.projectDir } : {}),
    mode,
    installedPath: target.installedPath,
    deployedHash: currentSkillHash(skill),
    installedAt: new Date().toISOString(),
    status: 'synced',
  };
}

function targetState(installedPath: string, skill: ManagedSkill): 'available' | 'managed-link' | 'occupied' {
  try {
    const stats = fs.lstatSync(installedPath);
    if (stats.isSymbolicLink() && fs.realpathSync(installedPath) === fs.realpathSync(skill.rootPath)) return 'managed-link';
    return 'occupied';
  } catch {
    return 'available';
  }
}

function targetPrecondition(path: string): string {
  try {
    const stats = fs.lstatSync(path);
    if (stats.isSymbolicLink()) return hashValue({ type: 'link', target: fs.realpathSync(path) });
    if (stats.isDirectory()) return hashValue({ type: 'directory', treeHash: inspectSkillDirectory(path).treeHash });
    return hashValue({ type: 'other', mode: stats.mode });
  } catch (error) {
    return hashValue({ type: 'missing', code: errorCode(error) });
  }
}

function withStatus(deployment: SkillDeployment, skill: ManagedSkill | undefined): SkillDeployment {
  return { ...deployment, status: getDeploymentStatus(deployment, skill) };
}

function getDeploymentStatus(deployment: SkillDeployment, skill: ManagedSkill | undefined): DeploymentStatus {
  if (!pathExists(deployment.installedPath)) return 'missing';
  if (!skill) return 'conflict';
  try {
    const stats = fs.lstatSync(deployment.installedPath);
    if (deployment.mode === 'symlink') {
      return stats.isSymbolicLink() && fs.realpathSync(deployment.installedPath) === fs.realpathSync(skill.rootPath) ? 'synced' : 'conflict';
    }
    if (stats.isSymbolicLink() || !stats.isDirectory()) return 'conflict';
    const currentHash = inspectSkillDirectory(deployment.installedPath).treeHash;
    const centralHash = currentSkillHash(skill);
    if (currentHash === deployment.deployedHash && centralHash === deployment.deployedHash) return 'synced';
    if (currentHash === deployment.deployedHash && centralHash !== deployment.deployedHash) return 'outdated';
    return 'modified';
  } catch {
    return 'conflict';
  }
}

function adoptLegacyRegistryEntries(context: ReturnType<typeof loadContext>): LegacyRegistryEntry[] {
  if (!fs.existsSync(context.paths.registryPath)) return [];
  const legacy: LegacyRegistryEntry[] = [];
  for (const entry of loadRegistry(context.paths.registryPath).entries) {
    const existing = context.store.deployments.find((deployment) => deployment.installedPath === entry.installedPath || deployment.installedPath === dirname(entry.installedPath));
    if (existing) {
      legacy.push({ entry, status: 'migrated', deploymentId: existing.id });
      continue;
    }
    const target = context.targets.find((candidate) => candidate.platform === entry.platform && candidate.scope === entry.scope && entry.installedPath === join(candidate.directory, entry.name, 'SKILL.md'));
    const rootPath = dirname(entry.installedPath);
    let skill: ManagedSkill | undefined;
    try {
      const contentRoot = fs.lstatSync(rootPath).isSymbolicLink() ? fs.realpathSync(rootPath) : rootPath;
      const treeHash = inspectSkillDirectory(contentRoot).treeHash;
      skill = context.skills.find((candidate) => candidate.treeHash === treeHash);
    } catch {
      // A legacy record without a valid existing directory must remain pending.
    }
    if (!target || !skill) {
      legacy.push({ entry, status: 'pending-adoption' });
      continue;
    }
    const mode: DeploymentMode = fs.lstatSync(rootPath).isSymbolicLink() ? 'symlink' : 'copy';
    const deployment: SkillDeployment = {
      id: randomUUID(), skillId: skill.id, targetId: target.targetId, platform: target.platform, scope: entry.scope, mode,
      installedPath: rootPath, deployedHash: skill.treeHash, installedAt: entry.installedAt, status: getDeploymentStatus({ id: '', skillId: skill.id, targetId: target.targetId, platform: target.platform, scope: entry.scope, mode, installedPath: rootPath, deployedHash: skill.treeHash, installedAt: entry.installedAt, status: 'synced' }, skill),
    };
    context.store.deployments.push(deployment);
    saveSkillDeploymentStore(context.storePath, context.store);
    legacy.push({ entry, status: 'migrated', deploymentId: deployment.id });
  }
  return legacy;
}

function requireSkill(skills: ManagedSkill[], skillId: string): ManagedSkill {
  const skill = skills.find((entry) => entry.id === skillId);
  if (!skill) throw new SkillDeploymentError(`Managed skill '${skillId}' does not exist.`);
  return skill;
}

function requireDeployment(store: SkillDeploymentStore, deploymentId: string): SkillDeployment {
  const deployment = store.deployments.find((entry) => entry.id === deploymentId);
  if (!deployment) throw new SkillDeploymentError(`Deployment '${deploymentId}' does not exist.`);
  return deployment;
}

function replaceDeployment(store: SkillDeploymentStore, updated: SkillDeployment): void {
  store.deployments = store.deployments.map((entry) => entry.id === updated.id ? updated : entry);
}

function currentSkillHash(skill: ManagedSkill): string {
  return inspectSkillDirectory(skill.rootPath).treeHash;
}

function safeInstalledPath(directory: string, name: string): string {
  if (!name || name === '.' || name === '..' || /[\\/\0]/.test(name)) throw new SkillDeploymentError(`Invalid managed skill name '${name}'.`);
  const path = resolve(directory, name);
  const inside = relative(directory, path);
  if (inside === '..' || inside.startsWith(`..${sep}`) || isAbsolute(inside)) throw new SkillDeploymentError('Deployment path escapes its target directory.');
  return path;
}

function pathExists(path: string): boolean {
  try { fs.lstatSync(path); return true; } catch { return false; }
}

function hashValue(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function errorCode(error: unknown): string | undefined {
  return typeof error === 'object' && error !== null && 'code' in error ? String((error as { code?: unknown }).code) : undefined;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

class DeploymentWriteError extends SkillDeploymentError {
  constructor(message: string, readonly originalRestored: boolean) { super(message); }
}

function isSkillDeploymentStore(value: unknown): value is SkillDeploymentStore {
  return isRecord(value) && value.version === 1 && Array.isArray(value.deployments) && value.deployments.every(isSkillDeployment);
}

function isSkillDeployment(value: unknown): value is SkillDeployment {
  return isRecord(value) && isString(value.id) && isString(value.skillId) && isString(value.targetId) && isString(value.platform) && (value.scope === 'global' || value.scope === 'project') &&
    (value.mode === 'symlink' || value.mode === 'copy') && isString(value.installedPath) && isString(value.deployedHash) && isString(value.installedAt) &&
    (value.status === 'synced' || value.status === 'outdated' || value.status === 'modified' || value.status === 'missing' || value.status === 'conflict') &&
    (value.projectDir === undefined || isString(value.projectDir));
}

function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === 'object' && value !== null; }
function isString(value: unknown): value is string { return typeof value === 'string' && value.length > 0; }
