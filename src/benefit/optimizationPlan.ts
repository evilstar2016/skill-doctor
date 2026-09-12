import { createHash } from 'node:crypto';
import { readdir, readFile, stat } from 'node:fs/promises';
import { homedir } from 'node:os';
import { isAbsolute, join, resolve } from 'node:path';

import type { BenefitDiagnostic, OptimizationPlan, OptimizationPlanResource } from './types';
import { estimateContextCost } from '../context/estimateContextCost';
import { scanCodexContextEntries } from '../context/scanCodexContext';

interface LoadPlanOptions {
  projectDir: string;
  homeDir?: string;
  reference?: string;
}

export interface OptimizationPlanValidation {
  status: 'not_available' | 'matched' | 'mismatch' | 'unknown';
  planFingerprint?: string;
  currentFingerprint?: string;
  message: string;
}

function defaultHomeDir(): string {
  return process.env.HOME || process.env.USERPROFILE || homedir();
}

function stateRoot(homeDir?: string): string {
  return resolve(
    process.env.SKILL_DOCTOR_OPTIMIZER_HOME
      ?? join(homeDir ?? defaultHomeDir(), '.skill-doctor', 'context-optimizer'),
  );
}

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value : undefined;
}

function normalizeProjectPath(value: string | undefined): string | undefined {
  return value ? resolve(value) : undefined;
}

function parseResource(value: unknown): OptimizationPlanResource | undefined {
  if (!isObject(value)) return undefined;
  const id = stringValue(value.id);
  const name = stringValue(value.name);
  const sourcePath = stringValue(value.sourcePath);
  const resource = stringValue(value.resource);
  const kind = stringValue(value.kind);
  if (!id && !name && !sourcePath && !resource && !kind) return undefined;
  return {
    ...(id ? { id } : {}),
    ...(name ? { name } : {}),
    ...(sourcePath ? { sourcePath } : {}),
    ...(resource ? { resource } : {}),
    ...(kind ? { kind } : {}),
    ...(typeof value.enabled === 'boolean' ? { enabled: value.enabled } : {}),
    ...(typeof value.estimatedTokens === 'number' ? { estimatedTokens: value.estimatedTokens } : {}),
    ...(typeof value.estimatedChars === 'number' ? { estimatedChars: value.estimatedChars } : {}),
    ...(typeof value.activationEstimatedTokens === 'number' ? { activationEstimatedTokens: value.activationEstimatedTokens } : {}),
    ...(typeof value.activationEstimatedChars === 'number' ? { activationEstimatedChars: value.activationEstimatedChars } : {}),
    ...(stringValue(value.estimateStatus) ? { estimateStatus: value.estimateStatus as string } : {}),
    ...(stringValue(value.scope) ? { scope: value.scope as string } : {}),
    ...(typeof value.controllable === 'boolean' ? { controllable: value.controllable } : {}),
    ...(stringValue(value.controlMethod) ? { controlMethod: value.controlMethod as string } : {}),
    ...(typeof value.requiresNewSession === 'boolean' ? { requiresNewSession: value.requiresNewSession } : {}),
    ...(stringValue(value.blockId) ? { blockId: value.blockId as OptimizationPlanResource['blockId'] } : {}),
    ...(stringValue(value.rootAlias) ? { rootAlias: value.rootAlias as string } : {}),
  };
}

