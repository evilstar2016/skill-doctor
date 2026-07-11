import { createHash } from 'node:crypto';

import type { ContextCostItem, ContextCostResult, ContextResource } from '../types/context';
import type { Platform, Scope, SkillRecord } from '../types/skill';

export function stableId(prefix: string, ...parts: Array<string | undefined>): string {
  const hash = createHash('sha256').update(parts.filter(Boolean).join('\0')).digest('hex').slice(0, 16);
  return `${prefix}:${hash}`;
}

export function filterByScope<T extends { scope: Scope }>(items: T[], scope: Scope | 'all'): T[] {
  return scope === 'all' ? items : items.filter((item) => item.scope === scope);
}

export function filterByPlatform<T extends { platform: Platform }>(items: T[], platform: Platform | null): T[] {
  return platform ? items.filter((item) => item.platform === platform) : items;
}

export function addCodexResourceGroups(result: ContextCostResult): ContextCostResult {
  const enabled = result.items.filter((item) => item.platform === 'codex' && item.resource);
  const disabled = (result.disabledItems ?? []).filter((item) => item.platform === 'codex' && item.resource);
  if (enabled.length === 0 && disabled.length === 0) return result;
  return {
    ...result,
    resources: groupContextResources(enabled),
    ...(disabled.length > 0 ? { disabledResources: groupContextResources(disabled) } : {}),
  };
}

function groupContextResources(items: ContextCostItem[]): Record<ContextResource, ContextCostItem[]> {
  const groups: Record<ContextResource, ContextCostItem[]> = { agents: [], skill: [], mcp: [], plugin: [], memory: [] };
  for (const item of items) {
    if (item.resource) groups[item.resource].push(item);
  }
  return groups;
}

export function countPlatforms(items: Array<{ platform: Platform }>): Partial<Record<Platform, number>> {
  const counts: Partial<Record<Platform, number>> = {};
  for (const item of items) counts[item.platform] = (counts[item.platform] ?? 0) + 1;
  return counts;
}

export function countScopes(items: Array<{ scope: Scope }>): Partial<Record<Scope, number>> {
  const counts: Partial<Record<Scope, number>> = {};
  for (const item of items) counts[item.scope] = (counts[item.scope] ?? 0) + 1;
  return counts;
}

export function isContextSkill(record: SkillRecord): boolean {
  return Boolean(record.context?.resource);
}

