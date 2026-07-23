import { afterEach, describe, expect, it, vi } from 'vitest';

import { modelConfigView, validateModelConfig, withModelConfig } from '../../src/config/modelConfig';
import { testOpenAiCompatibleModel } from '../../src/models/testOpenAiCompatible';

describe('model configuration', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('validates standard cloud and local OpenAI-compatible model settings', () => {
    expect(validateModelConfig({
      analysis: { baseUrl: 'https://api.openai.com/v1/', model: 'gpt-4.1-mini', apiKey: 'secret', timeoutMs: 20_000 },
      embedding: { baseUrl: 'http://127.0.0.1:11434/v1', model: 'nomic-embed-text' },
    })).toMatchObject({
      analysis: { baseUrl: 'https://api.openai.com/v1', model: 'gpt-4.1-mini', apiKey: 'secret', timeoutMs: 20_000 },
      embedding: { baseUrl: 'http://127.0.0.1:11434/v1', model: 'nomic-embed-text' },
    });
  });

  it('preserves a saved key when the UI updates non-secret fields', () => {
    const next = validateModelConfig({
      analysis: { baseUrl: 'https://api.example.test/v1', model: 'next-model' },
      embedding: null,
    });

    expect(withModelConfig({ analysis: { baseUrl: 'https://api.example.test/v1', model: 'old-model', apiKey: 'saved-key' } }, next)).toEqual({
      analysis: { baseUrl: 'https://api.example.test/v1', model: 'next-model', apiKey: 'saved-key' },
    });
  });

  it('never exposes saved api keys in the model configuration view', () => {
    expect(modelConfigView({
      analysis: { baseUrl: 'https://api.example.test/v1', model: 'model', apiKey: 'saved-key' },
    })).toEqual({
      analysis: { baseUrl: 'https://api.example.test/v1', model: 'model', timeoutMs: undefined, apiKeyConfigured: true },
    });
  });

  it('rejects incomplete and non-http model service settings', () => {
    expect(() => validateModelConfig({ analysis: { baseUrl: 'file:///tmp/model', model: 'model' } })).toThrow('http(s) URL');
    expect(() => validateModelConfig({ embedding: { baseUrl: 'http://127.0.0.1:11434/v1' } })).toThrow('embedding.model is required');
  });

  it('sends OpenAI-compatible analysis and embedding test requests', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ choices: [{ message: { content: 'OK' } }] }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ data: [{ embedding: [0.1] }] }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(testOpenAiCompatibleModel('analysis', { baseUrl: 'https://api.example.test/v1', model: 'chat-model', apiKey: 'secret' })).resolves.toEqual({ message: 'Analysis model is reachable.' });
    await expect(testOpenAiCompatibleModel('embedding', { baseUrl: 'http://127.0.0.1:11434/v1', model: 'embed-model' })).resolves.toEqual({ message: 'Embedding model is reachable.' });

    expect(fetchMock).toHaveBeenNthCalledWith(1, 'https://api.example.test/v1/chat/completions', expect.objectContaining({
      headers: expect.objectContaining({ Authorization: 'Bearer secret' }),
    }));
    expect(fetchMock).toHaveBeenNthCalledWith(2, 'http://127.0.0.1:11434/v1/embeddings', expect.any(Object));
  });
});
