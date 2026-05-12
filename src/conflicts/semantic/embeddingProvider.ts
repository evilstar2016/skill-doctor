import type { ConflictEmbeddingProvider } from '../../types/skill';

export interface FetchResponseLike {
  ok: boolean;
  status: number;
  statusText: string;
  json(): Promise<unknown>;
  text(): Promise<string>;
}

export interface FetchRequestLike {
  method: 'POST';
  headers: Record<string, string>;
  body: string;
}

export type FetchLike = (
  input: string,
  init: FetchRequestLike,
) => Promise<FetchResponseLike>;

export interface EmbeddingProviderOptions {
  baseUrl?: string;
  modelId?: string;
  apiKey?: string;
  fetchImpl?: FetchLike;
}

export function createEmbeddingProvider(
  options: EmbeddingProviderOptions = {},
): ConflictEmbeddingProvider {
  const baseUrl = readRequiredValue(options.baseUrl, 'embedding.baseUrl');
  const modelId = readRequiredValue(options.modelId, 'embedding.model');
  const apiKey = readOptionalValue(options.apiKey);
  const endpoint = `${stripTrailingSlash(baseUrl)}/embeddings`;
  const fetchImpl = options.fetchImpl ?? defaultFetch;

  return {
    modelId,
    cacheKey: `${stripTrailingSlash(baseUrl)}::${modelId}`,
    async embed(text: string): Promise<number[]> {
      const request: FetchRequestLike = {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          ...(apiKey ? { authorization: `Bearer ${apiKey}` } : {}),
        },
        body: JSON.stringify({
          model: modelId,
          input: text,
        }),
      };

      let response: FetchResponseLike;
      try {
        response = await fetchImpl(endpoint, request);
      } catch (error) {
        throw new Error(
          `Failed to call embedding API for model "${modelId}" at "${endpoint}". ${collectErrorMessages(error).join(' -> ')}`,
        );
      }

      if (!response.ok) {
        throw await buildEmbeddingResponseError(modelId, endpoint, response);
      }

      const payload = await response.json();
      const embedding = readEmbedding(payload);

      if (!embedding) {
        throw new Error(
          `Embedding API "${endpoint}" returned an invalid response for model "${modelId}".`,
        );
      }

      return embedding;
    },
  };
}

const defaultFetch: FetchLike = async (input, init) => {
  const response = await fetch(input, init);
  return response as FetchResponseLike;
};

async function buildEmbeddingResponseError(
  modelId: string,
  endpoint: string,
  response: FetchResponseLike,
): Promise<Error> {
  const body = await response.text();
  const apiMessage = readApiErrorMessage(body);
  const details = `${response.status} ${response.statusText}${apiMessage ? `: ${apiMessage}` : ''}`;

  return new Error(
    `Embedding API request failed for model "${modelId}" at "${endpoint}". ${details}`,
  );
}

function readEmbedding(payload: unknown): number[] | null {
  if (!payload || typeof payload !== 'object' || !('data' in payload) || !Array.isArray(payload.data)) {
    return null;
  }

  const first = payload.data[0];
  if (!first || typeof first !== 'object' || !('embedding' in first) || !Array.isArray(first.embedding)) {
    return null;
  }

  return first.embedding.every((value) => typeof value === 'number')
    ? [...first.embedding]
    : null;
}

function readApiErrorMessage(body: string): string | null {
  if (!body.trim()) {
    return null;
  }

  try {
    const parsed = JSON.parse(body) as Record<string, unknown>;
    const error = parsed.error;

    if (error && typeof error === 'object' && 'message' in error && typeof error.message === 'string') {
      return error.message;
    }
  } catch {
    return body.trim();
  }

  return body.trim() || null;
}

function collectErrorMessages(error: unknown): string[] {
  const messages: string[] = [];
  let current: unknown = error;

  while (current instanceof Error) {
    messages.push(current.message);
    current = 'cause' in current ? current.cause : undefined;
  }

  return messages.length > 0 ? messages : ['Unknown embedding API error'];
}

function readRequiredValue(value: string | undefined, field: string): string {
  const normalized = readOptionalValue(value);

  if (!normalized) {
    throw new Error(`Missing required embedding config field: ${field}`);
  }

  return normalized;
}

function readOptionalValue(value: string | undefined): string | undefined {
  const normalized = value?.trim();
  return normalized ? normalized : undefined;
}

function stripTrailingSlash(value: string): string {
  return value.replace(/\/+$/, '');
}
