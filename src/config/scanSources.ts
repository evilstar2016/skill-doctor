import { accessSync, constants, existsSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { isAbsolute, join, normalize } from 'node:path';

import { loadCodexContextConfig, resolveCodexPath } from '../context/codexContextConfig';
import { getPlatformAdapters, resolvePlatformPathTemplate } from '../platforms/registry';
import type { Platform, Scope } from '../types/skill';
import {
  loadUserConfig,
  type AgentScanSourcesUserConfig,
  type ScanSourceResource,
  type ScanSourceUserEntry,
  type SkillDoctorUserConfig,
} from './loadUserConfig';

export type ScanSourceOrigin = 'builtin' | 'user' | 'override';
export type ScanSourceStatus = 'exists' | 'missing' | 'unreadable' | 'invalid';

export interface EffectiveScanSource extends ScanSourceUserEntry {
  platform: Platform;
  resource: ScanSourceResource;
  resolvedPath: string;
  origin: ScanSourceOrigin;
  status: ScanSourceStatus;
  enabled: boolean;
}

export interface LoadScanSourcesOptions {
  homeDir?: string;
  appDataDir?: string;
}

export function loadEffectiveScanSources(projectDir: string, options: LoadScanSourcesOptions = {}): EffectiveScanSource[] {
  const homeDir = options.homeDir ?? homedir();
  const appDataDir = options.appDataDir ?? join(homeDir, 'AppData', 'Roaming');
  const user = loadUserConfig(homeDir).config.scanSources ?? {};
  const defaults = builtinSources(homeDir);
  const results: EffectiveScanSource[] = [];

  for (const adapter of getPlatformAdapters()) {
    const platform = adapter.platform;
    const configured = user[platform] ?? {};
    for (const resource of ['skill', 'mcp', 'plugin'] as const) {
      const base = defaults.filter((entry) => entry.platform === platform && entry.resource === resource);
      const overrides = entriesFor(configured, resource);
      const byId = new Map(base.map((entry) => [entry.id, { ...entry }]));
      for (const override of overrides) {
        const existing = byId.get(override.id);
        byId.set(override.id, {
          ...(existing ?? defaultEntry(platform, resource, override)),
          ...override,
          origin: existing ? 'override' : 'user',
        });
      }
      for (const entry of byId.values()) {
        const resolvedPath = resolveSourcePath(entry.path, entry.scope, projectDir, homeDir, appDataDir, platform);
        results.push({
          ...entry,
          enabled: entry.enabled !== false,
          resolvedPath,
          status: inspectSource(resolvedPath, resource, entry.mode),
        });
      }
    }
  }
  return results;
}

export function validateScanSourcesConfig(value: unknown): Record<string, AgentScanSourcesUserConfig> {
  if (!isObject(value)) throw new Error('scanSources 必须是对象。');
  const supported = new Set(getPlatformAdapters().map((adapter) => adapter.platform));
  const result: Record<string, AgentScanSourcesUserConfig> = {};
  for (const [platform, rawAgent] of Object.entries(value)) {
    if (!supported.has(platform as Platform)) throw new Error(`不支持的 Agent: ${platform}`);
    if (!isObject(rawAgent)) throw new Error(`${platform} 配置必须是对象。`);
    const unknownKey = Object.keys(rawAgent).find((key) => !['skills', 'mcp', 'plugins'].includes(key));
    if (unknownKey) throw new Error(`${platform} 包含不支持的资源类型: ${unknownKey}`);
    const agent: AgentScanSourcesUserConfig = {};
    for (const [key, resource] of [['skills', 'skill'], ['mcp', 'mcp'], ['plugins', 'plugin']] as const) {
      const rawEntries = rawAgent[key];
      if (rawEntries === undefined) continue;
      if (!Array.isArray(rawEntries)) throw new Error(`${platform}.${key} 必须是数组。`);
      const ids = new Set<string>();
      const entries = rawEntries.map((raw, index) => validateEntry(raw, platform, resource, index));
      for (const entry of entries) {
        if (ids.has(entry.id)) throw new Error(`${platform}.${key} 存在重复 id: ${entry.id}`);
        ids.add(entry.id);
      }
      agent[key] = entries;
    }
    result[platform] = agent;
  }
  return result;
}

export function withScanSources(config: SkillDoctorUserConfig, scanSources: Record<string, AgentScanSourcesUserConfig>): SkillDoctorUserConfig {
  return { ...config, scanSources };
}

function builtinSources(homeDir: string): Array<Omit<EffectiveScanSource, 'resolvedPath' | 'status'>> {
  const codex = loadCodexContextConfig({ homeDir }).config;
  return getPlatformAdapters().flatMap((adapter) => {
    const skills = adapter.platform === 'codex'
      ? codex.skillDirs.map((entry) => ({
          id: entry.id, platform: adapter.platform, resource: 'skill' as const, scope: entry.scope,
          path: entry.path, enabled: entry.enabled !== false, mode: 'recursive-dir' as const, layout: 'skill-dirs' as const,
          origin: (entry.configSource?.startsWith('builtin:') ? 'builtin' : 'override') as ScanSourceOrigin,
        }))
      : [...adapter.global.map((target, index) => fromSkillTarget(adapter.platform, 'global', target, index)),
          ...adapter.project.map((target, index) => fromSkillTarget(adapter.platform, 'project', target, index))];
    const mcp = adapter.platform === 'codex'
      ? codex.mcpConfigFiles.map((entry) => ({
          id: entry.id, platform: adapter.platform, resource: 'mcp' as const, scope: entry.scope,
          path: entry.path, enabled: entry.enabled !== false, format: entry.format,
          origin: (entry.configSource?.startsWith('builtin:') ? 'builtin' : 'override') as ScanSourceOrigin,
        }))
      : adapter.mcpConfigFiles.map((entry, index) => ({
          id: builtinId(adapter.platform, 'mcp', entry.scope, index), platform: adapter.platform,
          resource: 'mcp' as const, scope: entry.scope, path: entry.path, format: entry.format,
          enabled: true, origin: 'builtin' as const,
        }));
    const plugins = adapter.platform === 'codex' ? codex.pluginDirs.map((entry) => ({
      id: entry.id, platform: adapter.platform, resource: 'plugin' as const, scope: entry.scope,
      path: entry.manifestGlob, enabled: entry.enabled !== false, skillsField: entry.skillsField,
      defaultSkillsDir: entry.defaultSkillsDir,
      origin: (entry.configSource?.startsWith('builtin:') ? 'builtin' : 'override') as ScanSourceOrigin,
    })) : [];
    return [...skills, ...mcp, ...plugins];
  });
}

function fromSkillTarget(platform: Platform, scope: Scope, target: { path: string; mode: 'recursive-dir' | 'single-file'; layout?: 'files' | 'skill-dirs'; costOnly?: boolean }, index: number) {
  return {
    id: builtinId(platform, 'skill', scope, index), platform, resource: 'skill' as const, scope,
    path: target.path, mode: target.mode, layout: target.layout, costOnly: target.costOnly, enabled: true, origin: 'builtin' as const,
  };
}

function defaultEntry(platform: Platform, resource: ScanSourceResource, entry: ScanSourceUserEntry) {
  return { ...entry, platform, resource, origin: 'user' as const, enabled: entry.enabled !== false };
}

function entriesFor(config: AgentScanSourcesUserConfig, resource: ScanSourceResource): ScanSourceUserEntry[] {
  return resource === 'skill' ? config.skills ?? [] : resource === 'mcp' ? config.mcp ?? [] : config.plugins ?? [];
}

function resolveSourcePath(rawPath: string, scope: Scope, projectDir: string, homeDir: string, appDataDir: string, platform: Platform): string {
  if (platform === 'codex') return resolveCodexPath(rawPath, projectDir, homeDir);
  const expanded = resolvePlatformPathTemplate(rawPath, homeDir, appDataDir);
  return normalize(isAbsolute(expanded) ? expanded : join(scope === 'project' ? projectDir : homeDir, expanded));
}

function inspectSource(path: string, resource: ScanSourceResource, mode?: ScanSourceUserEntry['mode']): ScanSourceStatus {
  if (resource === 'plugin' && path.includes('*')) {
    const prefix = path.slice(0, path.indexOf('*'));
    return existsSync(prefix || '/') ? 'exists' : 'missing';
  }
  if (!existsSync(path)) return 'missing';
  try {
    accessSync(path, constants.R_OK);
    const stats = statSync(path);
    if (mode === 'recursive-dir' && !stats.isDirectory()) return 'invalid';
    if (mode === 'single-file' && !stats.isFile()) return 'invalid';
    return 'exists';
  } catch {
    return 'unreadable';
  }
}

function validateEntry(value: unknown, platform: string, resource: ScanSourceResource, index: number): ScanSourceUserEntry {
  if (!isObject(value)) throw new Error(`${platform}.${resource}[${index}] 必须是对象。`);
  const id = stringValue(value.id);
  const path = stringValue(value.path);
  if (!id) throw new Error(`${platform}.${resource}[${index}] 缺少 id。`);
  if (!path) throw new Error(`${platform}.${resource}[${index}] 缺少路径。`);
  if (value.scope !== 'global' && value.scope !== 'project') throw new Error(`${platform}.${resource}[${index}] scope 无效。`);
  if (resource === 'mcp' && value.format !== 'json' && value.format !== 'toml') throw new Error(`${platform}.${resource}[${index}] MCP format 必须是 json 或 toml。`);
  return {
    id, path, scope: value.scope,
    ...(typeof value.enabled === 'boolean' ? { enabled: value.enabled } : {}),
    ...(value.format === 'json' || value.format === 'toml' ? { format: value.format } : {}),
    ...(value.mode === 'recursive-dir' || value.mode === 'single-file' ? { mode: value.mode } : {}),
    ...(value.layout === 'files' || value.layout === 'skill-dirs' ? { layout: value.layout } : {}),
    ...(stringValue(value.skillsField) ? { skillsField: stringValue(value.skillsField) } : {}),
    ...(stringValue(value.defaultSkillsDir) ? { defaultSkillsDir: stringValue(value.defaultSkillsDir) } : {}),
    ...(typeof value.costOnly === 'boolean' ? { costOnly: value.costOnly } : {}),
  };
}

function builtinId(platform: Platform, resource: ScanSourceResource, scope: Scope, index: number): string {
  return `builtin-${platform}-${resource}-${scope}-${index}`;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}
