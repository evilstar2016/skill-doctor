import { basename, extname, isAbsolute, relative, resolve } from 'node:path';

import type {
  BenefitPlanCoverage,
  BenefitPlanResourceMatch,
  CodexContextBlockSnapshot,
  CodexContextStateSnapshot,
  CodexSessionScanResult,
  CodexSessionSelection,
  CodexUsageRecord,
  OptimizationPlan,
  OptimizationPlanResource,
} from './types';
import type { CodexContextBlockId } from '../types/context';
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

export function isContextBlockResource(resource: OptimizationPlanResource): boolean {
  return resource.resource === 'context-block'
    || resource.kind?.toLowerCase().includes('context-block') === true
    || Boolean(resource.blockId);
}

export function contextBlockIdForResource(resource: OptimizationPlanResource): CodexContextBlockId | undefined {
  if (resource.blockId) return resource.blockId;
  const value = resource.id ?? resource.name ?? resource.kind;
  if (!value) return undefined;
  const normalized = value
    .replace(/^codex:context-block:/, '')
    .replace(/^<|>$/g, '')
    .replace(/-/g, '_');
  const ids: CodexContextBlockId[] = [
    'skills_instructions',
    'recommended_plugins',
    'permissions_instructions',
    'collaboration_mode',
    'apps_instructions',
    'plugins_instructions',
    'environment_context',
    'app_context',
  ];
  return ids.includes(normalized as CodexContextBlockId) ? normalized as CodexContextBlockId : undefined;
}

function contextBlockForSnapshot(snapshot: CodexContextStateSnapshot, id: CodexContextBlockId): CodexContextBlockSnapshot | undefined {
  return snapshot.contextBlocks?.find((block) => block.id === id);
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
  const text = snapshot.hostSkillsText ?? contextBlockForSnapshot(snapshot, 'skills_instructions')?.text ?? '';
  const catalogBlock = contextBlockForSnapshot(snapshot, 'skills_instructions');
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
      && catalogBlock?.complete !== false
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
    ...(resource.controlStatus ? { controlStatus: resource.controlStatus } : {}),
    ...(resource.requiresNewSession !== undefined ? { requiresNewSession: resource.requiresNewSession } : {}),
    ...(resource.blockId ? { blockId: resource.blockId } : {}),
    ...(resource.rootAlias ? { rootAlias: resource.rootAlias } : {}),
    ...(resource.estimatedTokens !== undefined ? { estimatedTokens: resource.estimatedTokens } : {}),
    ...(resource.estimatedChars !== undefined ? { estimatedChars: resource.estimatedChars } : {}),
    ...(resource.activationEstimatedTokens !== undefined ? { activationEstimatedTokens: resource.activationEstimatedTokens } : {}),
    ...(resource.estimateStatus ? { estimateStatus: resource.estimateStatus } : {}),
  };
  if (!snapshot) return { ...base, status: 'unknown', reason: 'No historical world_state snapshot was associated with this response' };

  if (isContextBlockResource(resource)) {
    const blockId = contextBlockIdForResource(resource);
    const block = blockId ? contextBlockForSnapshot(snapshot, blockId) : undefined;
    if (!blockId) return { ...base, status: 'unknown', reason: 'The context-block resource does not identify a supported block' };
    if (!block) return { ...base, status: 'unknown', reason: `Historical context did not expose a ${blockId} block` };
    if (!block.complete) return { ...base, status: 'unknown', reason: `Historical ${blockId} block was truncated or incomplete` };
    if (!block.text) return { ...base, status: 'unknown', reason: `Historical ${blockId} block metadata was retained without its text` };
    if (resource.enabled === true) return { ...base, status: 'unknown', reason: `Enabling historical ${blockId} blocks is not reconstructed` };
    return {
      ...base,
      blockId,
      ...(block.evidenceLevel ? { evidenceLevel: block.evidenceLevel } : {}),
      status: 'matched',
      historicalState: 'before',
      reason: `Historical context contains a complete ${blockId} block`,
    };
  }

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
    const skillCatalog = contextBlockForSnapshot(snapshot, 'skills_instructions');
    if (!snapshot.hostSkillsText && snapshot.hostSkillsTextChars === undefined && !skillCatalog?.text) {
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
  const match = line.match(/^\s*-\s+(.+?):(?:\s|$)/);
  return match?.[1]?.trim().toLowerCase();
}

