import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';

import type { CodexSessionFileAnalysis } from './types';

export interface SessionIndexEntry {
  filePath: string;
  archived: boolean;
  size: number;
  mtimeMs: number;
  readOffset: number;
  prefixHash: string;
  analysis: CodexSessionFileAnalysis;
}

export interface SessionIndex {
  schemaVersion: 4;
  generatedAt: string;
  entries: SessionIndexEntry[];
}

export function defaultSessionIndexPath(homeDir?: string): string {
  const resolvedHome = homeDir ?? process.env.HOME ?? process.env.USERPROFILE ?? homedir();
  return resolve(join(resolvedHome, '.skill-doctor', 'benefit', 'session-index.json'));
}

export async function loadSessionIndex(indexPath: string): Promise<SessionIndex | undefined> {
  try {
    const value = JSON.parse(await readFile(indexPath, 'utf8')) as unknown;
    if (!value || typeof value !== 'object' || (value as Record<string, unknown>).schemaVersion !== 4) return undefined;
    const entries = (value as Record<string, unknown>).entries;
    if (!Array.isArray(entries)) return undefined;
    return {
      schemaVersion: 4,
      generatedAt: typeof (value as Record<string, unknown>).generatedAt === 'string'
        ? (value as Record<string, unknown>).generatedAt as string
        : new Date(0).toISOString(),
      entries: entries.filter(isIndexEntry),
    };
  } catch {
    return undefined;
  }
}

export function indexEntryMatches(entry: SessionIndexEntry, size: number, mtimeMs: number, archived: boolean): boolean {
  return entry.size === size && entry.mtimeMs === mtimeMs && entry.archived === archived;
}

export function sanitizeAnalysisForIndex(analysis: CodexSessionFileAnalysis): CodexSessionFileAnalysis {
  return {
    ...analysis,
    contextSnapshotValid: analysis.contextSnapshotValid,
    contextSnapshotAwaitingFull: analysis.contextSnapshotAwaitingFull,
    contextSnapshots: analysis.contextSnapshots.map((snapshot) => ({
      timestamp: snapshot.timestamp,
      full: snapshot.full,
      ...(snapshot.sourceKind ? { sourceKind: snapshot.sourceKind } : {}),
      ...(snapshot.role ? { role: snapshot.role } : {}),
      ...(snapshot.stateKeys ? { stateKeys: [...snapshot.stateKeys] } : {}),
      ...(snapshot.agentsDirectory ? { agentsDirectory: snapshot.agentsDirectory } : {}),
      ...(snapshot.agentsTextChars !== undefined || snapshot.agentsText !== undefined
        ? { agentsTextChars: snapshot.agentsTextChars ?? snapshot.agentsText?.length ?? 0 }
        : {}),
      ...(snapshot.agentsTruncated !== undefined ? { agentsTruncated: snapshot.agentsTruncated } : {}),
      ...(snapshot.agentsComplete !== undefined ? { agentsComplete: snapshot.agentsComplete } : {}),
      ...(snapshot.hostSkillsTextChars !== undefined || snapshot.hostSkillsText !== undefined
        ? { hostSkillsTextChars: snapshot.hostSkillsTextChars ?? snapshot.hostSkillsText?.length ?? 0 }
        : {}),
      ...(snapshot.hostSkillsTruncated !== undefined ? { hostSkillsTruncated: snapshot.hostSkillsTruncated } : {}),
      ...(snapshot.hostSkillsComplete !== undefined ? { hostSkillsComplete: snapshot.hostSkillsComplete } : {}),
      ...(snapshot.contextTextChars !== undefined ? { contextTextChars: snapshot.contextTextChars } : {}),
      ...(snapshot.contextTextSha256 ? { contextTextSha256: snapshot.contextTextSha256 } : {}),
      ...(snapshot.contextBlocksComplete !== undefined ? { contextBlocksComplete: snapshot.contextBlocksComplete } : {}),
      ...(snapshot.contextBlocks ? {
        contextBlocks: snapshot.contextBlocks.map((block) => ({
          id: block.id,
          tag: block.tag,
          role: block.role,
          activation: block.activation,
          ...(block.contentKind ? { contentKind: block.contentKind } : {}),
          complete: block.complete,
          estimatedChars: block.estimatedChars,
          ...(block.estimatedTokens !== undefined ? { estimatedTokens: block.estimatedTokens } : {}),
          ...(block.textSha256 ? { textSha256: block.textSha256 } : {}),
          ...(block.controlMethod ? { controlMethod: block.controlMethod } : {}),
          ...(block.controllable !== undefined ? { controllable: block.controllable } : {}),
          recommendation: block.recommendation,
          sourcePath: block.sourcePath,
          line: block.line,
        })),
      } : {}),
      sourcePath: snapshot.sourcePath,
      line: snapshot.line,
    })),
  };
}

export async function saveSessionIndex(indexPath: string, entries: SessionIndexEntry[]): Promise<void> {
  const directory = dirname(indexPath);
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const temporaryPath = `${indexPath}.${process.pid}.${randomUUID()}.tmp`;
  const value: SessionIndex = {
    schemaVersion: 4,
    generatedAt: new Date().toISOString(),
    entries: entries.map((entry) => ({ ...entry, analysis: sanitizeAnalysisForIndex(entry.analysis) })),
  };
  await writeFile(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 });
  await rename(temporaryPath, indexPath);
}

export function pruneSessionIndexEntries(entries: SessionIndexEntry[], retentionDays: number | undefined, nowMs = Date.now()): SessionIndexEntry[] {
  if (retentionDays === undefined || !Number.isFinite(retentionDays) || retentionDays <= 0) return entries;
  const cutoff = nowMs - retentionDays * 86_400_000;
  return entries.filter((entry) => entry.mtimeMs >= cutoff);
}

export async function deleteSessionIndex(indexPath: string): Promise<boolean> {
  try {
    await unlink(indexPath);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false;
    throw error;
  }
}

export async function deleteSessionIndexEntries(indexPath: string, filePaths: string[]): Promise<number> {
  const index = await loadSessionIndex(indexPath);
  if (!index || filePaths.length === 0) return 0;
  const targets = new Set(filePaths.map((filePath) => resolve(filePath)));
  const kept = index.entries.filter((entry) => !targets.has(resolve(entry.filePath)));
  const deleted = index.entries.length - kept.length;
  if (deleted > 0) await saveSessionIndex(indexPath, kept);
  return deleted;
}

function isIndexEntry(value: unknown): value is SessionIndexEntry {
  if (!value || typeof value !== 'object') return false;
  const entry = value as Record<string, unknown>;
  return typeof entry.filePath === 'string'
    && typeof entry.archived === 'boolean'
    && typeof entry.size === 'number'
    && typeof entry.mtimeMs === 'number'
    && typeof entry.readOffset === 'number'
    && typeof entry.prefixHash === 'string'
    && Boolean(entry.analysis && typeof entry.analysis === 'object');
}
