import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { afterEach, beforeAll, describe, expect, it } from 'vitest';

import {
  MULTI_PLATFORM_ADAPTER_PLATFORMS,
  writeMultiPlatformProjectFixture,
  type MultiPlatformAdapterPlatform,
} from '../../fixtures/multiPlatformProject';
import { buildCli, cleanupTempRoots, createTempRoot, runCli } from '../../helpers/cliHarness';

interface ScanPayload {
  summary: {
    totalSkillsInstalled: number;
    duplicatesDetected: number;
    conflictsDetected: number;
    platforms: Record<string, number>;
  };
  skills: Array<{ name: string; platform: string; scope: string; provenance?: { installSource: string } }>;
}

interface ConflictsPayload {
  duplicates: Array<{ a: { name: string; platform: string }; b: { name: string; platform: string } }>;
  conflicts: Array<{ a: { platform: string }; b: { platform: string }; detectionMethod?: string }>;
}

interface AuditPayload {
  findings: Array<{ skillName: string; platform: string; ruleId: string; sourcePath: string }>;
}

interface CostPayload {
  summary: {
    byPlatform: Array<{ platform: string; items: number }>;
  };
  items: Array<{ name: string; platform: string; source: string; kind: string; recommendation?: string }>;
}

beforeAll(() => {
  buildCli();
}, 30000);

afterEach(() => {
  cleanupTempRoots();
});

describe('platform adapter regression scenario', () => {
  it('keeps scan, conflicts, audit, cost, MCP, and dashboard compatible across primary adapters', () => {
    const root = createTempRoot('skill-doctor-platform-regression-');
    const cwd = join(root, 'workspace');
    const home = join(root, 'home');
    const dashboardPath = join(root, 'dashboard.html');
    writeMultiPlatformProjectFixture(cwd, home);

    const scanResult = runCli(['scan', '--json'], cwd, home);
    expect(scanResult.status).toBe(0);
    const scanPayload = JSON.parse(scanResult.stdout) as ScanPayload;
    expect(scanPayload.summary.totalSkillsInstalled).toBeGreaterThanOrEqual(MULTI_PLATFORM_ADAPTER_PLATFORMS.length);
    for (const platform of MULTI_PLATFORM_ADAPTER_PLATFORMS) {
      expect(scanPayload.summary.platforms[platform]).toBeGreaterThanOrEqual(1);
    }
    expect(platformsFrom(scanPayload.skills)).toEqual(expect.arrayContaining([...MULTI_PLATFORM_ADAPTER_PLATFORMS]));
    expect(scanPayload.skills.every((skill) => skill.scope === 'project')).toBe(true);
    expect(scanPayload.skills.every((skill) => skill.provenance?.installSource)).toBe(true);

    const conflictsResult = runCli(['conflicts', '--json'], cwd, home);
    expect(conflictsResult.status).toBe(0);
    const conflictsPayload = JSON.parse(conflictsResult.stdout) as ConflictsPayload;
    expect(conflictsPayload.duplicates).toEqual(expect.arrayContaining([
      expect.objectContaining({
        a: expect.objectContaining({ name: 'shared-review-helper' }),
        b: expect.objectContaining({ name: 'shared-review-helper' }),
      }),
    ]));
    expect(conflictsPayload.duplicates[0] ? platformsFrom([conflictsPayload.duplicates[0].a, conflictsPayload.duplicates[0].b]) : []).toEqual(['claude', 'cursor']);
    expect(conflictsPayload.conflicts.some((pair) => pair.detectionMethod === 'token')).toBe(true);

    const auditResult = runCli(['audit', '--json'], cwd, home);
    expect(auditResult.status).toBe(0);
    const auditPayload = JSON.parse(auditResult.stdout) as AuditPayload;
    expect(auditPayload.findings).toEqual(expect.arrayContaining([
      expect.objectContaining({ platform: 'copilot', ruleId: 'secret-leak' }),
      expect.objectContaining({ platform: 'gemini', ruleId: 'destructive' }),
      expect.objectContaining({ platform: 'windsurf', ruleId: 'network-call' }),
    ]));

    const skillCostResult = runCli(['cost', '--source', 'skill', '--json'], cwd, home);
    expect(skillCostResult.status).toBe(0);
    const skillCostPayload = JSON.parse(skillCostResult.stdout) as CostPayload;
    expect(platformsFrom(skillCostPayload.summary.byPlatform)).toEqual(expect.arrayContaining([...MULTI_PLATFORM_ADAPTER_PLATFORMS]));
    expect(skillCostPayload.items).toEqual(expect.arrayContaining([
      expect.objectContaining({ platform: 'cursor', kind: 'cursor-rule-file' }),
      expect.objectContaining({ platform: 'copilot', kind: 'copilot-instruction-file' }),
      expect.objectContaining({ platform: 'codex', kind: 'agent-skill-description' }),
      expect.objectContaining({ platform: 'windsurf', kind: 'always-on-file' }),
    ]));

    const mcpCostResult = runCli(['cost', '--source', 'mcp', '--json'], cwd, home);
    expect(mcpCostResult.status).toBe(0);
    const mcpCostPayload = JSON.parse(mcpCostResult.stdout) as CostPayload;
    expect(platformsFrom(mcpCostPayload.items)).toEqual(expect.arrayContaining(['claude', 'cursor', 'copilot', 'codex', 'gemini']));
    expect(mcpCostPayload.items.every((item) => item.source === 'mcp')).toBe(true);
    expect(mcpCostPayload.items.every((item) => item.kind === 'mcp-tool-list')).toBe(true);

    const dashboardResult = runCli(['dashboard', '--report', dashboardPath], cwd, home);
    expect(dashboardResult.status).toBe(0);
    expect(existsSync(dashboardPath)).toBe(true);
    const dashboard = readFileSync(dashboardPath, 'utf8');
    expect(dashboard).toContain('shared-review-helper');
    expect(dashboard).toContain('schema-change-guard');
    expect(dashboard).toContain('windsurf-network-policy');
  });
});

function platformsFrom(entries: Array<{ platform: string }>): MultiPlatformAdapterPlatform[] {
  return entries
    .map((entry) => entry.platform)
    .filter((platform): platform is MultiPlatformAdapterPlatform =>
      MULTI_PLATFORM_ADAPTER_PLATFORMS.includes(platform as MultiPlatformAdapterPlatform),
    )
    .sort();
}
