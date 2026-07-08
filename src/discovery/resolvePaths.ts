import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { basename, dirname, extname, join, sep } from 'node:path';
import { homedir } from 'node:os';

import type { Confidence, Platform, Scope, SkillFile } from '../types/skill';
import {
  PLATFORM_PATHS,
  UNKNOWN_PLATFORM_ADAPTER,
  getPlatformAdapter,
  resolveCustomPath,
  resolvePlatformPathTemplate,
  type PathTarget,
  type PlatformPathDefinition,
} from '../platforms/registry';

export { PLATFORM_PATHS, type PathTarget, type PlatformPathDefinition } from '../platforms/registry';

interface ResolvePathsOptions {
  homeDir?: string;
  appDataDir?: string;
  extraPaths?: string[];
  includeCostPaths?: boolean;
}

export function resolvePaths(cwd: string, options: ResolvePathsOptions = {}): SkillFile[] {
  const homeDir = options.homeDir ?? homedir();
  const appDataDir = options.appDataDir ?? join(homeDir, 'AppData', 'Roaming');
  const results: SkillFile[] = [];
  const seen = new Set<string>();

  for (const definition of PLATFORM_PATHS) {
    for (const target of definition.global) {
      if (target.costOnly && !options.includeCostPaths) continue;
      collectPath(
        resolvePlatformPathTemplate(target.path, homeDir, appDataDir),
        definition,
        target,
        'global',
        results,
        seen,
      );
    }

    for (const target of definition.project) {
      if (target.costOnly && !options.includeCostPaths) continue;
      collectPath(join(cwd, target.path), definition, target, 'project', results, seen);
    }
  }

  if (options.includeCostPaths) {
    collectGeminiConfiguredContextFiles(cwd, homeDir, results, seen);
    collectNestedCopilotAgentInstructions(cwd, results, seen);
  }

  for (const raw of options.extraPaths ?? []) {
    const resolved = resolveCustomPath(raw, homeDir);
    const expanded = resolved.includes('*') ? expandGlob(resolved) : [resolved];
    for (const expandedPath of expanded) {
      collectPath(expandedPath, UNKNOWN_PLATFORM_ADAPTER, { path: expandedPath, mode: 'recursive-dir', layout: 'skill-dirs' }, 'global', results, seen);
    }
  }

  return applyAgentOverridePrecedence(results);
}

function collectPath(
  targetPath: string,
  definition: PlatformPathDefinition,
  target: PathTarget,
  scope: Scope,
  results: SkillFile[],
  seen: Set<string>,
  depth = 0,
): void {
  if (!existsSync(targetPath)) {
    return;
  }

  const stats = statSync(targetPath);

  if (stats.isDirectory()) {
    if (target.mode !== 'recursive-dir') {
      return;
    }

    const children = readdirSync(targetPath);
    const matchingFiles: string[] = [];
    const subdirs: string[] = [];

    for (const child of children) {
      if (child.startsWith('.')) continue;
      const childPath = join(targetPath, child);
      let childStats;
      try {
        childStats = statSync(childPath);
      } catch {
        continue;
      }
      if (childStats.isDirectory()) {
        subdirs.push(childPath);
      } else if (isAllowedFile(childPath, definition.extensions, target.includeFileNames, target.includeFileNameSuffixes)) {
        matchingFiles.push(childPath);
      }
    }

    if (depth === 0) {
      if (target.layout !== 'skill-dirs') {
        for (const filePath of matchingFiles) {
          pushResult(filePath, target.path, definition, scope, results, seen);
        }
      }

      for (const subdir of subdirs) {
        collectPath(subdir, definition, target, scope, results, seen, depth + 1);
      }
      return;
    }

    if (target.layout !== 'skill-dirs') {
      for (const filePath of matchingFiles) {
        pushResult(filePath, target.path, definition, scope, results, seen);
      }
      for (const subdir of subdirs) {
        collectPath(subdir, definition, target, scope, results, seen, depth + 1);
      }
      return;
    }

    if (matchingFiles.length > 0) {
      const primary = selectPrimaryFile(matchingFiles, definition.platform, target.layout === 'skill-dirs');
      if (primary) {
        pushResult(primary, target.path, definition, scope, results, seen);
      }
      return;
    }

    if (depth === 1) {
      for (const subdir of subdirs) {
        collectPath(subdir, definition, target, scope, results, seen, depth + 1);
      }
    }

    return;
  }

  if (!isAllowedFile(targetPath, definition.extensions, target.includeFileNames, target.includeFileNameSuffixes)) {
    return;
  }

  pushResult(targetPath, target.path, definition, scope, results, seen);
}

