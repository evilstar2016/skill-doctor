import { existsSync, readdirSync, statSync } from 'node:fs';
import { basename, dirname, extname, join } from 'node:path';
import { homedir } from 'node:os';

import type { Confidence, Platform, Scope, SkillFile } from '../types/skill';

interface PlatformPathDefinition {
  platform: Platform;
  confidence: Confidence;
  global: PathTarget[];
  project: PathTarget[];
  extensions: string[];
}

interface PathTarget {
  path: string;
  mode: 'recursive-dir' | 'single-file';
}

interface ResolvePathsOptions {
  homeDir?: string;
}

const PLATFORM_PATHS: PlatformPathDefinition[] = [
  {
    platform: 'claude',
    confidence: 'high',
    global: [{ path: '.claude/skills', mode: 'recursive-dir' }],
    project: [{ path: '.claude/skills', mode: 'recursive-dir' }],
    extensions: ['.md'],
  },
  {
    platform: 'cursor',
    confidence: 'high',
    global: [{ path: '.cursor/rules', mode: 'recursive-dir' }],
    project: [
      { path: '.cursor/rules', mode: 'recursive-dir' },
      { path: '.cursorrules', mode: 'single-file' },
    ],
    extensions: ['.md', '.mdc'],
  },
  {
    platform: 'copilot',
    confidence: 'high',
    global: [{ path: '.github/copilot', mode: 'recursive-dir' }],
    project: [
      { path: '.github/copilot-instructions.md', mode: 'single-file' },
      { path: '.github/instructions', mode: 'recursive-dir' },
    ],
    extensions: ['.md'],
  },
  {
    platform: 'codex',
    confidence: 'high',
    global: [{ path: '.codex/AGENTS.md', mode: 'single-file' }],
    project: [{ path: 'AGENTS.md', mode: 'single-file' }],
    extensions: ['.md'],
  },
  {
    platform: 'gemini',
    confidence: 'high',
    global: [{ path: '.gemini/skills', mode: 'recursive-dir' }],
    project: [
      { path: '.gemini/skills', mode: 'recursive-dir' },
      { path: 'GEMINI.md', mode: 'single-file' },
    ],
    extensions: ['.md'],
  },
  {
    platform: 'windsurf',
    confidence: 'high',
    global: [],
    project: [{ path: '.windsurfrules', mode: 'single-file' }],
    extensions: ['.md'],
  },
  {
    platform: 'trae',
    confidence: 'low',
    global: [{ path: '.trae/rules', mode: 'recursive-dir' }],
    project: [{ path: '.trae/rules', mode: 'recursive-dir' }],
    extensions: ['.md'],
  },
  {
    platform: 'opencode',
    confidence: 'low',
    global: [],
    project: [
      { path: 'AGENTS.md', mode: 'single-file' },
      { path: 'skills', mode: 'recursive-dir' },
    ],
    extensions: ['.md'],
  },
  {
    platform: 'kiro',
    confidence: 'high',
    global: [{ path: '.kiro/skills', mode: 'recursive-dir' }],
    project: [{ path: '.kiro/skills', mode: 'recursive-dir' }],
    extensions: ['.md'],
  },
];

export function resolvePaths(cwd: string, options: ResolvePathsOptions = {}): SkillFile[] {
  const homeDir = options.homeDir ?? homedir();
  const results: SkillFile[] = [];

  for (const definition of PLATFORM_PATHS) {
    for (const target of definition.global) {
      collectPath(join(homeDir, target.path), definition, target.mode, 'global', results);
    }

    for (const target of definition.project) {
      collectPath(join(cwd, target.path), definition, target.mode, 'project', results);
    }
  }

  return results;
}

function collectPath(
  targetPath: string,
  definition: PlatformPathDefinition,
  mode: PathTarget['mode'],
  scope: Scope,
  results: SkillFile[],
  depth = 0,
): void {
  if (!existsSync(targetPath)) {
    return;
  }

  const stats = statSync(targetPath);

  if (stats.isDirectory()) {
    if (mode !== 'recursive-dir') {
      return;
    }

    const children = readdirSync(targetPath);
    const matchingFiles: string[] = [];
    const subdirs: string[] = [];

    for (const child of children) {
      if (child.startsWith('.')) continue; // skip hidden entries (other platform dirs)
      const childPath = join(targetPath, child);
      let childStats;
      try {
        childStats = statSync(childPath);
      } catch {
        continue; // skip broken symlinks or unreadable entries
      }
      if (childStats.isDirectory()) {
        subdirs.push(childPath);
      } else if (isAllowedFile(childPath, definition.extensions)) {
        matchingFiles.push(childPath);
      }
    }

    if (depth === 0) {
      // Target root: collect all direct files + recurse into all non-hidden subdirs
      for (const f of matchingFiles) {
        results.push({ filePath: f, platform: definition.platform, scope, confidence: definition.confidence });
      }
      for (const subdir of subdirs) {
        collectPath(subdir, definition, mode, scope, results, depth + 1);
      }
    } else if (matchingFiles.length > 0) {
      // Has skill files → this IS the skill directory; pick primary, don't recurse into subdirs
      // (subdirs are support material: assets/, references/, hooks/, node_modules/, etc.)
      const primary = selectPrimaryFile(matchingFiles);
      if (primary) {
        results.push({ filePath: primary, platform: definition.platform, scope, confidence: definition.confidence });
      }
    } else {
      // No skill files → collection directory (e.g. skills/); recurse into non-hidden subdirs
      for (const subdir of subdirs) {
        collectPath(subdir, definition, mode, scope, results, depth + 1);
      }
    }

    return;
  }

  // Single-file mode: the target itself is the file
  if (!isAllowedFile(targetPath, definition.extensions)) {
    return;
  }

  results.push({
    filePath: targetPath,
    platform: definition.platform,
    scope,
    confidence: definition.confidence,
  });
}

function selectPrimaryFile(files: string[]): string | null {
  if (files.length === 0) return null;
  if (files.length === 1) return files[0];
  return (
    files.find((f) => basename(f) === 'SKILL.md') ??
    files.find((f) => basename(f) === 'README.md') ??
    [...files].sort((a, b) => basename(a).localeCompare(basename(b)))[0]
  );
}

export function getParentDir(filePath: string): string {
  return dirname(filePath);
}

function isAllowedFile(targetPath: string, extensions: string[]): boolean {
  if (basename(targetPath) === '.cursorrules') {
    return true;
  }

  return extensions.includes(extname(targetPath).toLowerCase());
}