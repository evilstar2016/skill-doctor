import { describe, expect, it, vi } from 'vitest';

import {
  createEmbeddingProvider,
  type FetchLike,
} from '../../../src/conflicts/semantic/embeddingProvider';

describe('createEmbeddingProvider', () => {
  it('calls an OpenAI-compatible embeddings endpoint with configured auth and model', async () => {
    const fetchImpl = vi.fn<FetchLike>().mockResolvedValue({
      ok: true,
      status: 200,
      statusText: 'OK',
      json: async () => ({
        data: [{ embedding: [0.1, 0.2, 0.3] }],
      }),
      text: async () => '',
    });

    const provider = createEmbeddingProvider({
      baseUrl: 'http://127.0.0.1:3000/v1/',
      modelId: 'bge-m3',
      apiKey: 'secret',
      fetchImpl,
    });

    await expect(provider.embed('release workflow')).resolves.toEqual([0.1, 0.2, 0.3]);
    expect(provider.cacheKey).toBe('http://127.0.0.1:3000/v1::bge-m3');
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(fetchImpl).toHaveBeenCalledWith(
      'http://127.0.0.1:3000/v1/embeddings',
      expect.objectContaining({
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: 'Bearer secret',
        },
      }),
    );
    expect(JSON.parse(fetchImpl.mock.calls[0]![1].body)).toEqual({
      model: 'bge-m3',
      input: 'release workflow',
    });
  });

  it('surfaces API response errors with status and body details', async () => {
    const provider = createEmbeddingProvider({
      baseUrl: 'http://127.0.0.1:3000/v1',
      modelId: 'bge-m3',
      fetchImpl: async () => ({
        ok: false,
        status: 401,
        statusText: 'Unauthorized',
        json: async () => ({ error: { message: 'bad api key' } }),
        text: async () => JSON.stringify({ error: { message: 'bad api key' } }),
      }),
    });

    await expect(provider.embed('abc')).rejects.toThrow(
      'Embedding API request failed for model "bge-m3" at "http://127.0.0.1:3000/v1/embeddings". 401 Unauthorized: bad api key',
    );
  });

  it('surfaces actionable network errors', async () => {
    const provider = createEmbeddingProvider({
      baseUrl: 'http://127.0.0.1:3000/v1',
      modelId: 'bge-m3',
      fetchImpl: async () => {
        const error = new Error('fetch failed');
        error.cause = new Error('connect ECONNREFUSED');
        throw error;
      },
    });

    await expect(provider.embed('abc')).rejects.toThrow(
      'Failed to call embedding API for model "bge-m3" at "http://127.0.0.1:3000/v1/embeddings". fetch failed -> connect ECONNREFUSED',
    );
  });
});