function pushResult(
  filePath: string,
  installSource: string,
  definition: PlatformPathDefinition,
  scope: Scope,
  results: SkillFile[],
  seen: Set<string>,
): void {
  const key = `${definition.platform}|${scope}|${filePath}`;
  if (seen.has(key)) {
    return;
  }
  seen.add(key);
  results.push({
    filePath,
    platform: definition.platform,
    scope,
    confidence: definition.confidence,
    installSource,
  });
}

function getEntryFileName(platform: Platform): string | null {
  switch (platform) {
    case 'claude':
    case 'codex':
    case 'copilot':
    case 'gemini':
    case 'kiro':
    case 'trae':
    case 'opencode':
    case 'windsurf':
      return 'SKILL.md';
    default:
      return 'SKILL.md';
  }
}

function selectPrimaryFile(files: string[], platform: Platform, strictEntryFile: boolean): string | null {
  if (files.length === 0) return null;

  const sorted = [...files].sort((a, b) => basename(a).localeCompare(basename(b)));

  if (strictEntryFile) {
    const entryFileName = getEntryFileName(platform);
    if (entryFileName === null) {
      return selectFlexiblePrimaryFile(sorted, platform);
    }
    return sorted.find((filePath) => basename(filePath) === entryFileName) ?? null;
  }

  return selectFlexiblePrimaryFile(sorted, platform);
}

function selectFlexiblePrimaryFile(files: string[], platform: Platform): string | null {
  switch (platform) {
    case 'cursor':
      return (
        files.find((filePath) => extname(filePath).toLowerCase() === '.mdc') ??
        files.find((filePath) => basename(filePath) === 'SKILL.md') ??
        files[0] ??
        null
      );
    case 'copilot':
      return (
        files.find((filePath) => basename(filePath) === 'copilot-instructions.md') ??
        files.find((filePath) => basename(filePath).endsWith('.instructions.md')) ??
        files.find((filePath) => basename(filePath) === 'SKILL.md') ??
        files[0] ??
        null
      );
    default:
      return (
        files.find((filePath) => basename(filePath) === 'SKILL.md') ??
        files.find((filePath) => basename(filePath) === 'README.md') ??
        files[0] ??
        null
      );
  }
}

export function getParentDir(filePath: string): string {
  return dirname(filePath);
}

function isAllowedFile(
  targetPath: string,
  extensions: string[],
  includeFileNames?: string[],
  includeFileNameSuffixes?: string[],
): boolean {
  const name = basename(targetPath);
  if (includeFileNames && !includeFileNames.includes(name)) {
    return false;
  }
  if (includeFileNameSuffixes && !includeFileNameSuffixes.some((suffix) => name.endsWith(suffix))) {
    return false;
  }

  if (name === '.cursorrules' || name === '.windsurfrules') {
    return true;
  }

  return extensions.includes(extname(targetPath).toLowerCase());
}

function collectNestedCopilotAgentInstructions(cwd: string, results: SkillFile[], seen: Set<string>): void {
  const copilotAdapter = getPlatformAdapter('copilot');
  if (!copilotAdapter) return;

  const definition: PlatformPathDefinition = {
    ...copilotAdapter,
    global: [],
    project: [],
  };

  for (const filePath of findNamedFiles(cwd, 'AGENTS.md')) {
    pushResult(filePath, 'AGENTS.md', definition, 'project', results, seen);
  }
}

const IGNORED_RECURSIVE_DIRS = new Set([
  '.git',
  '.hg',
  '.svn',
  'node_modules',
  'vendor',
  'dist',
  'build',
  'coverage',
]);