interface HistoricalCatalogReconstruction {
  beforeText: string;
  afterText: string;
  afterByResource: Map<string, string>;
  matchedResourceIds: string[];
}

function reconstructHistoricalSkillCatalog(
  resources: OptimizationPlanResource[],
  snapshot: CodexContextStateSnapshot,
  _inventory: OptimizationPlanResource[] | undefined,
): HistoricalCatalogReconstruction | { reason: string } {
  const catalogBlock = contextBlockForSnapshot(snapshot, 'skills_instructions');
  const text = snapshot.hostSkillsText ?? catalogBlock?.text;
  if (!text) return { reason: 'Historical Skill catalog text was not available' };
  const list = historicalSkillList(snapshot);
  if (!list.structured || !list.complete || list.duplicateNames.length > 0) {
    return { reason: 'Historical Skill catalog was truncated, duplicated, or not structured enough to reproduce the runtime visible list' };
  }

  const usedLines = new Set<number>();
  const matchedResourceIds: string[] = [];
  const lineByResource = new Map<string, number>();
  for (const resource of resources) {
    const resourceId = resourceIdentity(resource);
    const terms = resourceTerms(resource);
    const lineIndex = list.entries.find((entry) => !usedLines.has(entry.index) && terms.includes(entry.name))?.index ?? -1;
    if (lineIndex < 0) return { reason: `The historical Skill catalog did not expose a uniquely removable line for ${resourceId}` };
    usedLines.add(lineIndex);
    lineByResource.set(resourceId, lineIndex);
    matchedResourceIds.push(resourceId);
  }

  const aliases = list.lines.flatMap((line, index) => {
    const match = line.match(/^\s*-\s+`([^`]+)`\s*=\s*`([^`]+)`\s*$/);
    return match ? [{ index, alias: match[1], path: match[2] }] : [];
  });
  if (catalogBlock || aliases.length > 0) {
    for (const alias of aliases) {
      const selectedForAlias = resources.filter((resource) => resource.rootAlias === alias.alias || (resource.sourcePath && pathWithin(alias.path, resource.sourcePath)));
      if (selectedForAlias.length === 0) continue;
      const retainedForAlias = list.entries.some((entry) => !usedLines.has(entry.index)
        && (!/\(file:/.test(list.lines[entry.index]) || list.lines[entry.index].includes(`(file: ${alias.alias}/`) || list.lines[entry.index].includes(`(file: ${alias.path}/`)));
      if (!retainedForAlias) usedLines.add(alias.index);
    }
  }

  const afterText = list.lines.filter((_line, index) => !usedLines.has(index)).join('\n');
  const afterByResource = new Map<string, string>();
  for (const resource of resources) {
    const resourceId = resourceIdentity(resource);
    const lineIndex = lineByResource.get(resourceId);
    const resourceUsedLines = new Set<number>(lineIndex === undefined ? [] : [lineIndex]);
    for (const alias of aliases) {
      const selectedForAlias = resources.filter((candidate) => candidate.rootAlias === alias.alias || (candidate.sourcePath && pathWithin(alias.path, candidate.sourcePath)));
      if (!selectedForAlias.some((candidate) => resourceIdentity(candidate) === resourceId)) continue;
      const retainedForAlias = list.entries.some((entry) => entry.index !== lineIndex
        && (!/\(file:/.test(list.lines[entry.index]) || list.lines[entry.index].includes(`(file: ${alias.alias}/`) || list.lines[entry.index].includes(`(file: ${alias.path}/`)));
      if (!retainedForAlias) resourceUsedLines.add(alias.index);
    }
    afterByResource.set(resourceId, list.lines.filter((_line, index) => !resourceUsedLines.has(index)).join('\n'));
  }
  return { beforeText: text, afterText, afterByResource, matchedResourceIds };
}

export function reconstructHistoricalContext(
  resources: OptimizationPlanResource[],
  snapshot: CodexContextStateSnapshot | undefined,
  tokenCounter: TokenCounter,
  options: { inventory?: OptimizationPlanResource[] } = {},
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

  const contextBlockResources = resources.filter(isContextBlockResource);
  const skillResources = resources.filter(isSkillResource);
  if (contextBlockResources.length > 0) {
    if (resources.some((resource) => !isContextBlockResource(resource) && !isSkillResource(resource))) {
      return { status: 'unknown', matchedResourceIds: [], reason: 'The plan contains a context block resource type without a safe historical text reconstruction' };
    }
    const catalog = skillResources.length > 0
      ? reconstructHistoricalSkillCatalog(skillResources, snapshot, options.inventory)
      : undefined;
    if (catalog && 'reason' in catalog) return { status: 'unknown', matchedResourceIds: [], reason: catalog.reason };
    const blockParts = contextBlockResources.map((resource) => {
      const id = contextBlockIdForResource(resource);
      const block = id ? contextBlockForSnapshot(snapshot, id) : undefined;
      return { resource, resourceId: resourceIdentity(resource), block };
    });
    const missing = blockParts.find((part) => !part.block?.text || part.block.complete !== true || part.resource.enabled === true);
    if (missing) {
      return {
        status: 'unknown',
        matchedResourceIds: [],
        reason: missing.resource.enabled === true
          ? `Enabling historical ${contextBlockIdForResource(missing.resource) ?? 'context'} blocks is not reconstructed`
          : `Historical ${contextBlockIdForResource(missing.resource) ?? 'context'} block was not complete or did not retain text`,
      };
    }
    const beforeParts = [
      ...(catalog ? [catalog.beforeText] : []),
      ...blockParts.map((part) => part.block!.text!),
    ];
    const beforeText = beforeParts.join('\n');
    const allAfterText = catalog?.afterText ?? '';
    const combinedBeforeTokens = tokenCounter.count(beforeText);
    const combinedAfterTokens = tokenCounter.count(allAfterText);
    const inputSavings = combinedBeforeTokens - combinedAfterTokens;
    if (inputSavings < 0) return { status: 'unknown', matchedResourceIds: [], reason: 'Reconstructed context increased Token count and was not applied' };
    const contributions = [
      ...(catalog ? catalog.matchedResourceIds.map((resourceId) => ({
        resourceId,
        inputSavings: combinedBeforeTokens - tokenCounter.count([
          catalog.afterByResource.get(resourceId) ?? catalog.beforeText,
          ...blockParts.map((part) => part.block!.text!),
        ].join('\n')),
      })) : []),
      ...blockParts.map((part) => ({
        resourceId: part.resourceId,
        inputSavings: combinedBeforeTokens - tokenCounter.count([
          ...(catalog ? [catalog.beforeText] : []),
          ...blockParts.filter((candidate) => candidate.resourceId !== part.resourceId).map((candidate) => candidate.block!.text!),
        ].join('\n')),
      })),
    ];
    const matchedResourceIds = [...(catalog?.matchedResourceIds ?? []), ...blockParts.map((part) => part.resourceId)];
    const contributionSum = contributions.reduce((sum, contribution) => sum + contribution.inputSavings, 0);
    return {
      status: 'estimated',
      beforeTokens: combinedBeforeTokens,
      afterTokens: combinedAfterTokens,
      inputSavings,
      matchedResourceIds,
      contributions,
      interactionTokens: inputSavings - contributionSum,
    };
  }

  if ((!snapshot.hostSkillsText && !contextBlockForSnapshot(snapshot, 'skills_instructions')?.text)
    || resources.some((resource) => !isSkillResource(resource))) {
    return { status: 'unknown', matchedResourceIds: [], reason: 'The plan contains resource types whose visible text cannot be safely reconstructed' };
  }

  const catalog = reconstructHistoricalSkillCatalog(resources, snapshot, options.inventory);
  if ('reason' in catalog) {
    return { status: 'unknown', matchedResourceIds: [], reason: catalog.reason };
  }
  const beforeTokens = tokenCounter.count(catalog.beforeText);
  const afterTokens = tokenCounter.count(catalog.afterText);
  const inputSavings = beforeTokens - afterTokens;
  if (inputSavings < 0) {
    return { status: 'unknown', matchedResourceIds: catalog.matchedResourceIds, reason: 'Reconstructed context increased Token count and was not applied' };
  }
  const contributions = catalog.matchedResourceIds.map((resourceId) => ({
    resourceId,
    inputSavings: beforeTokens - tokenCounter.count(catalog.afterByResource.get(resourceId) ?? catalog.beforeText),
  }));
  const contributionSum = contributions.reduce((sum, contribution) => sum + contribution.inputSavings, 0);
  return {
    status: 'estimated',
    beforeTokens,
    afterTokens,
    inputSavings,
    matchedResourceIds: catalog.matchedResourceIds,
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
  const snapshots = getContextSnapshotsForResponse(selection, record);
  return snapshots.length > 0 ? mergeContextSnapshots(snapshots) : undefined;
}

export function getContextSnapshotsForResponse(
  selection: CodexSessionSelection,
  record: CodexUsageRecord,
): CodexContextStateSnapshot[] {
  const analysis = selection.associatedFiles.find((candidate) => candidate.meta?.filePath === record.sourcePath)
    ?? selection.associatedFiles.find((candidate) => candidate.meta?.threadId === record.threadId);
  if (!analysis) return [];
  const lines = record.contextSnapshotLines ?? (record.contextSnapshotLine === undefined ? [] : [record.contextSnapshotLine]);
  if (lines.length === 0) return [];
  const lineSet = new Set(lines);
  return analysis.contextSnapshots.filter((snapshot) => lineSet.has(snapshot.line));
}

function mergeContextSnapshots(snapshots: CodexContextStateSnapshot[]): CodexContextStateSnapshot {
  const ordered = [...snapshots].sort((left, right) => left.line - right.line);
  const latest = ordered.at(-1)!;
  const blocks = new Map<string, CodexContextBlockSnapshot>();
  const stateKeys = new Set<string>();
  for (const snapshot of ordered) {
    for (const key of snapshot.stateKeys ?? []) stateKeys.add(key);
    for (const block of snapshot.contextBlocks ?? []) blocks.set(block.id, block);
  }
  const merged: CodexContextStateSnapshot = {
    ...latest,
    ...(stateKeys.size > 0 ? { stateKeys: [...stateKeys].sort() } : {}),
    ...(blocks.size > 0 ? { contextBlocks: [...blocks.values()] } : {}),
    ...(blocks.size > 0 ? { contextBlocksComplete: [...blocks.values()].every((block) => block.complete) } : {}),
  };
  for (const snapshot of ordered) {
    if (snapshot.agentsText !== undefined) merged.agentsText = snapshot.agentsText;
    if (snapshot.agentsDirectory !== undefined) merged.agentsDirectory = snapshot.agentsDirectory;
    if (snapshot.agentsTextChars !== undefined) merged.agentsTextChars = snapshot.agentsTextChars;
    if (snapshot.agentsTruncated !== undefined) merged.agentsTruncated = snapshot.agentsTruncated;
    if (snapshot.agentsComplete !== undefined) merged.agentsComplete = snapshot.agentsComplete;
    if (snapshot.hostSkillsText !== undefined) merged.hostSkillsText = snapshot.hostSkillsText;
    if (snapshot.hostSkillsTextChars !== undefined) merged.hostSkillsTextChars = snapshot.hostSkillsTextChars;
    if (snapshot.hostSkillsTruncated !== undefined) merged.hostSkillsTruncated = snapshot.hostSkillsTruncated;
    if (snapshot.hostSkillsComplete !== undefined) merged.hostSkillsComplete = snapshot.hostSkillsComplete;
  }
  return merged;
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
