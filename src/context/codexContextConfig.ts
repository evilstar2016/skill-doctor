import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, normalize, resolve, sep } from 'node:path';

import builtinConfig from '../platforms/codex-config.json';
import type { Scope } from '../types/skill';

export type CodexResourceFilter = 'all' | 'agents' | 'skill' | 'mcp' | 'plugin' | 'memory';

export interface CodexContextConfig {
  version: number;
  officialLimits: {
    projectDocMaxBytes: number;
    skillListMaxCharsWhenUnknown: number;
  };
  agentsFiles: CodexPathEntry[];
  skillDirs: CodexPathEntry[];
  pluginDirs: CodexPluginDirEntry[];
  mcpConfigFiles: CodexMcpConfigEntry[];
  memoryLocations: CodexPathEntry[];
  controls: {
    projectConfigPath: string;
    skills: { method: string };
    mcp: { method: string };
    plugin: { method: string };
  };
}

export interface CodexPathEntry {
  id: string;
  scope: Scope;
  path: string;
  priority?: number;
  enabled?: boolean;
  configSource?: string;
}

export interface CodexPluginDirEntry {
  id: string;
  scope: Scope;
  manifestGlob: string;
  skillsField?: string;
  defaultSkillsDir?: string;
  enabled?: boolean;
  configSource?: string;
}

export interface CodexMcpConfigEntry {
  id: string;
  scope: Scope;
  path: string;
  format: 'toml';
  enabled?: boolean;
  configSource?: string;
}

export interface LoadCodexContextConfigOptions {
  homeDir?: string;
  projectDir?: string;
  configPath?: string;
}

export interface LoadedCodexContextConfig {
  config: CodexContextConfig;
  sources: string[];
}

export function loadCodexContextConfig(options: LoadCodexContextConfigOptions = {}): LoadedCodexContextConfig {
  const homeDir = options.homeDir ?? resolveHomeDir();
  const sources = ['builtin:src/platforms/codex-config.json'];
  let config = stampConfigSource(validateConfig(builtinConfig), sources[0]);

  const userConfigPath = join(homeDir, '.skill-doctor', 'codex-config.json');
  if (existsSync(userConfigPath)) {
    const userConfig = readConfigFile(userConfigPath);
    config = mergeConfig(config, stampConfigSource(userConfig, userConfigPath));
    sources.push(userConfigPath);
  }

  if (options.configPath) {
    const cliPath = resolve(options.projectDir ?? process.cwd(), options.configPath);
    const cliConfig = readConfigFile(cliPath);
    config = mergeConfig(config, stampConfigSource(cliConfig, cliPath));
    sources.push(cliPath);
  }

  return { config, sources };
}

export function resolveCodexPath(rawPath: string, projectDir: string, homeDir: string = resolveHomeDir()): string {
  const codexHome = process.env.CODEX_HOME?.trim();
  if (codexHome && (rawPath === '~/.codex' || rawPath.startsWith('~/.codex/'))) {
    return normalize(join(codexHome, rawPath.slice('~/.codex'.length)));
  }
  const expanded = rawPath
    .replace(/^~(?=[/\\]|$)/, homeDir)
    .replace(/%USERPROFILE%/gi, homeDir);
  return normalize(expanded.startsWith('/') ? expanded : join(projectDir, expanded));
}

export function expandCodexGlob(rawPattern: string, projectDir: string, homeDir: string = resolveHomeDir()): string[] {
  const pattern = resolveCodexPath(rawPattern, projectDir, homeDir);
  if (!pattern.includes('*')) return existsSync(pattern) ? [pattern] : [];
  return expandGlob(pattern);
}