function parsePlan(value: unknown, sourcePath: string, sourceKind: OptimizationPlan['sourceKind']): OptimizationPlan | undefined {
  if (!isObject(value)) return undefined;
  const id = stringValue(value.id);
  if (!id) return undefined;
  const rawEstimate = isObject(value.estimate) ? value.estimate : undefined;
  const rawBaseline = isObject(value.baseline) ? value.baseline : undefined;
  const operationBefore = isObject(value.before) ? value.before : undefined;
  const operationAfter = isObject(value.after) ? value.after : undefined;
  const baseline = rawBaseline ?? operationBefore;
  const estimate = rawEstimate ?? (
    operationBefore && operationAfter
      ? {
          estimatedAfterTokens: typeof operationAfter.totalEstimatedTokens === 'number' ? operationAfter.totalEstimatedTokens : undefined,
          fixedEstimatedTokens:
            typeof operationBefore.totalEstimatedTokens === 'number' && typeof operationAfter.totalEstimatedTokens === 'number'
              ? operationBefore.totalEstimatedTokens - operationAfter.totalEstimatedTokens
              : undefined,
          billingMeasurement: false,
          method: 'Difference between optimizer estimator snapshots before and after apply.',
        }
      : undefined
  );
  const operations = Array.isArray(value.operations)
    ? value.operations.filter(isObject).map((operation) => ({
        ...(stringValue(operation.id) ? { id: operation.id as string } : {}),
        ...(stringValue(operation.type) ? { type: operation.type as string } : {}),
        ...(isObject(operation.before) ? { before: { ...operation.before } } : {}),
        ...(isObject(operation.after) ? { after: { ...operation.after } } : {}),
        requestedIds: Array.isArray(operation.requestedIds)
          ? operation.requestedIds.filter((item): item is string => typeof item === 'string')
          : [],
        affectedItems: Array.isArray(operation.affectedItems)
          ? operation.affectedItems.map(parseResource).filter((item): item is NonNullable<typeof item> => Boolean(item))
          : [],
      }))
    : [];
  const items = Array.isArray(value.items)
    ? value.items.map(parseResource).filter((item): item is NonNullable<typeof item> => Boolean(item))
    : [];
  return {
    ...(typeof value.schemaVersion === 'number' ? { schemaVersion: value.schemaVersion } : {}),
    ...(stringValue(value.kind) ? { kind: value.kind as string } : {}),
    id,
    ...(stringValue(value.createdAt) ? { createdAt: value.createdAt as string } : {}),
    ...(stringValue(value.projectDir) ? { projectDir: value.projectDir as string } : {}),
    ...(stringValue(value.platform) ? { platform: value.platform as string } : {}),
    ...(stringValue(value.scope) ? { scope: value.scope as string } : {}),
    ...(stringValue(value.snapshotId) ? { snapshotId: value.snapshotId as string } : {}),
    ...(stringValue(value.inventoryFingerprint) ? { inventoryFingerprint: value.inventoryFingerprint as string } : {}),
    ...(stringValue(value.confirmationDigest) ? { confirmationDigest: value.confirmationDigest as string } : {}),
    ...(stringValue(value.status) ? { status: value.status as string } : {}),
    ...(isObject(value.coverage) ? { coverage: { ...value.coverage } } : {}),
    requestedIds: Array.isArray(value.requestedIds)
      ? value.requestedIds.filter((item): item is string => typeof item === 'string')
      : [],
    ...(items.length > 0 ? { items } : {}),
    operations,
    ...(baseline ? { baseline: { ...baseline } } : {}),
    ...(estimate ? { estimate: { ...estimate } as OptimizationPlan['estimate'] } : {}),
    sourcePath,
    sourceKind,
  };
}

function normalizeOperationAsPlan(plan: OptimizationPlan): OptimizationPlan {
  if (plan.baseline?.totalEstimatedTokens !== undefined || plan.estimate?.fixedEstimatedTokens !== undefined || plan.estimate?.estimatedAfterTokens !== undefined) {
    return plan;
  }
  const operation = plan.operations?.at(-1);
  const before = operation?.before?.totalEstimatedTokens;
  const after = operation?.after?.totalEstimatedTokens;
  if (typeof before !== 'number' || typeof after !== 'number') return plan;
  return {
    ...plan,
    baseline: { totalEstimatedTokens: before },
    estimate: {
      fixedEstimatedTokens: before - after,
      fixedEstimatedPercent: before > 0 ? ((before - after) / before) * 100 : undefined,
      estimatedAfterTokens: after,
      billingMeasurement: false,
    },
  };
}

