import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';

/** Cache key is the skill's sourcePath — unique and stable. */
export type WhenToUseCache = Map<string, string>;

const UTF8_BOM = '﻿';

export function getDefaultWhenToUseCachePath(homeDir: string = homedir()): string {
  return join(homeDir, '.skill-doctor', 'when-to-use.json');
}

export function loadWhenToUseCache(
  cachePath: string = getDefaultWhenToUseCachePath(),
): WhenToUseCache {
  if (!existsSync(cachePath)) return new Map();

  try {
    const raw = JSON.parse(stripUtf8Bom(readFileSync(cachePath, 'utf8'))) as Record<string, unknown>;
    const map = new Map<string, string>();
    for (const [k, v] of Object.entries(raw)) {
      if (typeof v === 'string') map.set(k, v);
    }
    return map;
  } catch {
    return new Map();
  }
}

export function saveWhenToUseCache(
  cache: WhenToUseCache,
  cachePath: string = getDefaultWhenToUseCachePath(),
): void {
  const dir = dirname(cachePath);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });

  const obj: Record<string, string> = {};
  for (const [k, v] of cache) obj[k] = v;
  writeFileSync(cachePath, `${UTF8_BOM}${JSON.stringify(obj, null, 2)}`, 'utf8');
}

function stripUtf8Bom(value: string): string {
  return value.charCodeAt(0) === 0xfeff ? value.slice(1) : value;
}
