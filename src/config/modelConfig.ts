import type { AnalysisUserConfig, EmbeddingUserConfig, SkillDoctorUserConfig } from './loadUserConfig';

export type ModelServiceKind = 'analysis' | 'embedding';

export interface ModelServiceInput {
  baseUrl?: unknown;
  model?: unknown;
  apiKey?: unknown;
  clearApiKey?: unknown;
  timeoutMs?: unknown;
}

export interface ModelConfigInput {
  analysis?: ModelServiceInput | null;
  embedding?: ModelServiceInput | null;
}

export interface ModelConfigView {
  analysis?: Omit<AnalysisUserConfig, 'apiKey'> & { apiKeyConfigured: boolean };
  embedding?: Omit<EmbeddingUserConfig, 'apiKey'> & { apiKeyConfigured: boolean };
}

export function validateModelConfig(input: unknown): { analysis?: AnalysisUserConfig; embedding?: EmbeddingUserConfig; clearAnalysisApiKey: boolean; clearEmbeddingApiKey: boolean } {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new Error('Model configuration must be an object.');
  }
  const value = input as ModelConfigInput;
  const analysis = value.analysis === null ? undefined : readService(value.analysis, 'analysis', true);
  const embedding = value.embedding === null ? undefined : readService(value.embedding, 'embedding', false);
  return {
    ...(analysis ? { analysis: analysis.config } : {}),
    ...(embedding ? { embedding: embedding.config } : {}),
    clearAnalysisApiKey: analysis?.clearApiKey === true,
    clearEmbeddingApiKey: embedding?.clearApiKey === true,
  };
}

export function withModelConfig(
  current: SkillDoctorUserConfig,
  next: ReturnType<typeof validateModelConfig>,
): SkillDoctorUserConfig {
  const config = { ...current };
  if (next.analysis) {
    config.analysis = mergeApiKey(current.analysis, next.analysis, next.clearAnalysisApiKey);
  } else {
    delete config.analysis;
  }
  if (next.embedding) {
    config.embedding = mergeApiKey(current.embedding, next.embedding, next.clearEmbeddingApiKey);
  } else {
    delete config.embedding;
  }
  return config;
}

export function modelConfigView(config: SkillDoctorUserConfig): ModelConfigView {
  return {
    ...(config.analysis ? {
      analysis: {
        baseUrl: config.analysis.baseUrl,
        model: config.analysis.model,
        timeoutMs: config.analysis.timeoutMs,
        apiKeyConfigured: Boolean(config.analysis.apiKey),
      },
    } : {}),
    ...(config.embedding ? {
      embedding: {
        baseUrl: config.embedding.baseUrl,
        model: config.embedding.model,
        apiKeyConfigured: Boolean(config.embedding.apiKey),
      },
    } : {}),
  };
}

function readService(value: ModelServiceInput | null | undefined, name: string, supportsTimeout: boolean): { config: AnalysisUserConfig | EmbeddingUserConfig; clearApiKey: boolean } | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== 'object' || Array.isArray(value)) throw new Error(`${name} must be an object.`);
  const baseUrl = readRequiredHttpUrl(value.baseUrl, `${name}.baseUrl`);
  const model = readRequiredString(value.model, `${name}.model`);
  const apiKey = readOptionalString(value.apiKey, `${name}.apiKey`);
  const clearApiKey = value.clearApiKey === true;
  const timeoutMs = supportsTimeout ? readOptionalPositiveInt(value.timeoutMs, `${name}.timeoutMs`) : undefined;
  return {
    config: {
      baseUrl,
      model,
      ...(apiKey ? { apiKey } : {}),
      ...(timeoutMs ? { timeoutMs } : {}),
    },
    clearApiKey,
  };
}

function mergeApiKey<T extends { apiKey?: string }>(current: T | undefined, next: T, clearApiKey: boolean): T {
  if (next.apiKey || clearApiKey || !current?.apiKey) return next;
  return { ...next, apiKey: current.apiKey };
}

function readRequiredHttpUrl(value: unknown, field: string): string {
  const text = readRequiredString(value, field);
  let url: URL;
  try {
    url = new URL(text);
  } catch {
    throw new Error(`${field} must be an http(s) URL.`);
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new Error(`${field} must be an http(s) URL.`);
  return text.replace(/\/$/, '');
}

function readRequiredString(value: unknown, field: string): string {
  const text = readOptionalString(value, field);
  if (!text) throw new Error(`${field} is required.`);
  return text;
}

function readOptionalString(value: unknown, field: string): string | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  if (typeof value !== 'string') throw new Error(`${field} must be a string.`);
  const text = value.trim();
  return text || undefined;
}

function readOptionalPositiveInt(value: unknown, field: string): number | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  if (typeof value !== 'number' || !Number.isInteger(value) || value <= 0) {
    throw new Error(`${field} must be a positive integer.`);
  }
  return value;
}
