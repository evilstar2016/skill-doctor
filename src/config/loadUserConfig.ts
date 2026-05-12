import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

export interface EmbeddingUserConfig {
  baseUrl?: string;
  model?: string;
  apiKey?: string;
}

export interface SkillDoctorUserConfig {
  embedding?: EmbeddingUserConfig;
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

  return embedding
    ? {
        embedding: {
          baseUrl: readString(embedding.baseUrl),
          model: readString(embedding.model),
          apiKey: readString(embedding.apiKey),
        },
      }
    : {};
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

function resolveHomeDir(): string {
  return process.env.HOME || process.env.USERPROFILE || homedir();
}
