import { existsSync, readdirSync, statSync } from 'node:fs';
import { basename, dirname, extname, join, normalize, sep } from 'node:path';
import { homedir } from 'node:os';

import type { Confidence, Platform, Scope, SkillFile } from '../types/skill';

export interface PlatformPathDefinition {
  platform: Platform;
  confidence: Confidence;
  global: PathTarget[];
  project: PathTarget[];
  extensions: string[];
}

export interface PathTarget {
  path: string;
  mode: 'recursive-dir' | 'single-file';
  layout?: 'files' | 'skill-dirs';
}

interface ResolvePathsOptions {
  homeDir?: string;
  appDataDir?: string;
  extraPaths?: string[];
}

export const PLATFORM_PATHS: PlatformPathDefinition[] = [
  {
    platform: 'claude',
    confidence: 'high',
    global: [{ path: '~/.claude/skills', mode: 'recursive-dir', layout: 'skill-dirs' }],
    project: [{ path: '.claude/skills', mode: 'recursive-dir', layout: 'skill-dirs' }],
    extensions: ['.md'],
  },
  {
    platform: 'cursor',
    confidence: 'high',
    global: [{ path: '~/.cursor/rules', mode: 'recursive-dir', layout: 'files' }],
    project: [
      { path: '.cursor/rules', mode: 'recursive-dir', layout: 'files' },
      { path: '.cursorrules', mode: 'single-file' },
    ],
    extensions: ['.md', '.mdc'],
  },
  {
    platform: 'copilot',
    confidence: 'high',
    global: [{ path: '~/.copilot/skills', mode: 'recursive-dir', layout: 'skill-dirs' }],
    project: [
      { path: '.github/copilot-instructions.md', mode: 'single-file' },
      { path: '.github/instructions', mode: 'recursive-dir', layout: 'files' },
    ],
    extensions: ['.md'],
  },
  {
    platform: 'codex',
    confidence: 'high',
    global: [
      { path: '~/.codex/AGENTS.md', mode: 'single-file' },
      { path: '~/.codex/skills', mode: 'recursive-dir', layout: 'skill-dirs' },
      { path: '~/.agent/skills', mode: 'recursive-dir', layout: 'skill-dirs' },
    ],
    project: [
      { path: 'AGENTS.md', mode: 'single-file' },
      { path: '.codex/AGENTS.md', mode: 'single-file' },
      { path: '.codex/skills', mode: 'recursive-dir', layout: 'skill-dirs' },
      { path: '.agent/skills', mode: 'recursive-dir', layout: 'skill-dirs' },
    ],
    extensions: ['.md'],
  },
  {
    platform: 'gemini',
    confidence: 'high',
    global: [{ path: '~/.gemini/skills', mode: 'recursive-dir', layout: 'skill-dirs' }],
    project: [
      { path: '.gemini/skills', mode: 'recursive-dir', layout: 'skill-dirs' },
      { path: 'GEMINI.md', mode: 'single-file' },
    ],
    extensions: ['.md'],
  },
  {
    platform: 'windsurf',
    confidence: 'high',
    global: [{ path: '~/.codeium/windsurf/skills', mode: 'recursive-dir', layout: 'skill-dirs' }],
    project: [{ path: '.windsurfrules', mode: 'single-file' }],
    extensions: ['.md'],
  },
  {
    platform: 'trae',
    confidence: 'low',
    global: [{ path: '~/.trae/skills', mode: 'recursive-dir', layout: 'skill-dirs' }],
    project: [{ path: '.trae/skills', mode: 'recursive-dir', layout: 'skill-dirs' }],
    extensions: ['.md'],
  },
  {
    platform: 'opencode',
    confidence: 'low',
    global: [
      { path: '~/.config/opencode/skills', mode: 'recursive-dir', layout: 'skill-dirs' },
      { path: '%APPDATA%/opencode/skills', mode: 'recursive-dir', layout: 'skill-dirs' },
    ],
    project: [
      { path: 'AGENTS.md', mode: 'single-file' },
      { path: 'skills', mode: 'recursive-dir', layout: 'skill-dirs' },
    ],
    extensions: ['.md'],
  },
  {
    platform: 'kiro',
    confidence: 'high',
    global: [{ path: '~/.kiro/skills', mode: 'recursive-dir', layout: 'skill-dirs' }],
    project: [{ path: '.kiro/skills', mode: 'recursive-dir', layout: 'skill-dirs' }],
    extensions: ['.md'],
  },
  {
    platform: 'openclaw',
    confidence: 'high',
    global: [{ path: '~/.openclaw/skills', mode: 'recursive-dir', layout: 'skill-dirs' }],
    project: [],
    extensions: ['.md'],
  },
  {
    platform: 'hermes',
    confidence: 'high',
    global: [{ path: '~/.config/hermes/skills', mode: 'recursive-dir', layout: 'skill-dirs' }],
    project: [],
    extensions: ['.md'],
  },
];

export function resolvePaths(cwd: string, options: ResolvePathsOptions = {}): SkillFile[] {
  const homeDir = options.homeDir ?? homedir();
  const appDataDir = options.appDataDir ?? join(homeDir, 'AppData', 'Roaming');
  const results: SkillFile[] = [];
  const seen = new Set<string>();

  for (const definition of PLATFORM_PATHS) {
    for (const target of definition.global) {
      collectPath(
        resolveGlobalPath(target.path, homeDir, appDataDir),
        definition,
        target,
        'global',
        results,
        seen,
      );
    }

    for (const target of definition.project) {
      collectPath(join(cwd, target.path), definition, target, 'project', results, seen);
    }
  }

  for (const raw of options.extraPaths ?? []) {
    const resolved = normalize(raw.startsWith('~') ? join(homeDir, raw.slice(2)) : raw);
    const expanded = resolved.includes('*') ? expandGlob(resolved) : [resolved];
    const definition: PlatformPathDefinition = {
      platform: 'unknown',
      confidence: 'low',
      global: [],
      project: [],
      extensions: ['.md'],
    };
    for (const expandedPath of expanded) {
      collectPath(expandedPath, definition, { path: expandedPath, mode: 'recursive-dir', layout: 'skill-dirs' }, 'global', results, seen);
    }
  }

  return results;
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
      } else if (isAllowedFile(childPath, definition.extensions)) {
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

  if (!isAllowedFile(targetPath, definition.extensions)) {
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

function resolveGlobalPath(pathTemplate: string, homeDir: string, appDataDir: string): string {
  return normalize(
    pathTemplate
      .replace(/^~(?=[/\\]|$)/, homeDir)
      .replace(/%USERPROFILE%/gi, homeDir)
      .replace(/%APPDATA%/gi, appDataDir),
  );
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

function isAllowedFile(targetPath: string, extensions: string[]): boolean {
  const name = basename(targetPath);
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
