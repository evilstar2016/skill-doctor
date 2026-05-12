/**
 * Threshold calibration tests.
 *
 * These tests use mock embeddings to simulate the expected behavior of a real
 * embedding model. The mock vectors are chosen to represent the semantic
 * distance we'd expect for each fixture pair, allowing the threshold logic
 * to be verified independently of any live API.
 *
 * When running against a real model, verify:
 *   npx skill-doctor conflicts --strategy token --json
 *   npx skill-doctor conflicts --strategy embedding --json
 * and compare false positive rates.
 */

import { describe, expect, it } from 'vitest';
import { detectEmbeddingConflicts } from '../../../src/conflicts/semantic/detectEmbeddingConflicts';
import { buildSemanticText } from '../../../src/conflicts/semantic/buildSemanticText';
import type { ConflictEmbeddingCache, ConflictEmbeddingProvider } from '../../../src/types/skill';
import {
  ADJACENT_PAIR_RELEASE_VS_REVIEW,
  POSITIVE_PAIR_RELEASE,
} from './fixtures';

function createCacheWithVectors(
  entries: [string, number[]][],
): ConflictEmbeddingCache {
  const map = new Map(entries);
  return {
    get: (text) => map.get(text) ?? null,
    set: () => {},
  };
}

const DEAD_PROVIDER: ConflictEmbeddingProvider = {
  modelId: 'test',
  embed: async () => {
    throw new Error('provider should not be called — all embeddings are cached');
  },
};

describe('threshold calibration fixtures', () => {
  describe('POSITIVE_PAIR_RELEASE — semantically similar, different tokens', () => {
    it('detects as conflict at default threshold (0.82)', async () => {
      const textA = buildSemanticText(POSITIVE_PAIR_RELEASE.a);
      const textB = buildSemanticText(POSITIVE_PAIR_RELEASE.b);

      // Simulate high cosine similarity: nearly parallel vectors
      const cache = createCacheWithVectors([
        [textA, [0.92, 0.38, 0.07]],
        [textB, [0.90, 0.42, 0.09]],
      ]);

      const pairs = await detectEmbeddingConflicts(
        [POSITIVE_PAIR_RELEASE.a, POSITIVE_PAIR_RELEASE.b],
        { provider: DEAD_PROVIDER, cache, threshold: 0.82 },
      );

      expect(pairs).toHaveLength(1);
      expect(pairs[0]?.kind).toBe('conflict');
      expect(pairs[0]?.similarity).toBeGreaterThanOrEqual(0.82);
    });
  });

  describe('ADJACENT_PAIR_RELEASE_VS_REVIEW — related but distinct purposes', () => {
    it('does NOT detect as conflict at default threshold (0.82)', async () => {
      const textA = buildSemanticText(ADJACENT_PAIR_RELEASE_VS_REVIEW.a);
      const textB = buildSemanticText(ADJACENT_PAIR_RELEASE_VS_REVIEW.b);

      // Simulate moderate cosine similarity: related but distinct angle
      const cache = createCacheWithVectors([
        [textA, [0.92, 0.38, 0.07]],
        [textB, [0.40, 0.90, 0.15]],
      ]);

      const pairs = await detectEmbeddingConflicts(
        [ADJACENT_PAIR_RELEASE_VS_REVIEW.a, ADJACENT_PAIR_RELEASE_VS_REVIEW.b],
        { provider: DEAD_PROVIDER, cache, threshold: 0.82 },
      );

      expect(pairs).toHaveLength(0);
    });
  });
});
