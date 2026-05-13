import { tokenize } from '../conflicts/tokenize';
import { llmGroupLabels } from './llmExplain';
import { clusterKey } from './groupLabelCache';
import type { GroupLabelCache } from './groupLabelCache';
import type { LlmExplainOptions, GroupResult, SkillGroup } from '../types/explain';
import type { SkillRecord } from '../types/skill';

const GROUP_THRESHOLD = 0.30;

export interface GroupSkillsOptions {
  llmOptions?: LlmExplainOptions;
  labelCache?: GroupLabelCache;
}

export async function groupSkills(skills: SkillRecord[], options: GroupSkillsOptions = {}): Promise<GroupResult> {
  if (skills.length === 0) return { groups: [], ungrouped: [] };

  const { llmOptions, labelCache } = options;
  const n = skills.length;
  const parent = Array.from({ length: n }, (_, i) => i);

  function find(x: number): number {
    if (parent[x] !== x) parent[x] = find(parent[x]);
    return parent[x];
  }

  function union(x: number, y: number): void {
    parent[find(x)] = find(y);
  }

  const tokenSets = skills.map((s) => tokenize([s.description, ...s.triggers].join(' ')));

  for (let i = 0; i < n - 1; i++) {
    for (let j = i + 1; j < n; j++) {
      const shared = [...tokenSets[i]].filter((t) => tokenSets[j].has(t));
      const unionSize = new Set([...tokenSets[i], ...tokenSets[j]]).size;
      const similarity = unionSize === 0 ? 0 : shared.length / unionSize;
      if (similarity >= GROUP_THRESHOLD) union(i, j);
    }
  }

  const clusterMap = new Map<number, number[]>();
  for (let i = 0; i < n; i++) {
    const root = find(i);
    if (!clusterMap.has(root)) clusterMap.set(root, []);
    clusterMap.get(root)!.push(i);
  }

  const groups: SkillGroup[] = [];
  const ungrouped: SkillRecord[] = [];
  const pendingRequests: { key: string; tokenLabel: string; skills: SkillRecord[] }[] = [];
  const tokenLabels = new Map<string, string>();

  for (const [, indices] of clusterMap) {
    const clusterSkills = indices.map((i) => skills[i]);

    if (clusterSkills.length === 1) {
      ungrouped.push(clusterSkills[0]);
      continue;
    }

    // Token-based label: tokens present in the most skills of the cluster
    const tokenPresence = new Map<string, number>();
    for (const idx of indices) {
      for (const token of tokenSets[idx]) {
        tokenPresence.set(token, (tokenPresence.get(token) ?? 0) + 1);
      }
    }
    const tokenLabel = [...tokenPresence.entries()]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .slice(0, 3)
      .map(([token]) => token)
      .join(' · ');

    const key = clusterKey(clusterSkills);
    tokenLabels.set(key, tokenLabel);
    if (!labelCache?.has(key) && llmOptions) {
      pendingRequests.push({ key, tokenLabel, skills: clusterSkills });
    }

    groups.push({ label: tokenLabel, skills: clusterSkills });
  }

  const fetchedLabels = llmOptions
    ? await llmGroupLabels(pendingRequests, llmOptions)
    : new Map<string, string>();

  for (const group of groups) {
    const key = clusterKey(group.skills);
    const cachedLabel = labelCache?.get(key);
    const fetchedLabel = fetchedLabels.get(key);
    const tokenLabel = tokenLabels.get(key) ?? group.label;
    const label = cachedLabel ?? fetchedLabel ?? tokenLabel;
    group.label = label;
    if (fetchedLabel) {
      labelCache?.set(key, fetchedLabel);
    }
  }

  groups.sort((a, b) => b.skills.length - a.skills.length);

  return { groups, ungrouped };
}
