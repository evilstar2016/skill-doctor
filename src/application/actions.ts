import { existsSync, mkdtempSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';

import { buildExplanation } from '../explain/buildExplanation';
import { getDefaultWhenToUseCachePath, loadWhenToUseCache, saveWhenToUseCache } from '../explain/whenToUseCache';
import { runDiff } from '../diff/runDiff';
import { loadUserConfig } from '../config/loadUserConfig';
import { fetchMarketplaceSkill } from '../install/fetchMarketplace';
import { installSkill } from '../install/installSkill';
import { loadRegistry } from '../install/registry';
import { resolveInstallTarget } from '../install/resolveInstallPath';
import { uninstallSkill } from '../install/uninstallSkill';
import { renderDashboard } from '../render/renderDashboard';
import type { Platform } from '../types/skill';
import type { LlmExplainOptions } from '../types/explain';
import type { DoctorSnapshot, ResourceDetailPayload } from './types';

export async function getResourceDetail(snapshot: DoctorSnapshot, resourceId: string, homeDir?: string): Promise<ResourceDetailPayload> {
  const resource = snapshot.resources.find((entry) => entry.id === resourceId);
  if (!resource) throw new Error(`Resource not found: ${resourceId}`);
  const record = snapshot.skills.find((skill) => skill.sourcePath === resource.sourcePath && skill.name === resource.name);
  const llmOptions = getAnalysisOptions(homeDir);
  const cachePath = getDefaultWhenToUseCachePath(homeDir);
  const whenToUseCache = loadWhenToUseCache(cachePath);
  const skill = record ? await buildExplanation(record, snapshot.skills, { llmOptions, whenToUseCache }) : undefined;
  if (whenToUseCache.size > 0) saveWhenToUseCache(whenToUseCache, cachePath);
  return {
    resource,
    ...(skill ? { skill } : {}),
    issues: snapshot.issues.filter((issue) => issue.resourceIds.includes(resourceId)),
  };
}

export async function compareResources(
  snapshot: DoctorSnapshot,
  leftId: string,
  rightId: string,
  projectDir: string,
  homeDir?: string,
) {
  const left = snapshot.resources.find((entry) => entry.id === leftId);
  const right = snapshot.resources.find((entry) => entry.id === rightId);
  if (!left || !right) throw new Error('Choose two existing resources to compare.');
  if (!snapshot.skills.some((skill) => skill.name === left.name) || !snapshot.skills.some((skill) => skill.name === right.name)) {
    throw new Error('Only skill-like resources can be compared.');
  }
  return runDiff(left.name, right.name, projectDir, { llmOptions: getAnalysisOptions(homeDir) });
}

export function executeDuplicateCleanup(
  snapshot: DoctorSnapshot,
  issueId: string,
  removePath: string,
  confirmation: string,
): { removedPath: string; removedContainer: string } {
  const issue = snapshot.issues.find((entry) => entry.id === issueId && entry.kind === 'duplicate');
  if (!issue) throw new Error('Duplicate issue not found in the current scan.');
  const allowedPaths = issue.evidence.flatMap((entry) => entry.path ? [resolve(entry.path)] : []);
  const selected = resolve(removePath);
  if (!allowedPaths.includes(selected)) throw new Error('The selected path is not part of this duplicate issue.');
  if (confirmation !== removePath) throw new Error('Confirmation must exactly match the selected path.');
  if (!existsSync(selected)) throw new Error(`Path no longer exists: ${selected}`);

  const target = basename(selected).toLowerCase() === 'skill.md' ? dirname(selected) : selected;
  rmSync(target, { recursive: true });
  return { removedPath: selected, removedContainer: target };
}

export interface InstallRequest {
  source: string;
  sourceType: 'local' | 'marketplace';
  target: string;
  link?: boolean;
  homeDir?: string;
}

export async function installManagedSkill(request: InstallRequest) {
  const target = resolveInstallTarget(request.target, { homeDir: request.homeDir });
  const registryPath = getRegistryPath(request.homeDir);

  if (request.sourceType === 'local') {
    let sourcePath = resolve(request.source);
    if (!existsSync(sourcePath)) throw new Error(`Path not found: ${request.source}`);
    if (statSync(sourcePath).isDirectory()) sourcePath = join(sourcePath, 'SKILL.md');
    if (!existsSync(sourcePath)) throw new Error(`SKILL.md not found: ${sourcePath}`);
    return installSkill({
      source: sourcePath,
      platform: target.platform,
      globalDir: target.globalDir,
      layout: target.layout,
      registryPath,
      link: request.link ?? false,
      sourceRef: sourcePath,
      marketplaceSource: false,
    });
  }

  const content = await fetchMarketplaceSkill(request.source);
  const tempDir = mkdtempSync(join(tmpdir(), 'skill-doctor-ui-install-'));
  const tempFile = join(tempDir, 'SKILL.md');
  try {
    writeFileSync(tempFile, content, 'utf8');
    return await installSkill({
      source: tempFile,
      platform: target.platform,
      globalDir: target.globalDir,
      layout: target.layout,
      registryPath,
      link: false,
      sourceRef: request.source,
      marketplaceSource: true,
    });
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
}

export async function uninstallManagedSkill(
  name: string,
  platform: Platform,
  force: boolean,
  homeDir?: string,
): Promise<void> {
  await uninstallSkill({ name, platform, force, registryPath: getRegistryPath(homeDir) });
}

export function getManagedRegistry(homeDir?: string) {
  return loadRegistry(getRegistryPath(homeDir));
}

export function exportSnapshotDashboard(snapshot: DoctorSnapshot): string {
  const duplicates = snapshot.conflicts.filter((pair) => pair.kind === 'duplicate');
  return renderDashboard({
    skills: snapshot.skills,
    conflicts: snapshot.conflicts.filter((pair) => pair.kind === 'conflict'),
    duplicates,
    suggestions: snapshot.issues.flatMap((issue) => issue.cleanup ? [issue.cleanup] : []),
    auditResult: {
      scanned: snapshot.audit.scanned,
      findings: snapshot.audit.findings,
      aiFindings: snapshot.audit.aiFindings,
      summary: snapshot.audit.summary,
    },
  });
}

function getRegistryPath(homeDir?: string): string {
  const home = homeDir ?? process.env.HOME ?? process.env.USERPROFILE ?? '';
  return resolve(home, '.skill-doctor', 'registry.json');
}

function getAnalysisOptions(homeDir?: string): LlmExplainOptions | undefined {
  const analysis = loadUserConfig(homeDir).config.analysis;
  if (!analysis?.baseUrl || !analysis.model) return undefined;
  return {
    baseUrl: analysis.baseUrl,
    modelId: analysis.model,
    ...(analysis.apiKey ? { apiKey: analysis.apiKey } : {}),
    ...(analysis.timeoutMs ? { timeoutMs: analysis.timeoutMs } : {}),
  };
}
