import { existsSync, readdirSync, statSync } from 'node:fs';
import { basename, dirname, extname, join, sep } from 'node:path';
import { homedir } from 'node:os';

import type { Scope, SkillFile } from '../types/skill';
import type { EffectiveScanSource } from '../config/scanSources';
import { createPlatformRuntime } from '../platforms/runtime';
import {
  UNKNOWN_PLATFORM_ADAPTER,
  getPlatformAdapter,
  getPlatformAdapters,
  resolveCustomPath,
  resolvePlatformPathTemplate,
  type PathTarget,
  type PlatformPathDefinition,
} from '../platforms/registry';

export type { PathTarget, PlatformPathDefinition } from '../platforms/registry';

interface ResolvePathsOptions {
  homeDir?: string;
  appDataDir?: string;
  extraPaths?: string[];
  includeCostPaths?: boolean;
  sources?: EffectiveScanSource[];
}

export function resolvePaths(cwd: string, options: ResolvePathsOptions = {}): SkillFile[] {
  const homeDir = options.homeDir ?? homedir();
  const appDataDir = options.appDataDir ?? join(homeDir, 'AppData', 'Roaming');
  const results: SkillFile[] = [];
  const seen = new Set<string>();
  const adapters = getPlatformAdapters();
  const runtimes = adapters.map((adapter) => createPlatformRuntime(adapter, {
    projectDir: cwd,
    homeDir,
    appDataDir,
  }));

  if (options.sources) {
    for (const source of options.sources.filter((entry) => entry.resource === 'skill' && entry.enabled)) {
      if (source.costOnly && !options.includeCostPaths) continue;
      const definition = getPlatformAdapter(source.platform) ?? UNKNOWN_PLATFORM_ADAPTER;
      collectPath(source.resolvedPath, definition, {
        path: source.path,
        mode: source.mode ?? 'recursive-dir',
        layout: source.layout ?? 'skill-dirs',
      }, source.scope, results, seen);
    }
  } else {
    for (const definition of adapters) {
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
  }

  if (options.includeCostPaths) {
    for (const runtime of runtimes) {
      for (const candidate of runtime.discoverAdditionalInstructions()) {
        collectPath(
          candidate.filePath,
          runtime.adapter,
          { path: candidate.installSource, mode: 'single-file' },
          candidate.scope,
          results,
          seen,
        );
      }
    }
  }

  for (const raw of options.extraPaths ?? []) {
    const resolved = resolveCustomPath(raw, homeDir);
    const expanded = resolved.includes('*') ? expandGlob(resolved) : [resolved];
    for (const expandedPath of expanded) {
      collectPath(expandedPath, UNKNOWN_PLATFORM_ADAPTER, { path: expandedPath, mode: 'recursive-dir', layout: 'skill-dirs' }, 'global', results, seen);
    }
  }

  return runtimes.reduce(
    (files, runtime) => runtime.postProcessInstructions(files),
    results,
  );
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
      const primary = selectPrimaryFile(matchingFiles);
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

function selectPrimaryFile(files: string[]): string | null {
  if (files.length === 0) return null;

  const sorted = [...files].sort((a, b) => basename(a).localeCompare(basename(b)));
  return sorted.find((filePath) => basename(filePath) === 'SKILL.md') ?? null;
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
