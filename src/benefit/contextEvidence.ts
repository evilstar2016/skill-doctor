import { basename, extname, isAbsolute, relative, resolve } from 'node:path';

import type {
  BenefitPlanCoverage,
  BenefitPlanResourceMatch,
  CodexContextStateSnapshot,
  CodexSessionScanResult,
  CodexSessionSelection,
  CodexUsageRecord,
  OptimizationPlan,
  OptimizationPlanResource,
} from './types';
import type { TokenCounter } from '../context/tokenCounter';

function pathWithin(root: string, candidate: string): boolean {
  const rel = relative(resolve(root), resolve(candidate));
  return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel));
}

function resourceKey(resource: OptimizationPlanResource): string {
  return resource.id ?? resource.sourcePath ?? resource.name ?? `${resource.resource ?? ''}:${resource.kind ?? ''}`;
}

export function planResources(plan: OptimizationPlan | undefined): OptimizationPlanResource[] {
  if (!plan) return [];
  // `items` is the inventory snapshot. Once operations are present, only the
  // operation's affected items are part of the user's simulation selection.
  const affectedItems = (plan.operations ?? []).flatMap((operation) => operation.affectedItems ?? []);
  const resources = affectedItems.length > 0 ? affectedItems : (plan.items ?? []);
  const seen = new Set<string>();
  return resources.filter((resource) => {
    const key = resourceKey(resource);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function resourceTerms(resource: OptimizationPlanResource): string[] {
  const genericTerms = new Set(['skill', 'plugin', 'mcp', 'agents', 'skill.md', 'agents.md']);
  const terms = [resource.name, resource.id];
  if (resource.sourcePath) {
    const fileName = basename(resource.sourcePath, extname(resource.sourcePath));
    terms.push(fileName, basename(resource.sourcePath));
  }
  return [...new Set(terms
    .filter((term): term is string => Boolean(term && term.trim().length >= 3))
    .map((term) => term.trim().toLowerCase())
    .filter((term) => !genericTerms.has(term)))];
}

function isAgentsResource(resource: OptimizationPlanResource): boolean {
  return resource.resource === 'agents'
    || resource.kind?.toLowerCase().includes('agents') === true
    || resource.sourcePath?.toLowerCase().endsWith('agents.md') === true;
}

function isSkillResource(resource: OptimizationPlanResource): boolean {
  const kind = resource.kind?.toLowerCase() ?? '';
  return resource.resource === 'skill' || resource.resource === 'plugin' || kind.includes('skill') || kind.includes('plugin');
}

interface HistoricalSkillList {
  lines: string[];
  entries: Array<{ index: number; name: string }>;
  duplicateNames: string[];
  structured: boolean;
  complete: boolean;
}

function hasTruncationMarker(text: string): boolean {
  return text.split(/\r?\n/).some((line) => /(?:truncated|omitted|more skills|showing only|\.\.\.|…)/i.test(line));
}

function historicalSkillList(snapshot: CodexContextStateSnapshot): HistoricalSkillList {
  const text = snapshot.hostSkillsText ?? '';
  const lines = text.split(/\r?\n/);
  const entries = lines.flatMap((line, index) => {
    const name = skillListEntryName(line);
    return name ? [{ index, name }] : [];
  });
  const counts = new Map<string, number>();
  for (const entry of entries) counts.set(entry.name, (counts.get(entry.name) ?? 0) + 1);
  return {
    lines,
    entries,
    duplicateNames: [...counts.entries()].filter(([, count]) => count > 1).map(([name]) => name),
    structured: entries.length > 0,
    complete: snapshot.hostSkillsTruncated !== true
      && snapshot.hostSkillsComplete !== false
      && !hasTruncationMarker(text),
  };
}

function historicalAgentsTextIsComplete(snapshot: CodexContextStateSnapshot): boolean {
  return snapshot.agentsTruncated !== true
    && snapshot.agentsComplete !== false
    && !hasTruncationMarker(snapshot.agentsText ?? '');
}

function matchResource(resource: OptimizationPlanResource, snapshot: CodexContextStateSnapshot | undefined): BenefitPlanResourceMatch {
  const base = {
    ...(resource.id ? { id: resource.id } : {}),
    ...(resource.name ? { name: resource.name } : {}),
    ...(resource.resource ? { resource: resource.resource } : {}),
    ...(resource.sourcePath ? { sourcePath: resource.sourcePath } : {}),
    ...(resource.kind ? { kind: resource.kind } : {}),
    ...(resource.scope ? { scope: resource.scope } : {}),
    ...(resource.enabled !== undefined ? { enabled: resource.enabled } : {}),
    ...(resource.controllable !== undefined ? { controllable: resource.controllable } : {}),
    ...(resource.controlMethod ? { controlMethod: resource.controlMethod } : {}),
    ...(resource.requiresNewSession !== undefined ? { requiresNewSession: resource.requiresNewSession } : {}),
    ...(resource.estimatedTokens !== undefined ? { estimatedTokens: resource.estimatedTokens } : {}),
    ...(resource.estimatedChars !== undefined ? { estimatedChars: resource.estimatedChars } : {}),
    ...(resource.activationEstimatedTokens !== undefined ? { activationEstimatedTokens: resource.activationEstimatedTokens } : {}),
    ...(resource.estimateStatus ? { estimateStatus: resource.estimateStatus } : {}),
  };
  if (!snapshot) return { ...base, status: 'unknown', reason: 'No historical world_state snapshot was associated with this response' };

  if (isAgentsResource(resource)) {
    if (resource.sourcePath && snapshot.agentsDirectory && pathWithin(snapshot.agentsDirectory, resource.sourcePath)) {
      return { ...base, status: 'matched', reason: 'Historical agents directory covers the planned resource' };
    }
    if (snapshot.agentsText && resourceTerms(resource).some((term) => snapshot.agentsText!.toLowerCase().includes(term))) {
      return { ...base, status: 'matched', reason: 'Historical AGENTS text contains the planned resource marker' };
    }
    if (snapshot.agentsTextChars !== undefined || snapshot.agentsDirectory) {
      return { ...base, status: 'unknown', reason: 'Historical AGENTS state exists but does not expose enough path/text detail for an exact match' };
    }
    return { ...base, status: 'unknown', reason: 'Historical AGENTS text was not available' };
  }

  if (isSkillResource(resource)) {
    if (!snapshot.hostSkillsText && snapshot.hostSkillsTextChars === undefined) {
      return { ...base, status: 'unknown', reason: 'Historical host skill text was not available' };
    }
    const list = historicalSkillList(snapshot);
    const terms = resourceTerms(resource);
    const exactEntries = list.entries.filter((entry) => terms.includes(entry.name));
    if (exactEntries.length > 0) {
      return { ...base, status: 'matched', historicalState: 'before', reason: 'Historical structured host skill list contains the planned resource entry' };
    }
    if (snapshot.hostSkillsText && terms.some((term) => snapshot.hostSkillsText!.toLowerCase().includes(term))) {
      return { ...base, status: 'matched', historicalState: 'before', reason: 'Historical host skill text contains the planned resource marker' };
    }
    if (resource.enabled === false && list.structured && list.complete && list.duplicateNames.length === 0) {
      return { ...base, status: 'matched', historicalState: 'after', reason: 'Historical structured skill list does not contain the disabled planned resource; it is treated as already optimized' };
    }
    if (resource.enabled === false && list.structured && !list.complete) {
      return { ...base, status: 'unknown', reason: 'Historical host skill list is truncated or incomplete, so absence cannot prove the disabled resource was removed' };
    }
    if (snapshot.hostSkillsText) {
      return { ...base, status: 'mismatch', reason: 'The planned resource marker was not present in this historical host skill snapshot' };
    }
    return { ...base, status: 'unknown', reason: 'Indexed snapshot retained only metadata, not host skill text' };
  }

  return { ...base, status: 'unknown', reason: 'This resource type has no safe historical text matcher yet' };
}

export interface HistoricalContextReconstruction {
  status: 'estimated' | 'unknown';
  beforeTokens?: number;
  afterTokens?: number;
  inputSavings?: number;
  matchedResourceIds: string[];
  contributions?: Array<{
    resourceId: string;
    inputSavings: number;
  }>;
  interactionTokens?: number;
  reason?: string;
}

function resourceIdentity(resource: OptimizationPlanResource): string {
  return resource.id ?? resource.sourcePath ?? resource.name ?? resource.resource ?? 'unknown-resource';
}

function skillListEntryName(line: string): string | undefined {
  const match = line.match(/^\s*-\s+([^:]+):(?:\s|$)/);
  return match?.[1]?.trim().toLowerCase();
}

export function reconstructHistoricalContext(
  resources: OptimizationPlanResource[],
  snapshot: CodexContextStateSnapshot | undefined,
  tokenCounter: TokenCounter,
): HistoricalContextReconstruction {
  if (!snapshot || resources.length === 0) {
    return { status: 'unknown', matchedResourceIds: [], reason: 'Historical context text was not available for safe reconstruction' };
  }
  if (resources.length === 1 && isAgentsResource(resources[0])) {
    const resource = resources[0];
    if (!snapshot.agentsText || !historicalAgentsTextIsComplete(snapshot) || resource.enabled !== false || !resource.sourcePath || !snapshot.agentsDirectory || !pathWithin(snapshot.agentsDirectory, resource.sourcePath)) {
      return { status: 'unknown', matchedResourceIds: [], reason: 'Historical AGENTS text was not safely mapped to a disabled planned file' };
    }
    const beforeTokens = tokenCounter.count(snapshot.agentsText);
    const afterTokens = tokenCounter.count('');
    return {
      status: 'estimated',
      beforeTokens,
      afterTokens,
      inputSavings: beforeTokens - afterTokens,
      matchedResourceIds: [resourceIdentity(resource)],
      contributions: [{ resourceId: resourceIdentity(resource), inputSavings: beforeTokens - afterTokens }],
      interactionTokens: 0,
    };
  }
  if (!snapshot.hostSkillsText || resources.some((resource) => !isSkillResource(resource))) {
    return { status: 'unknown', matchedResourceIds: [], reason: 'The plan contains resource types whose visible text cannot be safely reconstructed' };
  }

  const list = historicalSkillList(snapshot);
  if (!list.structured || !list.complete || list.duplicateNames.length > 0) {
    return { status: 'unknown', matchedResourceIds: [], reason: 'Historical host skill list was truncated, duplicated, or not structured enough to reproduce the runtime visible list' };
  }
  const lines = list.lines;
  const usedLines = new Set<number>();
  const lineResources = new Map<number, string>();
  const matchedResourceIds: string[] = [];
  for (const resource of resources) {
    const terms = resourceTerms(resource);
    const lineIndex = list.entries.find((entry) => !usedLines.has(entry.index) && terms.includes(entry.name))?.index ?? -1;
    if (lineIndex < 0) {
      return {
        status: 'unknown',
        matchedResourceIds,
        reason: `The historical host skill list did not expose a uniquely removable line for ${resourceIdentity(resource)}`,
      };
    }
    usedLines.add(lineIndex);
    const resourceId = resourceIdentity(resource);
    lineResources.set(lineIndex, resourceId);
    matchedResourceIds.push(resourceId);
  }

  const beforeTokens = tokenCounter.count(snapshot.hostSkillsText);
  const afterText = lines.filter((_line, index) => !usedLines.has(index)).join('\n');
  const afterTokens = tokenCounter.count(afterText);
  const inputSavings = beforeTokens - afterTokens;
  if (inputSavings < 0) {
    return { status: 'unknown', matchedResourceIds, reason: 'Reconstructed context increased Token count and was not applied' };
  }
  const contributions = [...lineResources.entries()].map(([lineIndex, resourceId]) => ({
    resourceId,
    inputSavings: beforeTokens - tokenCounter.count(lines.filter((_line, index) => index !== lineIndex).join('\n')),
  }));
  const contributionSum = contributions.reduce((sum, contribution) => sum + contribution.inputSavings, 0);
  return {
    status: 'estimated',
    beforeTokens,
    afterTokens,
    inputSavings,
    matchedResourceIds,
    contributions,
    interactionTokens: inputSavings - contributionSum,
  };
}

export function matchPlanResourcesToSnapshot(
  resources: OptimizationPlanResource[],
  snapshot: CodexContextStateSnapshot | undefined,
): BenefitPlanResourceMatch[] {
  return resources.map((resource) => matchResource(resource, snapshot));
}

export function buildBenefitPlanCoverage(
  scan: CodexSessionScanResult,
  plan: OptimizationPlan | undefined,
): BenefitPlanCoverage {
  const snapshots = scan.selected.flatMap((selection) => selection.associatedFiles.flatMap((analysis) => analysis.contextSnapshots));
  const resources = planResources(plan);
  if (!plan) {
    return {
      status: 'not_applicable',
      inventoryStatus: 'not_available',
      historicalSnapshotCount: snapshots.length,
      matchedResourceCount: 0,
      unknownResourceCount: 0,
      mismatchResourceCount: 0,
      alreadyOptimizedResourceCount: 0,
      alreadyOptimizedResponseCount: 0,
      resources: [],
    };
  }
  if (resources.length === 0) {
    return {
      status: 'static_only',
      inventoryStatus: 'not_available',
      historicalSnapshotCount: snapshots.length,
      matchedResourceCount: 0,
      unknownResourceCount: 0,
      mismatchResourceCount: 0,
      alreadyOptimizedResourceCount: 0,
      alreadyOptimizedResponseCount: 0,
      resources: [],
    };
  }

  const matches = resources.map((resource) => {
    const candidates = snapshots.map((snapshot) => matchResource(resource, snapshot));
    const matched = candidates.find((candidate) => candidate.status === 'matched');
    if (matched) return matched;
    const mismatch = candidates.find((candidate) => candidate.status === 'mismatch');
    if (mismatch) return mismatch;
    return candidates[0] ?? matchResource(resource, undefined);
  });
  const matchedResourceCount = matches.filter((match) => match.status === 'matched').length;
  const mismatchResourceCount = matches.filter((match) => match.status === 'mismatch').length;
  const unknownResourceCount = matches.filter((match) => match.status === 'unknown').length;
  const alreadyOptimizedResourceCount = matches.filter((match) => match.historicalState === 'after').length;
  const status = matchedResourceCount === resources.length
    ? 'matched'
    : matchedResourceCount > 0
      ? 'partial'
      : 'unknown';
  return {
    status,
    inventoryStatus: 'not_available',
    historicalSnapshotCount: snapshots.length,
    matchedResourceCount,
    unknownResourceCount,
    mismatchResourceCount,
    alreadyOptimizedResourceCount,
    alreadyOptimizedResponseCount: 0,
    resources: matches,
  };
}

export function getContextSnapshotForResponse(
  selection: CodexSessionSelection,
  record: CodexUsageRecord,
): CodexContextStateSnapshot | undefined {
  const analysis = selection.associatedFiles.find((candidate) => candidate.meta?.threadId === record.threadId);
  if (!analysis) return undefined;
  if (record.contextSnapshotLine === undefined) return undefined;
  return analysis.contextSnapshots.find((snapshot) => snapshot.line === record.contextSnapshotLine);
}

export function responseMatchesPlan(
  plan: OptimizationPlan | undefined,
  selection: CodexSessionSelection,
  record: CodexUsageRecord,
): { matched: boolean; alreadyOptimized?: boolean; snapshot?: CodexContextStateSnapshot; matches?: BenefitPlanResourceMatch[]; matchedResources?: OptimizationPlanResource[]; reason?: string } {
  const resources = planResources(plan);
  if (resources.length === 0) return { matched: true, matches: [], reason: 'No per-resource plan inventory was available; using static plan estimate' };
  const snapshot = getContextSnapshotForResponse(selection, record);
  if (!snapshot) return { matched: false, reason: 'No historical context snapshot was associated with this response' };
  const matches = matchPlanResourcesToSnapshot(resources, snapshot);
  const matchedResources = resources.filter((_resource, index) => matches[index]?.status === 'matched' && matches[index]?.historicalState !== 'after');
  const alreadyOptimized = matches.some((match) => match.historicalState === 'after');
  if (matches.every((match) => match.status === 'matched')) return { matched: true, alreadyOptimized, snapshot, matches, matchedResources };
  const unknown = matches.find((match) => match.status === 'unknown');
  return { matched: false, alreadyOptimized, snapshot, matches, matchedResources, reason: unknown?.reason ?? matches.find((match) => match.status === 'mismatch')?.reason ?? 'Historical context did not match every planned resource' };
}
