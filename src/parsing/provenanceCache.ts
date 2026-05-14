import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';

export interface ProvenanceCacheEntry {
  repository?: string;
  author?: string;
  resolved?: boolean;
}

export type ProvenanceCache = Map<string, ProvenanceCacheEntry>;

const UTF8_BOM = '﻿';

export function getDefaultProvenanceCachePath(homeDir: string = homedir()): string {
  return join(homeDir, '.skill-doctor', 'provenance.json');
}

export function loadProvenanceCache(
  cachePath: string = getDefaultProvenanceCachePath(),
): ProvenanceCache {
  if (!existsSync(cachePath)) return new Map();

  try {
    const raw = JSON.parse(stripUtf8Bom(readFileSync(cachePath, 'utf8'))) as Record<string, unknown>;
    const cache = new Map<string, ProvenanceCacheEntry>();

    for (const [key, value] of Object.entries(raw)) {
      if (!isRecord(value)) {
        continue;
      }

      const repository = typeof value.repository === 'string' ? value.repository : undefined;
      const author = typeof value.author === 'string' ? value.author : undefined;
      const resolved = value.resolved === true || repository !== undefined || author !== undefined;

      if (resolved) {
        cache.set(key, {
          ...(repository ? { repository } : {}),
          ...(author ? { author } : {}),
          resolved: true,
        });
      }
    }

    return cache;
  } catch {
    return new Map();
  }
}

export function saveProvenanceCache(
  cache: ProvenanceCache,
  cachePath: string = getDefaultProvenanceCachePath(),
): void {
  const dir = dirname(cachePath);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });

  const obj: Record<string, ProvenanceCacheEntry> = {};
  for (const [key, value] of cache) {
    if (value.resolved || value.repository || value.author) {
      obj[key] = value;
    }
  }

  writeFileSync(cachePath, `${UTF8_BOM}${JSON.stringify(obj, null, 2)}`, 'utf8');
}

function stripUtf8Bom(value: string): string {
  return value.charCodeAt(0) === 0xfeff ? value.slice(1) : value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
