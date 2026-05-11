import { tokenize } from '../conflicts/tokenize';
import type { GroupResult, SkillGroup } from '../types/explain';
import type { SkillRecord } from '../types/skill';

const GROUP_THRESHOLD = 0.30;

export function groupSkills(skills: SkillRecord[]): GroupResult {
  if (skills.length === 0) return { groups: [], ungrouped: [] };

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

  for (const [, indices] of clusterMap) {
    const clusterSkills = indices.map((i) => skills[i]);

    if (clusterSkills.length === 1) {
      ungrouped.push(clusterSkills[0]);
      continue;
    }

    // Label: tokens present in the most skills of the cluster
    const tokenPresence = new Map<string, number>();
    for (const idx of indices) {
      for (const token of tokenSets[idx]) {
        tokenPresence.set(token, (tokenPresence.get(token) ?? 0) + 1);
      }
    }
    const label = [...tokenPresence.entries()]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .slice(0, 3)
      .map(([token]) => token)
      .join(' · ');

    groups.push({ label, skills: clusterSkills });
  }

  groups.sort((a, b) => b.skills.length - a.skills.length);

  return { groups, ungrouped };
}
