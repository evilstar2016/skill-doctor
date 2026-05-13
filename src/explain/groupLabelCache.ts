import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import type { SkillRecord } from '../types/skill';

export type GroupLabelCache = Map<string, string>;

/** Stable cache key for a cluster: sorted sourcePaths joined with '|' */
export function clusterKey(skills: SkillRecord[]): string {
  return [...skills]
    .map((s) => s.sourcePath)
    .sort()
    .join('|');
}

export function getDefaultGroupLabelCachePath(homeDir: string = homedir()): string {
  return join(homeDir, '.skill-doctor', 'group-labels.json');
}

export function loadGroupLabelCache(
  cachePath: string = getDefaultGroupLabelCachePath(),
): GroupLabelCache {
  if (!existsSync(cachePath)) return new Map();

  try {
    const raw = JSON.parse(readFileSync(cachePath, 'utf-8')) as Record<string, unknown>;
    const map = new Map<string, string>();
    for (const [k, v] of Object.entries(raw)) {
      if (typeof v === 'string') map.set(k, v);
    }
    return map;
  } catch {
    return new Map();
  }
}

export function saveGroupLabelCache(
  cache: GroupLabelCache,
  cachePath: string = getDefaultGroupLabelCachePath(),
): void {
  const dir = dirname(cachePath);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });

  const obj: Record<string, string> = {};
  for (const [k, v] of cache) obj[k] = v;
  writeFileSync(cachePath, JSON.stringify(obj, null, 2), 'utf-8');
}
