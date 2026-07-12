import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

export interface EmbeddingUserConfig {
  baseUrl?: string;
  model?: string;
  apiKey?: string;
}

export interface AnalysisUserConfig {
  baseUrl?: string;
  model?: string;
  apiKey?: string;
  timeoutMs?: number;
}

export interface IgnoreUserConfig {
  skillNames?: string[];
  conflictPairs?: [string, string][];
}

export interface PathsUserConfig {
  extra?: string[];
}

export type ScanSourceResource = 'skill' | 'mcp' | 'plugin';

export interface ScanSourceUserEntry {
  id: string;
  scope: 'global' | 'project';
  path: string;
  enabled?: boolean;
  format?: 'json' | 'toml';
  mode?: 'recursive-dir' | 'single-file';
  layout?: 'files' | 'skill-dirs';
  skillsField?: string;
  defaultSkillsDir?: string;
  costOnly?: boolean;
}

export interface AgentScanSourcesUserConfig {
  skills?: ScanSourceUserEntry[];
  mcp?: ScanSourceUserEntry[];
  plugins?: ScanSourceUserEntry[];
}

export interface SkillDoctorUserConfig {
  embedding?: EmbeddingUserConfig;
  analysis?: AnalysisUserConfig;
  ignore?: IgnoreUserConfig;
  paths?: PathsUserConfig;
  scanSources?: Record<string, AgentScanSourcesUserConfig>;
}

export interface LoadedUserConfig {
  config: SkillDoctorUserConfig;
  path: string;
}

export function loadUserConfig(homeDir: string = resolveHomeDir()): LoadedUserConfig {
  const path = getDefaultUserConfigPath(homeDir);

  if (!existsSync(path)) {
    return {
      config: {},
      path,
    };
  }

  try {
    const parsed = JSON.parse(readFileSync(path, 'utf-8')) as Record<string, unknown>;
    return {
      config: normalizeUserConfig(parsed),
      path,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to read skill-doctor config "${path}". ${message}`);
  }
}

export function getDefaultUserConfigPath(homeDir: string = resolveHomeDir()): string {
  return join(homeDir, '.skill-doctor', 'config.json');
}

function normalizeUserConfig(value: Record<string, unknown>): SkillDoctorUserConfig {
  const embedding = readObject(value.embedding);
  const analysis = readObject(value.analysis);
  const ignore = readObject(value.ignore);
  const paths = readObject(value.paths);
  const scanSources = readObject(value.scanSources);

  return {
    ...(embedding
      ? {
          embedding: {
            baseUrl: readString(embedding.baseUrl),
            model: readString(embedding.model),
            apiKey: readString(embedding.apiKey),
          },
        }
      : {}),
    ...(analysis
      ? {
          analysis: {
            baseUrl: readString(analysis.baseUrl),
            model: readString(analysis.model),
            apiKey: readString(analysis.apiKey),
            timeoutMs: readPositiveInt(analysis.timeoutMs),
          },
        }
      : {}),
    ...(ignore ? { ignore: normalizeIgnoreConfig(ignore) } : {}),
    ...(paths ? { paths: normalizePathsConfig(paths) } : {}),
    ...(scanSources ? { scanSources: normalizeScanSourcesConfig(scanSources) } : {}),
  };
}

export function saveUserConfig(config: SkillDoctorUserConfig, homeDir: string = resolveHomeDir()): string {
  const path = getDefaultUserConfigPath(homeDir);
  mkdirSync(join(homeDir, '.skill-doctor'), { recursive: true });
  const temporaryPath = `${path}.tmp-${process.pid}-${Date.now()}`;
  writeFileSync(temporaryPath, `${JSON.stringify(config, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 });
  renameSync(temporaryPath, path);
  return path;
}

function normalizeIgnoreConfig(value: Record<string, unknown>): IgnoreUserConfig {
  const skillNames = Array.isArray(value.skillNames)
    ? value.skillNames.filter((x): x is string => typeof x === 'string')
    : undefined;

  const conflictPairs = Array.isArray(value.conflictPairs)
    ? value.conflictPairs.filter(
        (x): x is [string, string] =>
          Array.isArray(x) && x.length === 2 && typeof x[0] === 'string' && typeof x[1] === 'string',
      )
    : undefined;

  return {
    ...(skillNames ? { skillNames } : {}),
    ...(conflictPairs ? { conflictPairs } : {}),
  };
}

function normalizePathsConfig(value: Record<string, unknown>): PathsUserConfig {
  const extra = Array.isArray(value.extra)
    ? value.extra.filter((x): x is string => typeof x === 'string' && x.trim().length > 0)
    : undefined;

  return {
    ...(extra ? { extra } : {}),
  };
}

function normalizeScanSourcesConfig(value: Record<string, unknown>): Record<string, AgentScanSourcesUserConfig> {
  const result: Record<string, AgentScanSourcesUserConfig> = {};
  for (const [platform, rawAgent] of Object.entries(value)) {
    const agent = readObject(rawAgent);
    if (!agent) continue;
    const normalized: AgentScanSourcesUserConfig = {};
    const skills = normalizeScanSourceEntries(agent.skills, 'skill');
    const mcp = normalizeScanSourceEntries(agent.mcp, 'mcp');
    const plugins = normalizeScanSourceEntries(agent.plugins, 'plugin');
    if (skills) normalized.skills = skills;
    if (mcp) normalized.mcp = mcp;
    if (plugins) normalized.plugins = plugins;
    result[platform] = normalized;
  }
  return result;
}

function normalizeScanSourceEntries(value: unknown, resource: ScanSourceResource): ScanSourceUserEntry[] | undefined {
  if (!Array.isArray(value)) return undefined;
  return value.flatMap((raw, index) => {
    const entry = readObject(raw);
    if (!entry) return [];
    const path = readString(entry.path);
    if (!path) return [];
    const scope = entry.scope === 'project' ? 'project' : entry.scope === 'global' ? 'global' : null;
    if (!scope) return [];
    const id = readString(entry.id) ?? `user-${resource}-${index}`;
    const format = entry.format === 'toml' ? 'toml' : entry.format === 'json' ? 'json' : undefined;
    const mode = entry.mode === 'single-file' ? 'single-file' : entry.mode === 'recursive-dir' ? 'recursive-dir' : undefined;
    const layout = entry.layout === 'files' ? 'files' : entry.layout === 'skill-dirs' ? 'skill-dirs' : undefined;
    return [{
      id,
      scope,
      path,
      ...(typeof entry.enabled === 'boolean' ? { enabled: entry.enabled } : {}),
      ...(format ? { format } : {}),
      ...(mode ? { mode } : {}),
      ...(layout ? { layout } : {}),
      ...(readString(entry.skillsField) ? { skillsField: readString(entry.skillsField) } : {}),
      ...(readString(entry.defaultSkillsDir) ? { defaultSkillsDir: readString(entry.defaultSkillsDir) } : {}),
      ...(typeof entry.costOnly === 'boolean' ? { costOnly: entry.costOnly } : {}),
    }];
  });
}

function readObject(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function readString(value: unknown): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }

  const normalized = value.trim();
  return normalized ? normalized : undefined;
}

function readPositiveInt(value: unknown): number | undefined {
  if (typeof value !== 'number' || !Number.isInteger(value) || value <= 0) {
    return undefined;
  }
  return value;
}

function resolveHomeDir(): string {
  return process.env.HOME || process.env.USERPROFILE || homedir();
}
