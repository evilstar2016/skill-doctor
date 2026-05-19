import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import type { AiFinding } from '../types/audit';

export interface AuditCacheEntry {
  cachedAt: number;
  model: string;
  findings: AiFinding[];
}

interface CacheFile {
  v1: Record<string, AuditCacheEntry>;
}

export function hashContent(content: string): string {
  return createHash('sha256').update(content, 'utf-8').digest('hex');
}

function getCachePath(homeDir?: string): string {
  const base = homeDir ?? process.env.HOME ?? process.env.USERPROFILE ?? homedir();
  return join(base, '.skill-doctor', 'audit-cache.json');
}

export function readAuditCache(homeDir?: string): Map<string, AuditCacheEntry> {
  const path = getCachePath(homeDir);
  if (!existsSync(path)) return new Map();
  try {
    const parsed = JSON.parse(readFileSync(path, 'utf-8')) as CacheFile;
    return new Map(Object.entries(parsed.v1 ?? {}));
  } catch {
    return new Map();
  }
}

export function writeAuditCache(cache: Map<string, AuditCacheEntry>, homeDir?: string): void {
  const path = getCachePath(homeDir);
  mkdirSync(dirname(path), { recursive: true });
  const file: CacheFile = { v1: Object.fromEntries(cache) };
  writeFileSync(path, JSON.stringify(file, null, 2), 'utf-8');
}
