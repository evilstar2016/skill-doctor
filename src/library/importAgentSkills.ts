import { createHash, randomUUID } from 'node:crypto';
import * as fs from 'node:fs';
import { homedir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';

import { loadEffectiveScanSources } from '../config/scanSources.js';
import type { Platform, Scope } from '../types/skill.js';
import { type ManagedSkill } from './catalog.js';
import { importLocalSkill } from './importLocalSkill.js';
import { loadManagedSkills, removeCenterSkill } from './centerStore.js';
import { getManagedSkillPaths } from './paths.js';
import { inspectSkillDirectory } from './skillDirectory.js';

export type AgentImportCandidateStatus =
  | 'new'
  | 'identical-copy'
  | 'same-name-different-content'
  | 'managed-link'
  | 'external-link'
  | 'invalid'
  | 'unreadable';

export type AgentImportDecisionAction = 'keep-copy' | 'replace-with-link' | 'keep-separate' | 'use-managed-link' | 'register' | 'skip';

export interface AgentImportCandidate {
  id: string;
  rootPath: string;
  platform: Platform;
  scope: Scope;
  sourceId: string;
  status: AgentImportCandidateStatus;
  group: { root: string; normalizedName?: string; treeHash?: string };
  name?: string;
  treeHash?: string;
  managedSkillId?: string;
  allowedActions: AgentImportDecisionAction[];
  diagnostic?: string;
  precondition: string;
  contentRootPath?: string;
}

export interface AgentSkillImportPreview {
  planId: string;
  candidates: AgentImportCandidate[];
}

export interface AgentImportDecision {
  candidateId: string;
  action: AgentImportDecisionAction;
  name?: string;
}

export interface AgentImportCommitResult {
  planId: string;
  outcomes: AgentImportCommitOutcome[];
  needsRescan: boolean;
}

export interface AgentImportCommitOutcome {
  candidateId: string;
  status: 'skipped' | 'registered' | 'imported' | 'reused' | 'linked' | 'failed';
  managedSkillId?: string;
  completedSteps: string[];
  failedStep?: string;
  rollback?: { originalRestored: boolean; managedSkillRemoved: boolean };
  message?: string;
}

export interface AgentSkillImportOptions {
  projectDir: string;
  homeDir?: string;
  linkFactory?: (targetPath: string, linkPath: string) => void;
}

export function previewAgentSkillImport(options: AgentSkillImportOptions): AgentSkillImportPreview {
  const skills = loadManagedSkills(options.homeDir);
  const candidates = collectCandidateRoots(options).map((entry) => inspectCandidate(entry, skills));
  candidates.sort((left, right) => left.rootPath.localeCompare(right.rootPath) || left.id.localeCompare(right.id));
  return { planId: hashValue(candidates), candidates };
}

export function commitAgentSkillImport(
  options: AgentSkillImportOptions & { planId: string; decisions: AgentImportDecision[] },
): AgentImportCommitResult {
  const preview = previewAgentSkillImport(options);
  if (preview.planId !== options.planId) {
    throw new Error('Import preview is stale. Scan again before committing.');
  }

  const decisions = new Map(options.decisions.map((decision) => [decision.candidateId, decision]));
  const outcomes = preview.candidates.map((candidate) => commitCandidate(candidate, decisions.get(candidate.id), options.homeDir, options.linkFactory));
  return { planId: preview.planId, outcomes, needsRescan: outcomes.some((outcome) => outcome.status !== 'skipped') };
}

function collectCandidateRoots(options: AgentSkillImportOptions): CandidateRoot[] {
  const seen = new Set<string>();
  const roots: CandidateRoot[] = [];
  for (const source of loadEffectiveScanSources(options.projectDir, { homeDir: options.homeDir })) {
    if (source.resource !== 'skill' || !source.enabled || source.mode !== 'recursive-dir' || source.layout !== 'skill-dirs') continue;
    if (source.status === 'unreadable') {
      addRoot(source.resolvedPath, source.platform, source.scope, source.id, roots, seen);
      continue;
    }
    if (source.status !== 'exists') continue;
    try {
      const stats = fs.lstatSync(source.resolvedPath);
      if (stats.isSymbolicLink() || !stats.isDirectory()) {
        addRoot(source.resolvedPath, source.platform, source.scope, source.id, roots, seen);
        continue;
      }
      for (const name of fs.readdirSync(source.resolvedPath).sort((left, right) => left.localeCompare(right))) {
        if (name.startsWith('.')) continue;
        const child = join(source.resolvedPath, name);
        try {
          if (fs.lstatSync(child).isDirectory() || fs.lstatSync(child).isSymbolicLink()) {
            addRoot(child, source.platform, source.scope, source.id, roots, seen);
          }
        } catch {
          addRoot(child, source.platform, source.scope, source.id, roots, seen);
        }
      }
    } catch {
      addRoot(source.resolvedPath, source.platform, source.scope, source.id, roots, seen);
    }
  }
  return roots;
}

function addRoot(rootPath: string, platform: Platform, scope: Scope, sourceId: string, roots: CandidateRoot[], seen: Set<string>): void {
  const resolvedPath = resolve(rootPath);
  const key = `${platform}|${scope}|${sourceId}|${resolvedPath}`;
  if (seen.has(key)) return;
  seen.add(key);
  roots.push({ rootPath: resolvedPath, platform, scope, sourceId });
}

function inspectCandidate(entry: CandidateRoot, skills: ManagedSkill[]): AgentImportCandidate {
  const id = hashValue(entry);
  try {
    const stats = fs.lstatSync(entry.rootPath);
    if (stats.isSymbolicLink()) return inspectLinkCandidate(entry, skills, id);
    const inspection = inspectSkillDirectory(entry.rootPath);
    return classifyContentCandidate(entry, inspection.rootPath, inspection.name, inspection.treeHash, skills, id);
  } catch (error) {
    return diagnosticCandidate(entry, id, error);
  }
}

function inspectLinkCandidate(entry: CandidateRoot, skills: ManagedSkill[], id: string): AgentImportCandidate {
  const target = fs.realpathSync(entry.rootPath);
  const managed = skills.find((skill) => fs.realpathSync(skill.rootPath) === target);
  const inspection = inspectSkillDirectory(target);
  if (managed) {
    return candidate(entry, id, 'managed-link', inspection.name, inspection.treeHash, ['register', 'skip'], {
      managedSkillId: managed.id,
      contentRootPath: target,
    });
  }
  return candidate(entry, id, 'external-link', inspection.name, inspection.treeHash, ['keep-copy', 'replace-with-link', 'skip'], {
    contentRootPath: target,
  });
}

function classifyContentCandidate(entry: CandidateRoot, contentRootPath: string, name: string, treeHash: string, skills: ManagedSkill[], id: string): AgentImportCandidate {
  const identical = skills.find((skill) => skill.treeHash === treeHash);
  if (identical) {
    return candidate(entry, id, 'identical-copy', name, treeHash, ['keep-copy', 'replace-with-link', 'skip'], {
      managedSkillId: identical.id,
      contentRootPath,
    });
  }
  const sameName = skills.find((skill) => normalizeName(skill.name) === normalizeName(name));
  if (sameName) {
    return candidate(entry, id, 'same-name-different-content', name, treeHash, ['keep-separate', 'use-managed-link', 'skip'], {
      managedSkillId: sameName.id,
      contentRootPath,
    });
  }
  return candidate(entry, id, 'new', name, treeHash, ['keep-copy', 'replace-with-link', 'skip'], { contentRootPath });
}

function candidate(
  entry: CandidateRoot,
  id: string,
  status: AgentImportCandidateStatus,
  name: string,
  treeHash: string,
  allowedActions: AgentImportDecisionAction[],
  extra: Pick<AgentImportCandidate, 'managedSkillId' | 'contentRootPath'>,
): AgentImportCandidate {
  const base = {
    id,
    rootPath: entry.rootPath,
    platform: entry.platform,
    scope: entry.scope,
    sourceId: entry.sourceId,
    status,
    group: { root: resolve(entry.rootPath), normalizedName: normalizeName(name), treeHash },
    name,
    treeHash,
    allowedActions,
    ...extra,
  };
  return { ...base, precondition: sourcePrecondition(entry) };
}

function diagnosticCandidate(entry: CandidateRoot, id: string, error: unknown): AgentImportCandidate {
  const diagnostic = error instanceof Error ? error.message : String(error);
  const unreadable = isUnreadableError(error);
  const status: AgentImportCandidateStatus = unreadable ? 'unreadable' : 'invalid';
  return {
    id,
    rootPath: entry.rootPath,
    platform: entry.platform,
    scope: entry.scope,
    sourceId: entry.sourceId,
    status,
    group: { root: resolve(entry.rootPath) },
    allowedActions: ['skip'],
    diagnostic,
    precondition: sourcePrecondition(entry),
  };
}

function commitCandidate(
  candidate: AgentImportCandidate,
  decision: AgentImportDecision | undefined,
  homeDir: string | undefined,
  linkFactory: ((targetPath: string, linkPath: string) => void) | undefined,
): AgentImportCommitOutcome {
  if (!decision || !candidate.allowedActions.includes(decision.action)) {
    return { candidateId: candidate.id, status: 'failed', completedSteps: [], failedStep: 'decision', message: 'An explicit valid decision is required.' };
  }
  if (decision.action === 'skip') return { candidateId: candidate.id, status: 'skipped', completedSteps: ['decision'] };
  if (candidate.status === 'invalid' || candidate.status === 'unreadable') {
    return { candidateId: candidate.id, status: 'failed', completedSteps: ['decision'], failedStep: 'validation', message: candidate.diagnostic };
  }
  if (decision.action === 'register') {
    return { candidateId: candidate.id, status: 'registered', managedSkillId: candidate.managedSkillId, completedSteps: ['precondition-recheck', 'registered-managed-link'] };
  }

  try {
    assertPrecondition(candidate);
    if (decision.action === 'use-managed-link') {
      const skill = requireManagedSkill(candidate, homeDir);
      return takeOver(candidate, skill, false, homeDir, linkFactory);
    }
    const imported = importCandidate(candidate, decision, homeDir);
    if (decision.action === 'replace-with-link') {
      return takeOver(candidate, imported.skill, imported.imported, homeDir, linkFactory);
    }
    return {
      candidateId: candidate.id,
      status: imported.imported ? 'imported' : 'reused',
      managedSkillId: imported.skill.id,
      completedSteps: ['precondition-recheck', imported.imported ? 'central-import' : 'reused-managed-skill'],
    };
  } catch (error) {
    return { candidateId: candidate.id, status: 'failed', completedSteps: ['precondition-recheck'], failedStep: 'central-import', message: errorMessage(error) };
  }
}

function importCandidate(candidate: AgentImportCandidate, decision: AgentImportDecision, homeDir: string | undefined) {
  if (!candidate.contentRootPath || !candidate.name) throw new Error('Candidate content is unavailable.');
  const name = decision.action === 'keep-separate' ? decision.name?.trim() : undefined;
  if (decision.action === 'keep-separate' && !name) throw new Error('A distinct name is required to keep same-name content separately.');
  return importLocalSkill({
    sourcePath: candidate.contentRootPath,
    homeDir,
    name,
    source: { type: 'agent-import', originalPath: candidate.rootPath, platform: candidate.platform },
  });
}

function requireManagedSkill(candidate: AgentImportCandidate, homeDir: string | undefined): ManagedSkill {
  const skill = loadManagedSkills(homeDir).find((entry) => entry.id === candidate.managedSkillId);
  if (!skill) throw new Error('The selected managed skill no longer exists.');
  return skill;
}

function takeOver(
  candidate: AgentImportCandidate,
  skill: ManagedSkill,
  newlyImported: boolean,
  homeDir: string | undefined,
  linkFactory: ((targetPath: string, linkPath: string) => void) | undefined,
): AgentImportCommitOutcome {
  const paths = getManagedSkillPaths(homeDir);
  const steps = ['precondition-recheck'];
  let backupPath: string | undefined;
  let temporaryLinkPath: string | undefined;
  try {
    assertPrecondition(candidate);
    fs.mkdirSync(paths.backupsDir, { recursive: true });
    backupPath = join(paths.backupsDir, `agent-import-${randomUUID()}-${basename(candidate.rootPath)}`);
    fs.renameSync(candidate.rootPath, backupPath);
    steps.push('backup-original');
    temporaryLinkPath = join(dirname(candidate.rootPath), `.skill-doctor-link-${randomUUID()}`);
    (linkFactory ?? createSkillLink)(skill.rootPath, temporaryLinkPath);
    if (fs.realpathSync(temporaryLinkPath) !== fs.realpathSync(skill.rootPath)) throw new Error('Temporary link does not resolve to the managed skill.');
    fs.renameSync(temporaryLinkPath, candidate.rootPath);
    temporaryLinkPath = undefined;
    steps.push('replace-with-directory-link');
    return { candidateId: candidate.id, status: 'linked', managedSkillId: skill.id, completedSteps: steps };
  } catch (error) {
    if (temporaryLinkPath) fs.rmSync(temporaryLinkPath, { force: true });
    const originalRestored = restoreOriginal(candidate.rootPath, backupPath);
    const managedSkillRemoved = newlyImported ? removeManagedSkill(skill, homeDir) : false;
    return {
      candidateId: candidate.id,
      status: 'failed',
      managedSkillId: skill.id,
      completedSteps: steps,
      failedStep: steps.includes('backup-original') ? 'replace-with-directory-link' : 'backup-original',
      rollback: { originalRestored, managedSkillRemoved },
      message: errorMessage(error),
    };
  }
}

function assertPrecondition(candidate: AgentImportCandidate): void {
  const current = sourcePrecondition({ rootPath: candidate.rootPath, platform: candidate.platform, scope: candidate.scope, sourceId: candidate.sourceId });
  if (current !== candidate.precondition) throw new Error('Candidate changed after preview. Scan again before committing.');
}

function restoreOriginal(rootPath: string, backupPath: string | undefined): boolean {
  if (!backupPath || !pathExists(backupPath)) return false;
  try {
    if (pathExists(rootPath)) fs.rmSync(rootPath, { recursive: true, force: true });
    fs.renameSync(backupPath, rootPath);
    return true;
  } catch {
    return false;
  }
}

function removeManagedSkill(skill: ManagedSkill, homeDir: string | undefined): boolean {
  try {
    fs.rmSync(skill.rootPath, { recursive: true, force: true });
    removeCenterSkill(homeDir ?? homedir(), skill.id);
    return true;
  } catch {
    return false;
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

function normalizeName(name: string): string {
  return name.trim().toLocaleLowerCase('en-US');
}

function hashValue(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function sourcePrecondition(entry: CandidateRoot): string {
  try {
    const stats = fs.lstatSync(entry.rootPath);
    const contentRootPath = stats.isSymbolicLink() ? fs.realpathSync(entry.rootPath) : entry.rootPath;
    const inspection = inspectSkillDirectory(contentRootPath);
    return hashValue({ rootPath: entry.rootPath, kind: stats.isSymbolicLink() ? 'link' : 'directory', target: stats.isSymbolicLink() ? contentRootPath : undefined, treeHash: inspection.treeHash });
  } catch (error) {
    return hashValue({ rootPath: entry.rootPath, error: isUnreadableError(error) ? 'unreadable' : errorMessage(error) });
  }
}

function isUnreadableError(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && (error as { code?: string }).code === 'EACCES';
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** Create a platform-appropriate directory link (symlink on Unix, junction on Windows). */
function createSkillLink(targetPath: string, linkPath: string): void {
  if (process.platform === 'win32') {
    fs.symlinkSync(resolve(targetPath), linkPath, 'junction');
  } else {
    fs.symlinkSync(targetPath, linkPath, 'dir');
  }
}

interface CandidateRoot {
  rootPath: string;
  platform: Platform;
  scope: Scope;
  sourceId: string;
}
