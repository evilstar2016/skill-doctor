import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';

import { afterEach, describe, expect, it, vi } from 'vitest';
import * as contextScan from '../../src/context/scanCodexContext';
import * as contextCost from '../../src/context/estimateContextCost';

import { getPlanFixedEstimate, loadOptimizationPlan, validateOptimizationPlan } from '../../src/benefit/optimizationPlan';
import { planResources } from '../../src/benefit/contextEvidence';

const roots: string[] = [];

afterEach(() => {
  vi.restoreAllMocks();
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe('loadOptimizationPlan', () => {
  it('matches preview normalization and deduplication without adding MCP to its scope', async () => {
    const scanSpy = vi.spyOn(contextScan, 'scanCodexContextEntries').mockResolvedValue([]);
    const estimateSpy = vi.spyOn(contextCost, 'estimateContextCost').mockReturnValue({
      items: [{ id: 'skill-1', estimatedTokens: 10, estimatedChars: 40 }],
    } as ReturnType<typeof contextCost.estimateContextCost>);
    const fingerprint = createHash('sha256').update(JSON.stringify([{
      controlMethod: null, controllable: false, enabled: true, estimateStatus: 'estimated', estimatedChars: 40, estimatedTokens: 10, id: 'skill-1',
    }])).digest('hex');
    const result = await validateOptimizationPlan({ projectDir: '/tmp/project', homeDir: '/tmp/unused', plan: {
      id: 'scoped', sourcePath: '/tmp/plan.json', sourceKind: 'explicit', scope: 'project',
      coverage: { resources: ['skill', 'plugin'] }, inventoryFingerprint: fingerprint,
    } });
    expect(result.status).toBe('matched');
    expect(scanSpy.mock.calls.map((call) => call[1]?.resource)).toEqual(['skill', 'plugin']);
    expect(estimateSpy).toHaveBeenCalledWith([], { projectPath: '/tmp/project', scope: 'project' });
  });

  it('deduplicates overlapping resources across preview items and operations', () => {
    const resources = planResources({
      id: 'overlap',
      sourcePath: '/tmp/plan.json',
      sourceKind: 'explicit',
      items: [{ id: 'skill-1', name: 'same-skill', resource: 'skill' }],
      operations: [{ affectedItems: [{ id: 'skill-1', name: 'same-skill', resource: 'skill' }, { id: 'skill-2', name: 'other-skill', resource: 'skill' }] }],
    });

    expect(resources.map((resource) => resource.id)).toEqual(['skill-1', 'skill-2']);
  });

  it('normalizes an applied optimizer operation into a usable estimate', async () => {
    const root = mkdtempSync('/tmp/skill-doctor-benefit-plan-');
    roots.push(root);
    const projectDir = join(root, 'project');
    const operationDir = join(root, '.skill-doctor', 'context-optimizer', 'operations');
    mkdirSync(projectDir, { recursive: true });
    mkdirSync(operationDir, { recursive: true });
    writeFileSync(join(operationDir, 'operation-1.json'), JSON.stringify({
      schemaVersion: 1,
      kind: 'skill-doctor-context-operation',
      id: 'operation-1',
      createdAt: '2026-09-07T00:00:00.000Z',
      status: 'applied',
      projectDir,
      platform: 'codex',
      scope: 'all',
      before: { totalEstimatedTokens: 1000, activationTokens: 1200 },
      after: { totalEstimatedTokens: 700, activationTokens: 900 },
      operations: [{
        id: 'toggle-skill',
        type: 'disable',
        affectedItems: [{ id: 'skill-1', name: 'large-skill', resource: 'skill', sourcePath: join(projectDir, 'SKILL.md'), scope: 'project', enabled: false, controllable: true, controlMethod: 'skills.config', requiresNewSession: true }],
      }],
    }), 'utf8');

    const loaded = await loadOptimizationPlan({ projectDir, homeDir: root });

    expect(loaded.plan).toMatchObject({ id: 'operation-1', sourceKind: 'operation', baseline: { totalEstimatedTokens: 1000 } });
    expect(loaded.plan?.estimate).toMatchObject({ fixedEstimatedTokens: 300, estimatedAfterTokens: 700 });
    expect(getPlanFixedEstimate(loaded.plan!)).toMatchObject({ savingsTokens: 300, baselineTokens: 1000, rate: 0.3 });
    expect(loaded.plan?.operations?.[0].affectedItems?.[0]).toMatchObject({ controllable: true, controlMethod: 'skills.config', requiresNewSession: true });
    expect(loaded.diagnostics.some((item) => item.code === 'plan.operation_fallback')).toBe(true);
  });

  it('auto-selects the newest matching plan and rejects another project when referenced explicitly', async () => {
    const root = mkdtempSync('/tmp/skill-doctor-benefit-plan-select-');
    roots.push(root);
    const projectDir = join(root, 'project');
    const otherDir = join(root, 'other');
    const planDir = join(root, '.skill-doctor', 'context-optimizer', 'plans');
    mkdirSync(projectDir, { recursive: true });
    mkdirSync(otherDir, { recursive: true });
    mkdirSync(planDir, { recursive: true });
    const plan = (id: string, createdAt: string, targetProject: string) => ({
      schemaVersion: 1,
      kind: 'skill-doctor-context-plan',
      id,
      createdAt,
      projectDir: targetProject,
      baseline: { totalEstimatedTokens: 100 },
      estimate: { fixedEstimatedTokens: 10, estimatedAfterTokens: 90 },
    });
    writeFileSync(join(planDir, 'old.json'), JSON.stringify(plan('old', '2026-09-06T00:00:00.000Z', projectDir)), 'utf8');
    writeFileSync(join(planDir, 'new.json'), JSON.stringify(plan('new', '2026-09-07T00:00:00.000Z', projectDir)), 'utf8');
    writeFileSync(join(planDir, 'other.json'), JSON.stringify(plan('other', '2026-09-08T00:00:00.000Z', otherDir)), 'utf8');

    const selected = await loadOptimizationPlan({ projectDir, homeDir: root });
    const mismatch = await loadOptimizationPlan({ projectDir, homeDir: root, reference: join(planDir, 'other.json') });

    expect(selected.plan?.id).toBe('new');
    expect(selected.diagnostics.some((item) => item.code === 'plan.auto_selected')).toBe(true);
    expect(mismatch.plan).toBeUndefined();
    expect(mismatch.diagnostics.some((item) => item.code === 'plan.project_mismatch')).toBe(true);
  });

  it('rejects a plan whose current local inventory fingerprint has drifted', async () => {
    const root = mkdtempSync('/tmp/skill-doctor-benefit-plan-drift-');
    roots.push(root);
    const projectDir = join(root, 'project');
    mkdirSync(projectDir, { recursive: true });

    const result = await validateOptimizationPlan({
      projectDir,
      homeDir: root,
      plan: { id: 'drift', sourcePath: join(root, 'plan.json'), sourceKind: 'explicit', inventoryFingerprint: 'not-the-current-fingerprint' },
    });

    expect(result.status).toBe('mismatch');
    expect(result.currentFingerprint).toMatch(/^[0-9a-f]{64}$/);
  });
});
