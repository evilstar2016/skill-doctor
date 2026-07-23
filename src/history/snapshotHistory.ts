import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

import type { DoctorSnapshot, UiIssueSeverity } from '../application/types';

const MAX_SNAPSHOTS = 30;

export interface SnapshotHistoryEntry extends DoctorSnapshot {
  label?: string;
}

export interface SnapshotHistoryDiff {
  baseline: Pick<SnapshotHistoryEntry, 'id' | 'generatedAt' | 'status'>;
  current: Pick<SnapshotHistoryEntry, 'id' | 'generatedAt' | 'status'>;
  issues: {
    added: number;
    resolved: number;
    unchanged: number;
    addedBySeverity: Partial<Record<UiIssueSeverity, number>>;
    resolvedBySeverity: Partial<Record<UiIssueSeverity, number>>;
  };
  resources: { baseline: number; current: number; change: number };
  contextTokens: { baseline: number; current: number; change: number };
}

export function getSnapshotHistoryPath(homeDir: string = resolveHomeDir()): string {
  return join(homeDir, '.skill-doctor', 'snapshot-history.json');
}

function resolveHomeDir(): string {
  return process.env.HOME || process.env.USERPROFILE || homedir();
}

export function listSnapshotHistory(homeDir?: string): SnapshotHistoryEntry[] {
  const path = getSnapshotHistoryPath(homeDir);
  if (!existsSync(path)) return [];
  try {
    const parsed = JSON.parse(readFileSync(path, 'utf8')) as { snapshots?: SnapshotHistoryEntry[] };
    return Array.isArray(parsed.snapshots) ? parsed.snapshots : [];
  } catch {
    return [];
  }
}

export function saveSnapshotHistory(snapshot: DoctorSnapshot, homeDir?: string): SnapshotHistoryEntry[] {
  const path = getSnapshotHistoryPath(homeDir);
  const snapshots = [snapshot, ...listSnapshotHistory(homeDir).filter((entry) => entry.id !== snapshot.id)].slice(0, MAX_SNAPSHOTS);
  mkdirSync(join(path, '..'), { recursive: true });
  const temporaryPath = `${path}.tmp-${process.pid}-${Date.now()}`;
  writeFileSync(temporaryPath, `${JSON.stringify({ snapshots }, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 });
  renameSync(temporaryPath, path);
  return snapshots;
}

export function findSnapshotHistoryEntry(id: string, homeDir?: string): SnapshotHistoryEntry | undefined {
  return listSnapshotHistory(homeDir).find((snapshot) => snapshot.id === id);
}

export function diffSnapshotHistory(baseline: SnapshotHistoryEntry, current: SnapshotHistoryEntry): SnapshotHistoryDiff {
  const baselineIssues = new Map(baseline.issues.map((issue) => [issue.id, issue]));
  const currentIssues = new Map(current.issues.map((issue) => [issue.id, issue]));
  const added = [...currentIssues.values()].filter((issue) => !baselineIssues.has(issue.id));
  const resolved = [...baselineIssues.values()].filter((issue) => !currentIssues.has(issue.id));
  const contextTokens = (snapshot: SnapshotHistoryEntry) => (snapshot.summary.fixedTokens ?? 0) + (snapshot.summary.activationTokens ?? 0);
  const severityCounts = (issues: typeof added): Partial<Record<UiIssueSeverity, number>> => issues.reduce<Partial<Record<UiIssueSeverity, number>>>((counts, issue) => {
    counts[issue.severity] = (counts[issue.severity] ?? 0) + 1;
    return counts;
  }, {});

  return {
    baseline: { id: baseline.id, generatedAt: baseline.generatedAt, status: baseline.status },
    current: { id: current.id, generatedAt: current.generatedAt, status: current.status },
    issues: {
      added: added.length,
      resolved: resolved.length,
      unchanged: current.issues.length - added.length,
      addedBySeverity: severityCounts(added),
      resolvedBySeverity: severityCounts(resolved),
    },
    resources: { baseline: baseline.summary.resources, current: current.summary.resources, change: current.summary.resources - baseline.summary.resources },
    contextTokens: { baseline: contextTokens(baseline), current: contextTokens(current), change: contextTokens(current) - contextTokens(baseline) },
  };
}
