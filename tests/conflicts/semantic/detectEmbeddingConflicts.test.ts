import { describe, expect, it, vi } from 'vitest';

import { buildSemanticText } from '../../../src/conflicts/semantic/buildSemanticText';
import { detectEmbeddingConflicts } from '../../../src/conflicts/semantic/detectEmbeddingConflicts';
import type {
  ConflictEmbeddingCache,
  ConflictEmbeddingProvider,
  SkillRecord,
} from '../../../src/types/skill';

function makeSkill(overrides: Partial<SkillRecord> = {}): SkillRecord {
  return {
    name: 'Release Workflow',
    sourcePath: 'E:/skills/release/SKILL.md',
    platform: 'claude',
    scope: 'project',
    description: 'Prepare release planning and commit summary.',
    triggers: ['open release branch'],
    ...overrides,
  };
}

function createMemoryCache(): ConflictEmbeddingCache {
  const entries = new Map<string, number[]>();

  return {
    get(text: string): number[] | null {
      return entries.get(text) ?? null;
    },
    set(text: string, embedding: readonly number[]): void {
      entries.set(text, [...embedding]);
    },
  };
}

describe('detectEmbeddingConflicts', () => {
  it('returns duplicate pairs without invoking the embedding provider', async () => {
    const left = makeSkill({
      name: 'Git Workflow',
      sourcePath: 'E:/skills/project/Git-Workflow/SKILL.md',
    });
    const right = makeSkill({
      name: 'Git Workflow',
      sourcePath: 'E:/skills/global/Git-Workflow/SKILL.md',
    });
    const embed = vi.fn(async () => [1, 0]);
    const provider: ConflictEmbeddingProvider = {
      modelId: 'test-model',
      embed,
    };

    const pairs = await detectEmbeddingConflicts([left, right], {
      provider,
      cache: createMemoryCache(),
    });

    expect(pairs).toHaveLength(1);
    expect(pairs[0]?.kind).toBe('duplicate');
    expect(pairs[0]?.detectionMethod).toBe('duplicate-name');
    expect(embed).not.toHaveBeenCalled();
  });

  it('uses cached embeddings to report semantic conflicts', async () => {
    const left = makeSkill();
    const right = makeSkill({
      name: 'Deploy Workflow',
      sourcePath: 'E:/skills/deploy/SKILL.md',
      description: 'Coordinate release planning and commit summary.',
      triggers: ['open release branch'],
    });
    const cache = createMemoryCache();
    const provider: ConflictEmbeddingProvider = {
      modelId: 'test-model',
      embed: vi.fn(async () => {
        throw new Error('provider should not run on cache hit');
      }),
    };

    cache.set(buildSemanticText(left), [1, 0]);
    cache.set(buildSemanticText(right), [0.99, 0.01]);

    const pairs = await detectEmbeddingConflicts([left, right], {
      provider,
      cache,
      threshold: 0.8,
    });

    expect(pairs).toHaveLength(1);
    expect(pairs[0]?.kind).toBe('conflict');
    expect(pairs[0]?.detectionMethod).toBe('embedding');
    expect(pairs[0]?.severity).toBe('high');
    expect(pairs[0]?.sharedTokens).toContain('branch');
  });

  it('returns no conflicts below the configured similarity threshold', async () => {
    const left = makeSkill();
    const right = makeSkill({
      name: 'Database Recovery',
      sourcePath: 'E:/skills/db/SKILL.md',
      description: 'Restore backups and verify snapshot integrity.',
      triggers: ['recover production database'],
    });
    const provider: ConflictEmbeddingProvider = {
      modelId: 'test-model',
      embed: async (text: string) =>
        text.startsWith('Release Workflow') ? [1, 0] : [0, 1],
    };

    const pairs = await detectEmbeddingConflicts([left, right], {
      provider,
      cache: createMemoryCache(),
      threshold: 0.8,
    });

    expect(pairs).toEqual([]);
  });
});
