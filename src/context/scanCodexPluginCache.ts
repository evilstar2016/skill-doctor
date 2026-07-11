import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { basename, dirname, join, relative, resolve } from 'node:path';

import type {
  CodexCachedPlugin,
  CodexCachedPluginUiEntry,
  CodexPluginCacheCatalog,
} from '../types/context';

export interface ScanCodexPluginCacheOptions {
  homeDir?: string;
  cacheRoot?: string;
}

const MAX_MANIFEST_DEPTH = 6;
const MAX_SKILL_DEPTH = 8;
const IGNORED_DIRS = new Set(['.git', 'node_modules', 'vendor', 'dist', 'build', 'coverage']);

export function scanCodexPluginCache(
  options: ScanCodexPluginCacheOptions = {},
): CodexPluginCacheCatalog {
  const cacheRoot = options.cacheRoot ?? resolveCacheRoot(options.homeDir);
  const plugins = findNamedFiles(cacheRoot, 'plugin.json', MAX_MANIFEST_DEPTH)
    .filter((path) => basename(dirname(path)) === '.codex-plugin')
    .map((manifestPath) => readCachedPlugin(cacheRoot, manifestPath))
    .filter((plugin): plugin is CodexCachedPlugin => plugin !== null)
    .sort((left, right) => left.displayName.localeCompare(right.displayName)
      || left.version?.localeCompare(right.version ?? '')
      || left.cacheSource.localeCompare(right.cacheSource));
  const uiEntries = plugins.reduce((sum, plugin) => sum + plugin.entries.length, 0);
  const explicitOnlyEntries = plugins.reduce(
    (sum, plugin) => sum + plugin.entries.filter((entry) => entry.invocation === 'explicit-only').length,
    0,
  );

  return {
    cacheRoot,
    status: 'cached',
    countedInContextCost: false,
    summary: {
      plugins: plugins.length,
      uiEntries,
      explicitOnlyEntries,
    },
    plugins,
  };
}

function readCachedPlugin(cacheRoot: string, manifestPath: string): CodexCachedPlugin | null {
  const manifest = readJsonObject(manifestPath);
  if (!manifest) return null;

  const pluginRoot = dirname(dirname(manifestPath));
  const name = stringValue(manifest.name) ?? basename(pluginRoot);
  const version = stringValue(manifest.version);
  const ui = objectValue(manifest.interface);
  const displayName = stringValue(ui?.displayName) ?? name;
  const description = stringValue(ui?.shortDescription)
    ?? stringValue(manifest.description)
    ?? '';
  const icon = stringValue(ui?.composerIcon) ?? stringValue(ui?.logo);
  const skillsDir = resolve(pluginRoot, stringValue(manifest.skills) ?? 'skills');
  const entries = findNamedFiles(skillsDir, 'openai.yaml', MAX_SKILL_DEPTH)
    .filter((path) => basename(dirname(path)) === 'agents')
    .map((path) => readUiEntry(name, path))
    .filter((entry): entry is CodexCachedPluginUiEntry => entry !== null)
    .sort((left, right) => left.displayName.localeCompare(right.displayName));
  const cacheSource = firstRelativeSegment(cacheRoot, manifestPath);

  return {
    id: `${cacheSource}:${name}${version ? `@${version}` : ''}`,
    name,
    displayName,
    description,
    ...(version ? { version } : {}),
    cacheSource,
    manifestPath,
    ...(icon ? { iconPath: resolve(pluginRoot, icon) } : {}),
    status: 'cached',
    countedInContextCost: false,
    entries,
  };
}

function readUiEntry(pluginName: string, sourcePath: string): CodexCachedPluginUiEntry | null {
  const raw = readText(sourcePath);
  if (!raw) return null;

  const skillDir = dirname(dirname(sourcePath));
  const skillName = readSkillName(join(skillDir, 'SKILL.md')) ?? basename(skillDir);
  const displayName = yamlScalar(raw, 'display_name') ?? skillName;
  const description = yamlScalar(raw, 'short_description') ?? '';
  const icon = yamlScalar(raw, 'icon_large') ?? yamlScalar(raw, 'icon_small');
  const defaultPrompt = yamlScalar(raw, 'default_prompt');
  const implicit = yamlBoolean(raw, 'allow_implicit_invocation');

  return {
    id: `${pluginName}:${skillName}`,
    skillName,
    displayName,
    description,
    sourcePath,
    ...(icon ? { iconPath: resolve(skillDir, icon) } : {}),
    ...(defaultPrompt ? { defaultPrompt } : {}),
    invocation: implicit === true ? 'implicit' : implicit === false ? 'explicit-only' : 'unknown',
    status: 'cached',
    countedInContextCost: false,
  };
}

function findNamedFiles(root: string, fileName: string, maxDepth: number): string[] {
  if (!existsSync(root)) return [];
  const results: string[] = [];

  const visit = (dir: string, depth: number) => {
    if (depth > maxDepth) return;
    let entries: string[];
    try {
      entries = readdirSync(dir);
    } catch {
      return;
    }

    for (const entry of entries) {
      if (IGNORED_DIRS.has(entry)) continue;
      const path = join(dir, entry);
      let stats;
      try {
        stats = statSync(path);
      } catch {
        continue;
      }
      if (stats.isDirectory()) {
        visit(path, depth + 1);
      } else if (entry === fileName) {
        results.push(path);
      }
    }
  };

  visit(root, 0);
  return results.sort();
}

function readSkillName(path: string): string | undefined {
  const raw = readText(path);
  if (!raw) return undefined;
  const frontmatter = raw.match(/^---\s*\r?\n([\s\S]*?)\r?\n---(?:\s*\r?\n|$)/)?.[1];
  return frontmatter ? yamlScalar(frontmatter, 'name') : undefined;
}

function yamlScalar(raw: string, key: string): string | undefined {
  const match = raw.match(new RegExp(`^\\s*${escapeRegex(key)}\\s*:\\s*(.*?)\\s*$`, 'm'));
  const value = match?.[1]?.trim();
  if (!value || value === 'null' || value === '~') return undefined;
  if (value.startsWith('"') && value.endsWith('"')) {
    try {
      return JSON.parse(value) as string;
    } catch {
      return value.slice(1, -1);
    }
  }
  if (value.startsWith("'") && value.endsWith("'")) {
    return value.slice(1, -1).replace(/''/g, "'");
  }
  return value.replace(/\s+#.*$/, '').trim();
}

function yamlBoolean(raw: string, key: string): boolean | undefined {
  const value = yamlScalar(raw, key)?.toLowerCase();
  if (value === 'true') return true;
  if (value === 'false') return false;
  return undefined;
}

function resolveCacheRoot(homeDir?: string): string {
  const codexHome = process.env.CODEX_HOME?.trim();
  return join(codexHome || homeDir || process.env.HOME || process.env.USERPROFILE || homedir(), codexHome ? 'plugins/cache' : '.codex/plugins/cache');
}

function firstRelativeSegment(root: string, path: string): string {
  const first = relative(root, path).split(/[\\/]/)[0];
  return first || 'unknown';
}

function readJsonObject(path: string): Record<string, unknown> | null {
  const raw = readText(path);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as unknown;
    return objectValue(parsed) ?? null;
  } catch {
    return null;
  }
}

function readText(path: string): string | null {
  try {
    return readFileSync(path, 'utf8');
  } catch {
    return null;
  }
}

function objectValue(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;
}

function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