function findNamedFiles(root: string, fileName: string): string[] {
  if (!existsSync(root)) return [];

  const results: string[] = [];
  const visit = (dir: string) => {
    let entries: string[];
    try {
      entries = readdirSync(dir);
    } catch {
      return;
    }

    for (const entry of entries) {
      if (entry.startsWith('.') || IGNORED_RECURSIVE_DIRS.has(entry)) continue;
      const entryPath = join(dir, entry);
      let stats;
      try {
        stats = statSync(entryPath);
      } catch {
        continue;
      }
      if (stats.isDirectory()) {
        visit(entryPath);
      } else if (entry === fileName) {
        results.push(entryPath);
      }
    }
  };

  visit(root);
  return results;
}

function collectGeminiConfiguredContextFiles(
  cwd: string,
  homeDir: string,
  results: SkillFile[],
  seen: Set<string>,
): void {
  const contextFileNames = readGeminiContextFileNames(cwd, homeDir).filter((name) => name !== 'GEMINI.md');
  if (contextFileNames.length === 0) return;
  const geminiAdapter = getPlatformAdapter('gemini');
  if (!geminiAdapter) return;

  const definition: PlatformPathDefinition = {
    ...geminiAdapter,
    global: [],
    project: [],
  };

  for (const name of contextFileNames) {
    collectPath(join(homeDir, '.gemini', name), definition, { path: `~/.gemini/${name}`, mode: 'single-file' }, 'global', results, seen);
    collectPath(join(cwd, name), definition, { path: name, mode: 'single-file' }, 'project', results, seen);
  }
}

function readGeminiContextFileNames(cwd: string, homeDir: string): string[] {
  const names = new Set<string>(['GEMINI.md']);
  for (const settingsPath of [join(homeDir, '.gemini', 'settings.json'), join(cwd, '.gemini', 'settings.json')]) {
    if (!existsSync(settingsPath)) continue;
    try {
      const settings = JSON.parse(readFileSync(settingsPath, 'utf8')) as { contextFileName?: string | string[] };
      const configured = settings.contextFileName;
      if (typeof configured === 'string' && configured.trim()) {
        names.add(configured.trim());
      } else if (Array.isArray(configured)) {
        for (const name of configured) {
          if (typeof name === 'string' && name.trim()) names.add(name.trim());
        }
      }
    } catch {
      continue;
    }
  }
  return [...names];
}

function applyAgentOverridePrecedence(results: SkillFile[]): SkillFile[] {
  const overrideDirs = new Set(
    results
      .filter((entry) => entry.platform === 'codex' && basename(entry.filePath).toLowerCase() === 'agents.override.md')
      .map((entry) => `${entry.platform}|${entry.scope}|${dirname(entry.filePath)}`),
  );

  return results.filter((entry) => {
    if (entry.platform !== 'codex') return true;
    if (basename(entry.filePath).toLowerCase() !== 'agents.md') return true;
    return !overrideDirs.has(`${entry.platform}|${entry.scope}|${dirname(entry.filePath)}`);
  });
}

function expandGlob(pattern: string): string[] {
  const segments = pattern.split(sep);
  const globIdx = segments.findIndex((s) => s.includes('*'));

  if (globIdx === -1) return [pattern];

  const base = segments.slice(0, globIdx).join(sep) || sep;
  const globPart = segments[globIdx]!;
  const tail = segments.slice(globIdx + 1);

  if (!existsSync(base)) return [];

  let entries: string[];
  try {
    entries = readdirSync(base);
  } catch {
    return [];
  }

  const regex = new RegExp(
    '^' + globPart.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*') + '$',
  );

  const results: string[] = [];
  for (const entry of entries) {
    if (!regex.test(entry)) continue;
    const matched = join(base, entry);
    if (tail.length === 0) {
      results.push(matched);
    } else {
      const next = join(matched, ...tail);
      results.push(...(next.includes('*') ? expandGlob(next) : [next]));
    }
  }

  return results;
}
