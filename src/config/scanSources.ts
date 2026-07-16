import { accessSync, constants, existsSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { isAbsolute, join, normalize } from 'node:path';
import { zhMessage } from '../i18n';

import {
  getPlatformAdapters,
  resolvePlatformPathTemplate,
  type PlatformAdapter,
  type PlatformRuntimeContext,
} from '../platforms/registry';
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
  config?: SkillDoctorUserConfig;
}

export function loadEffectiveScanSources(projectDir: string, options: LoadScanSourcesOptions = {}): EffectiveScanSource[] {
  const homeDir = options.homeDir ?? homedir();
  const appDataDir = options.appDataDir ?? join(homeDir, 'AppData', 'Roaming');
  const runtimeContext = { projectDir, homeDir, appDataDir };
  const user = options.config ? (options.config.scanSources ?? {}) : (loadUserConfig(homeDir).config.scanSources ?? {});
  const defaults = builtinSources(runtimeContext);
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
        const resolvedPath = resolveSourcePath(entry.path, entry.scope, adapter, runtimeContext);
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
  if (!isObject(value)) throw new Error(zhMessage('validation.scanSourcesObject'));
  const supported = new Set(getPlatformAdapters().map((adapter) => adapter.platform));
  const result: Record<string, AgentScanSourcesUserConfig> = {};
  for (const [platform, rawAgent] of Object.entries(value)) {
    if (!supported.has(platform as Platform)) throw new Error(zhMessage('validation.unsupportedAgent', { platform }));
    if (!isObject(rawAgent)) throw new Error(zhMessage('validation.agentObject', { platform }));
    const unknownKey = Object.keys(rawAgent).find((key) => !['skills', 'mcp', 'plugins'].includes(key));
    if (unknownKey) throw new Error(zhMessage('validation.unsupportedResource', { platform, resource: unknownKey }));
    const agent: AgentScanSourcesUserConfig = {};
    for (const [key, resource] of [['skills', 'skill'], ['mcp', 'mcp'], ['plugins', 'plugin']] as const) {
      const rawEntries = rawAgent[key];
      if (rawEntries === undefined) continue;
      if (!Array.isArray(rawEntries)) throw new Error(zhMessage('validation.entriesArray', { path: `${platform}.${key}` }));
      const ids = new Set<string>();
      const entries = rawEntries.map((raw, index) => validateEntry(raw, platform, resource, index));
      for (const entry of entries) {
        if (ids.has(entry.id)) throw new Error(zhMessage('validation.duplicateId', { path: `${platform}.${key}`, id: entry.id }));
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

function builtinSources(context: PlatformRuntimeContext): Array<Omit<EffectiveScanSource, 'resolvedPath' | 'status'>> {
  return getPlatformAdapters().flatMap((adapter) => {
    const configured = adapter.getBuiltinScanSources?.(context);
    if (configured) return configured;

    const skills = [
      ...adapter.global.map((target, index) => fromSkillTarget(adapter.platform, 'global', target, index)),
      ...adapter.project.map((target, index) => fromSkillTarget(adapter.platform, 'project', target, index)),
    ];
    const mcp = adapter.mcpConfigFiles.map((entry, index) => ({
      id: builtinId(adapter.platform, 'mcp', entry.scope, index),
      platform: adapter.platform,
      resource: 'mcp' as const,
      scope: entry.scope,
      path: entry.path,
      format: entry.format,
      enabled: true,
      origin: 'builtin' as const,
    }));
    return [...skills, ...mcp];
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

function resolveSourcePath(
  rawPath: string,
  scope: Scope,
  adapter: PlatformAdapter,
  context: PlatformRuntimeContext,
): string {
  const resolved = adapter.resolveScanSourcePath?.({ path: rawPath, scope }, context);
  if (resolved) return normalize(resolved);

  const expanded = resolvePlatformPathTemplate(rawPath, context.homeDir, context.appDataDir);
  return normalize(isAbsolute(expanded) ? expanded : join(scope === 'project' ? context.projectDir : context.homeDir, expanded));
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
  const entryPath = `${platform}.${resource}[${index}]`;
  if (!isObject(value)) throw new Error(zhMessage('validation.entryObject', { path: entryPath }));
  const id = stringValue(value.id);
  const path = stringValue(value.path);
  if (!id) throw new Error(zhMessage('validation.missingId', { path: entryPath }));
  if (!path) throw new Error(zhMessage('validation.missingPath', { path: entryPath }));
  if (value.scope !== 'global' && value.scope !== 'project') throw new Error(zhMessage('validation.invalidScope', { path: entryPath }));
  if (resource === 'mcp' && value.format !== 'json' && value.format !== 'toml') throw new Error(zhMessage('validation.invalidMcpFormat', { path: entryPath }));
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