async function readPlanFile(filePath: string, sourceKind: OptimizationPlan['sourceKind']): Promise<OptimizationPlan | undefined> {
  try {
    const raw = JSON.parse(await readFile(filePath, 'utf8')) as unknown;
    return parsePlan(raw, filePath, sourceKind);
  } catch {
    return undefined;
  }
}

async function listJsonFiles(directory: string): Promise<string[]> {
  try {
    const entries = await readdir(directory, { withFileTypes: true });
    return entries
      .filter((entry) => entry.isFile() && entry.name.endsWith('.json'))
      .map((entry) => join(directory, entry.name));
  } catch {
    return [];
  }
}

function sameProject(plan: OptimizationPlan, projectDir: string): boolean {
  const planProject = normalizeProjectPath(plan.projectDir);
  return !planProject || planProject === resolve(projectDir);
}

function planTime(plan: OptimizationPlan): number {
  if (!plan.createdAt) return 0;
  const value = Date.parse(plan.createdAt);
  return Number.isFinite(value) ? value : 0;
}

export async function loadOptimizationPlan(options: LoadPlanOptions): Promise<{
  plan?: OptimizationPlan;
  diagnostics: BenefitDiagnostic[];
}> {
  const projectDir = resolve(options.projectDir);
  const root = stateRoot(options.homeDir);
  const diagnostics: BenefitDiagnostic[] = [];
  const reference = options.reference?.trim();

  if (reference) {
    const explicitPath = isAbsolute(reference) || reference.endsWith('.json')
      ? resolve(projectDir, reference)
      : undefined;
    if (explicitPath) {
      const plan = await readPlanFile(explicitPath, 'explicit');
      if (!plan) {
        diagnostics.push({ code: 'plan.invalid', severity: 'error', message: `Unable to read a valid optimization plan: ${explicitPath}`, sourcePath: explicitPath });
        return { diagnostics };
      }
      if (!sameProject(plan, projectDir)) {
        diagnostics.push({ code: 'plan.project_mismatch', severity: 'error', message: 'Optimization plan belongs to a different project', sourcePath: explicitPath });
        return { diagnostics };
      }
      return { plan, diagnostics };
    }

    const planPath = join(root, 'plans', `${reference}.json`);
    const plan = await readPlanFile(planPath, 'plan');
    if (!plan) {
      diagnostics.push({ code: 'plan.not_found', severity: 'error', message: `Optimization plan was not found: ${reference}`, sourcePath: planPath });
      return { diagnostics };
    }
    if (!sameProject(plan, projectDir)) {
      diagnostics.push({ code: 'plan.project_mismatch', severity: 'error', message: 'Optimization plan belongs to a different project', sourcePath: planPath });
      return { diagnostics };
    }
    return { plan, diagnostics };
  }

  const planFiles = await listJsonFiles(join(root, 'plans'));
  const plans = (await Promise.all(planFiles.map((filePath) => readPlanFile(filePath, 'plan'))))
    .filter((plan): plan is OptimizationPlan => Boolean(plan && sameProject(plan, projectDir)))
    .sort((left, right) => planTime(right) - planTime(left));
  if (plans[0]) {
    diagnostics.push({ code: 'plan.auto_selected', severity: 'info', message: 'Automatically selected the newest matching Skill Doctor optimization plan', sourcePath: plans[0].sourcePath });
    return { plan: plans[0], diagnostics };
  }

  const operationFiles = await listJsonFiles(join(root, 'operations'));
  const operations = (await Promise.all(operationFiles.map((filePath) => readPlanFile(filePath, 'operation'))))
    .filter((plan): plan is OptimizationPlan => Boolean(plan && sameProject(plan, projectDir)))
    .sort((left, right) => planTime(right) - planTime(left));
  if (operations[0]) {
    diagnostics.push({ code: 'plan.operation_fallback', severity: 'warning', message: 'No preview plan was found; using the newest matching optimizer operation as an estimate source', sourcePath: operations[0].sourcePath });
    return { plan: normalizeOperationAsPlan(operations[0]), diagnostics };
  }

  diagnostics.push({ code: 'plan.none', severity: 'warning', message: 'No matching Skill Doctor optimization plan or operation was found; projected savings cannot be calculated' });
  return { diagnostics };
}

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableValue);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.keys(value as Record<string, unknown>).sort().map((key) => [key, stableValue((value as Record<string, unknown>)[key])]));
}

