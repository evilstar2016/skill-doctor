import { existsSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import type { DoctorSnapshot } from '../../src/application/types';
import { diffSnapshotHistory, getSnapshotHistoryPath, listSnapshotHistory, saveSnapshotHistory } from '../../src/history/snapshotHistory';
import { cleanupTempRoots, createTempRoot } from '../helpers/cliHarness';

function snapshot(id: string, issues: Array<{ id: string; severity: 'high' | 'medium' }> = []): DoctorSnapshot {
  return {
    id,
    generatedAt: '2026-07-23T00:00:00.000Z',
    status: 'complete',
    durationMs: 10,
    target: { projectDir: '/project', scope: 'project', platform: 'codex' },
    resources: [],
    skills: [],
    issues: issues.map((issue) => ({ ...issue, kind: 'security', title: issue.id, summary: '', resourceIds: [], resourceNames: [] })),
    warnings: [],
    summary: { resources: 1, issues: issues.length, high: issues.filter((issue) => issue.severity === 'high').length, medium: issues.filter((issue) => issue.severity === 'medium').length, low: 0, security: 0, conflicts: 0, duplicates: 0, disabledResources: 0, fixedTokens: 100, activationTokens: 20, platforms: {}, scopes: {} },
    conflicts: [],
    audit: { scanned: 0, findings: [], aiFindings: [], summary: { total: 0, bySeverity: {} } },
    context: { totalTokens: 120, resources: [] },
    capabilities: { aiAuditConfigured: false, embeddingConfigured: false, canToggleCodexResources: true, canExecuteCleanup: false, canInstall: true, canUninstall: false, canExportDashboard: true },
  } as DoctorSnapshot;
}

describe('snapshot history', () => {
  it('persists local snapshots and compares issue, resource and context deltas', () => {
    const homeDir = createTempRoot();
    const baseline = snapshot('baseline', [{ id: 'fixed', severity: 'high' }]);
    const current = snapshot('current', [{ id: 'new', severity: 'medium' }]);
    current.summary.resources = 3;
    current.summary.fixedTokens = 140;

    saveSnapshotHistory(baseline, homeDir);
    saveSnapshotHistory(current, homeDir);

    expect(existsSync(getSnapshotHistoryPath(homeDir))).toBe(true);
    expect(listSnapshotHistory(homeDir).map((entry) => entry.id)).toEqual(['current', 'baseline']);
    expect(diffSnapshotHistory(baseline, current)).toMatchObject({
      issues: { added: 1, resolved: 1, addedBySeverity: { medium: 1 }, resolvedBySeverity: { high: 1 } },
      resources: { baseline: 1, current: 3, change: 2 },
      contextTokens: { baseline: 120, current: 160, change: 40 },
    });

    cleanupTempRoots();
  });
});
