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
): void {
  if (!existsSync(targetPath)) {
    return;
  }

  const stats = statSync(targetPath);

  if (stats.isDirectory()) {
    if (mode !== 'recursive-dir') {
      return;
    }

    for (const child of readdirSync(targetPath)) {
      collectPath(join(targetPath, child), definition, mode, scope, results);
    }
    return;
  }

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

export function getParentDir(filePath: string): string {
  return dirname(filePath);
}

function isAllowedFile(targetPath: string, extensions: string[]): boolean {
  if (basename(targetPath) === '.cursorrules') {
    return true;
  }

  return extensions.includes(extname(targetPath).toLowerCase());
}