function contextInventoryFingerprint(items: OptimizationPlanResource[]): string {
  const fingerprintItems = items.filter((item) => item.id).map((item) => ({
    id: item.id,
    enabled: item.enabled,
    controllable: item.controllable === true,
    controlMethod: item.controlMethod ?? null,
    estimateStatus: item.estimateStatus ?? 'estimated',
    estimatedTokens: item.estimatedTokens ?? 0,
    estimatedChars: item.estimatedChars ?? 0,
  })).sort((left, right) => String(left.id).localeCompare(String(right.id)));
  return createHash('sha256').update(JSON.stringify(stableValue(fingerprintItems))).digest('hex');
}

export async function validateOptimizationPlan(options: { plan: OptimizationPlan; projectDir: string; homeDir?: string }): Promise<OptimizationPlanValidation> {
  const planFingerprint = options.plan.inventoryFingerprint;
  if (!planFingerprint) return { status: 'not_available', message: 'The optimization plan has no inventory fingerprint' };
  try {
    const allowedResources = ['skill', 'plugin', 'mcp'] as const;
    const declaredResources = options.plan.coverage?.resources;
    const resources = Array.isArray(declaredResources)
      ? allowedResources.filter((resource) => declaredResources.includes(resource))
      : allowedResources;
    if (resources.length === 0 || (Array.isArray(declaredResources) && declaredResources.some((resource) => !resources.includes(resource)))) {
      return { status: 'unknown', planFingerprint, message: 'The plan declares an unsupported inventory resource scope' };
    }
    const scope = options.plan.scope === 'project' || options.plan.scope === 'global' ? options.plan.scope : 'all';
    const items = [] as OptimizationPlanResource[];
    for (const resource of resources) {
      const entries = await scanCodexContextEntries(options.projectDir, {
        homeDir: options.homeDir,
        resource,
        includeDisabled: true,
        discoverMcpTools: false,
      });
      const result = estimateContextCost(entries, { projectPath: options.projectDir, scope });
      items.push(...result.items.map((item) => ({ ...item, enabled: item.enabled ?? true })), ...(result.disabledItems ?? []).map((item) => ({ ...item, enabled: item.enabled ?? false })));
    }
    const currentFingerprint = contextInventoryFingerprint([...new Map(items.filter((item) => item.id).map((item) => [item.id, item])).values()]);
    return currentFingerprint === planFingerprint
      ? { status: 'matched', planFingerprint, currentFingerprint, message: 'Current Codex context inventory matches the optimization plan snapshot' }
      : { status: 'mismatch', planFingerprint, currentFingerprint, message: 'Current Codex context inventory differs from the optimization plan snapshot' };
  } catch (error) {
    return { status: 'unknown', planFingerprint, message: `Unable to verify current context inventory: ${error instanceof Error ? error.message : String(error)}` };
  }
}

export function getPlanFixedEstimate(plan: OptimizationPlan): { savingsTokens?: number; baselineTokens?: number; rate?: number; reason?: string } {
  const savings = plan.estimate?.fixedEstimatedTokens;
  const baseline = plan.baseline?.totalEstimatedTokens;
  if (typeof savings === 'number' && Number.isFinite(savings) && typeof baseline === 'number' && Number.isFinite(baseline) && baseline > 0) {
    return {
      savingsTokens: savings,
      baselineTokens: baseline,
      rate: savings / baseline,
    };
  }
  const before = plan.baseline?.totalEstimatedTokens;
  const after = plan.estimate?.estimatedAfterTokens;
  if (typeof before === 'number' && typeof after === 'number' && before > 0 && after >= 0) {
    return {
      savingsTokens: before - after,
      baselineTokens: before,
      rate: (before - after) / before,
    };
  }
  return { reason: 'Plan does not contain a valid before/after static estimate' };
}
