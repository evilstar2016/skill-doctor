import { existsSync, readFileSync } from 'node:fs';
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

export interface SkillDoctorUserConfig {
  embedding?: EmbeddingUserConfig;
  analysis?: AnalysisUserConfig;
  ignore?: IgnoreUserConfig;
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
  };
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
