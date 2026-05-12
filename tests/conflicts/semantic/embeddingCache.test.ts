import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { createEmbeddingCache } from '../../../src/conflicts/semantic/embeddingCache';

describe('createEmbeddingCache', () => {
  it('returns null on cache miss and round-trips stored embeddings', () => {
    const cacheDir = mkdtempSync(join(tmpdir(), 'skill-doctor-cache-'));
    const cache = createEmbeddingCache({
      modelId: 'local-model',
      cacheDir,
    });

    expect(cache.get('semantic text')).toBeNull();

    cache.set('semantic text', [0.1, 0.2, 0.3]);

    expect(cache.get('semantic text')).toEqual([0.1, 0.2, 0.3]);
  });

  it('isolates entries by model id', () => {
    const cacheDir = mkdtempSync(join(tmpdir(), 'skill-doctor-cache-'));
    const left = createEmbeddingCache({
      modelId: 'model-a',
      cacheDir,
    });
    const right = createEmbeddingCache({
      modelId: 'model-b',
      cacheDir,
    });

    left.set('same text', [1, 2, 3]);

    expect(right.get('same text')).toBeNull();
  });
});