function readConfigFile(path: string): CodexContextConfig {
  try {
    return validateConfig(JSON.parse(readFileSync(path, 'utf8')));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to read Codex context config "${path}". ${message}`);
  }
}

function validateConfig(value: unknown): CodexContextConfig {
  if (!isObject(value)) {
    throw new Error('Config must be a JSON object.');
  }

  const officialLimits = isObject(value.officialLimits) ? value.officialLimits : {};
  const controls = isObject(value.controls) ? value.controls : {};

  return {
    version: positiveInt(value.version) ?? 1,
    officialLimits: {
      projectDocMaxBytes: positiveInt(officialLimits.projectDocMaxBytes) ?? 32 * 1024,
      skillListMaxCharsWhenUnknown: positiveInt(officialLimits.skillListMaxCharsWhenUnknown) ?? 8000,
    },
    agentsFiles: readPathEntries(value.agentsFiles),
    skillDirs: readPathEntries(value.skillDirs),
    pluginDirs: readPluginDirEntries(value.pluginDirs),
    mcpConfigFiles: readMcpConfigEntries(value.mcpConfigFiles),
    memoryLocations: readPathEntries(value.memoryLocations),
    controls: {
      projectConfigPath: stringValue(controls.projectConfigPath) ?? '.codex/config.toml',
      skills: { method: readNestedMethod(controls.skills, 'skills.config') },
      mcp: { method: readNestedMethod(controls.mcp, 'mcp_servers.<id>.enabled') },
      plugin: { method: readNestedMethod(controls.plugin, 'plugins.<id>.enabled') },
    },
  };
}

function mergeConfig(base: CodexContextConfig, overlay: CodexContextConfig): CodexContextConfig {
  return {
    version: overlay.version ?? base.version,
    officialLimits: { ...base.officialLimits, ...overlay.officialLimits },
    agentsFiles: mergeById(base.agentsFiles, overlay.agentsFiles),
    skillDirs: mergeById(base.skillDirs, overlay.skillDirs),
    pluginDirs: mergeById(base.pluginDirs, overlay.pluginDirs),
    mcpConfigFiles: mergeById(base.mcpConfigFiles, overlay.mcpConfigFiles),
    memoryLocations: mergeById(base.memoryLocations, overlay.memoryLocations),
    controls: {
      projectConfigPath: overlay.controls.projectConfigPath ?? base.controls.projectConfigPath,
      skills: { method: overlay.controls.skills.method ?? base.controls.skills.method },
      mcp: { method: overlay.controls.mcp.method ?? base.controls.mcp.method },
      plugin: { method: overlay.controls.plugin.method ?? base.controls.plugin.method },
    },
  };
}

function mergeById<T extends { id: string }>(base: T[], overlay: T[]): T[] {
  const result = [...base];
  const indexes = new Map(result.map((entry, index) => [entry.id, index]));

  for (const entry of overlay) {
    const index = indexes.get(entry.id);
    if (index === undefined) {
      indexes.set(entry.id, result.length);
      result.push(entry);
    } else {
      result[index] = { ...result[index], ...entry };
    }
  }

  return result;
}

function stampConfigSource<T extends CodexContextConfig>(config: T, source: string): T {
  return {
    ...config,
    agentsFiles: config.agentsFiles.map((entry) => ({ ...entry, configSource: entry.configSource ?? source })),
    skillDirs: config.skillDirs.map((entry) => ({ ...entry, configSource: entry.configSource ?? source })),
    pluginDirs: config.pluginDirs.map((entry) => ({ ...entry, configSource: entry.configSource ?? source })),
    mcpConfigFiles: config.mcpConfigFiles.map((entry) => ({ ...entry, configSource: entry.configSource ?? source })),
    memoryLocations: config.memoryLocations.map((entry) => ({ ...entry, configSource: entry.configSource ?? source })),
  };
}

function readPathEntries(value: unknown): CodexPathEntry[] {
  if (!Array.isArray(value)) return [];
  return value.map((entry, index) => {
    if (!isObject(entry)) throw new Error(`Invalid path entry at index ${index}.`);
    const id = stringValue(entry.id) ?? `entry-${index}`;
    const scope = readScope(entry.scope);
    const path = stringValue(entry.path);
    if (!path) throw new Error(`Path entry "${id}" is missing path.`);
    return {
      id,
      scope,
      path,
      ...(positiveInt(entry.priority) !== undefined ? { priority: positiveInt(entry.priority) } : {}),
      ...(typeof entry.enabled === 'boolean' ? { enabled: entry.enabled } : {}),
    };
  });
}

function readPluginDirEntries(value: unknown): CodexPluginDirEntry[] {
  if (!Array.isArray(value)) return [];
  return value.map((entry, index) => {
    if (!isObject(entry)) throw new Error(`Invalid plugin entry at index ${index}.`);
    const id = stringValue(entry.id) ?? `plugin-${index}`;
    const manifestGlob = stringValue(entry.manifestGlob);
    if (!manifestGlob) throw new Error(`Plugin entry "${id}" is missing manifestGlob.`);
    return {
      id,
      scope: readScope(entry.scope),
      manifestGlob,
      ...(stringValue(entry.skillsField) ? { skillsField: stringValue(entry.skillsField) } : {}),
      ...(stringValue(entry.defaultSkillsDir) ? { defaultSkillsDir: stringValue(entry.defaultSkillsDir) } : {}),
      ...(typeof entry.enabled === 'boolean' ? { enabled: entry.enabled } : {}),
    };
  });
}

function readMcpConfigEntries(value: unknown): CodexMcpConfigEntry[] {
  if (!Array.isArray(value)) return [];
  return value.map((entry, index) => {
    if (!isObject(entry)) throw new Error(`Invalid MCP config entry at index ${index}.`);
    const id = stringValue(entry.id) ?? `mcp-${index}`;
    const path = stringValue(entry.path);
    if (!path) throw new Error(`MCP config entry "${id}" is missing path.`);
    return {
      id,
      scope: readScope(entry.scope),
      path,
      format: 'toml',
      ...(typeof entry.enabled === 'boolean' ? { enabled: entry.enabled } : {}),
    };
  });
}

function readScope(value: unknown): Scope {
  return value === 'global' || value === 'project' ? value : 'project';
}

function readNestedMethod(value: unknown, fallback: string): string {
  return isObject(value) ? stringValue(value.method) ?? fallback : fallback;
}

function positiveInt(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isInteger(value) && value > 0 ? value : undefined;
}

function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function resolveHomeDir(): string {
  return process.env.HOME || process.env.USERPROFILE || homedir();
}

function expandGlob(pattern: string): string[] {
  const segments = pattern.split(sep);
  const globIdx = segments.findIndex((segment) => segment.includes('*'));
  if (globIdx === -1) return existsSync(pattern) ? [pattern] : [];

  const base = segments.slice(0, globIdx).join(sep) || sep;
  const globPart = segments[globIdx];
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
      continue;
    }

    const next = join(matched, ...tail);
    results.push(...expandGlob(next));
  }

  return results.filter((path) => {
    try {
      const stats = statSync(path);
      return stats.isFile() || stats.isDirectory();
    } catch {
      return false;
    }
  });
}

export function getCodexProjectConfigPath(projectDir: string, config: CodexContextConfig): string {
  return resolve(projectDir, config.controls.projectConfigPath);
}

export function getCodexConfigParentDir(projectDir: string, config: CodexContextConfig): string {
  return dirname(getCodexProjectConfigPath(projectDir, config));
}
