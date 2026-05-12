import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';

export interface EmbeddingCache {
  get(text: string): number[] | null;
  set(text: string, embedding: readonly number[]): void;
}

export interface EmbeddingCacheOptions {
  modelId: string;
  cacheDir?: string;
}

interface EmbeddingCacheEntry {
  modelId: string;
  textHash: string;
  embedding: number[];
}

export function createEmbeddingCache(options: EmbeddingCacheOptions): EmbeddingCache {
  const cacheRoot = options.cacheDir ?? getDefaultEmbeddingCacheDir();
  const modelId = options.modelId;
  const modelDir = join(cacheRoot, sanitizePathSegment(modelId));

  return {
    get(text: string): number[] | null {
      const filePath = getCachePath(modelDir, text);
      if (!existsSync(filePath)) {
        return null;
      }

      try {
        const parsed = JSON.parse(readFileSync(filePath, 'utf-8')) as Partial<EmbeddingCacheEntry>;
        return Array.isArray(parsed.embedding) && parsed.embedding.every((value) => typeof value === 'number')
          ? parsed.embedding
          : null;
      } catch {
        return null;
      }
    },
    set(text: string, embedding: readonly number[]): void {
      const filePath = getCachePath(modelDir, text);
      mkdirSync(dirname(filePath), { recursive: true });
      writeFileSync(
        filePath,
        JSON.stringify(
          {
            modelId,
            textHash: hashText(text),
            embedding: [...embedding],
          } satisfies EmbeddingCacheEntry,
          null,
          2,
        ),
        'utf-8',
      );
    },
  };
}

export function getDefaultEmbeddingCacheDir(): string {
  if (process.env.LOCALAPPDATA) {
    return join(process.env.LOCALAPPDATA, 'skill-doctor', 'embeddings');
  }

  if (process.env.XDG_CACHE_HOME) {
    return join(process.env.XDG_CACHE_HOME, 'skill-doctor', 'embeddings');
  }

  return join(homedir(), '.cache', 'skill-doctor', 'embeddings');
}

function getCachePath(modelDir: string, text: string): string {
  return join(modelDir, `${hashText(text)}.json`);
}

function hashText(text: string): string {
  return createHash('sha256').update(text).digest('hex');
}

function sanitizePathSegment(value: string): string {
  return value.replace(/[^a-z0-9._-]+/gi, '_');
}
