import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { basename, dirname, extname, join, relative, resolve } from 'node:path';

import { fetchMarketplaceSkill } from '../install/fetchMarketplace';
import { extractSkillName, installSkill } from '../install/installSkill';
import { listInstallTargetScopes, resolveInstallTarget } from '../install/resolveInstallPath';
import { uninstallSkill } from '../install/uninstallSkill';
import { loadEffectiveScanSources } from '../config/scanSources';
import type { Platform, Scope } from '../types/skill';
import { loadCenterRegistry } from '../library/centerStore';

export interface InstallRequest {
  source: string;
  sourceType: 'local' | 'marketplace';
  target: string;
  link?: boolean;
  scope?: Scope;
  projectDir?: string;
  homeDir?: string;
}

export interface InstallSourceSkill {
  id: string;
  name: string;
  sourcePath: string;
  relativePath: string;
}

export interface TargetAgentSkill {
  name: string;
  sourcePath: string;
  managed: boolean;
  scope: Scope;
}

export function inspectManagedSkillSource(source: string): { sourcePath: string; skills: InstallSourceSkill[] } {
  const sourcePath = resolve(source);
  if (!existsSync(sourcePath)) throw new Error(`Path not found: ${source}`);
  const entryPaths = findSkillEntryPaths(sourcePath);
  if (entryPaths.length === 0) throw new Error(`No SKILL.md files found: ${source}`);
  const root = statSync(sourcePath).isDirectory() ? sourcePath : dirname(sourcePath);
  const skills = entryPaths.map((entryPath) => {
    const relativePath = relative(root, entryPath) || basename(entryPath);
    return {
      id: entryPath,
      name: extractSkillName(readFileSync(entryPath, 'utf8'), entryPath),
      sourcePath: entryPath,
      relativePath,
    };
  }).sort((left, right) => left.relativePath.localeCompare(right.relativePath));
  return { sourcePath, skills };
}

export function listTargetAgentSkills(
  target: string,
  projectDir: string,
  requestedScope: Scope = 'global',
  homeDir?: string,
): { targetPath: string; scope: Scope; availableScopes: Scope[]; skills: TargetAgentSkill[] } {
  const targets = listInstallTargetScopes(target, { projectDir, homeDir });
  const resolvedTarget = targets.find((entry) => entry.scope === requestedScope) ?? targets[0];
  if (!resolvedTarget) throw new Error(`Platform '${target}' does not support skill installs.`);
  const registry = loadCenterRegistry(homeDir);
  const managedPaths = new Set(registry.entries
    .filter((entry) => entry.platform === resolvedTarget.platform)
    .map((entry) => resolve(entry.installedPath)));
  const entryPaths = new Map<string, Scope>();
  for (const source of loadEffectiveScanSources(projectDir, { homeDir })) {
    if (source.platform !== resolvedTarget.platform || source.resource !== 'skill' || !source.enabled || !source.layout || source.status !== 'exists') continue;
    const paths = source.layout === 'skill-dirs'
      ? findSkillEntryPaths(source.resolvedPath)
      : readdirSync(source.resolvedPath, { withFileTypes: true })
        .filter((entry) => entry.isFile() && ['.md', '.mdc'].includes(extname(entry.name).toLowerCase()))
        .map((entry) => join(source.resolvedPath, entry.name));
    paths.forEach((entryPath) => entryPaths.set(resolve(entryPath), source.scope));
  }
  const skills = [...entryPaths].map(([entryPath, scope]) => ({
    name: extractSkillName(readFileSync(entryPath, 'utf8'), entryPath),
    sourcePath: entryPath,
    managed: managedPaths.has(resolve(entryPath)),
    scope,
  })).sort((left, right) => left.name.localeCompare(right.name) || left.sourcePath.localeCompare(right.sourcePath));
  return { targetPath: resolvedTarget.globalDir, scope: resolvedTarget.scope, availableScopes: targets.map((entry) => entry.scope), skills };
}

export async function installManagedSkill(request: InstallRequest) {
  const target = resolveInstallTarget(request.target, {
    homeDir: request.homeDir,
    projectDir: request.projectDir,
    scope: request.scope ?? 'global',
  });
  const homeDir = request.homeDir ?? homedir();

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
      scope: target.scope,
      homeDir,
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
      scope: target.scope,
      homeDir,
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
  scope: Scope = 'global',
): Promise<void> {
  await uninstallSkill({ name, platform, scope, force, homeDir: homeDir ?? homedir() });
}

function findSkillEntryPaths(sourcePath: string): string[] {
  if (statSync(sourcePath).isFile()) return [sourcePath];
  const results: string[] = [];
  const visit = (directory: string): void => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      if (entry.name === '.git' || entry.name === 'node_modules') continue;
      const path = join(directory, entry.name);
      if (entry.isDirectory()) visit(path);
      else if (entry.isFile() && entry.name.toLowerCase() === 'skill.md') results.push(path);
    }
  };
  visit(sourcePath);
  return results;
}
