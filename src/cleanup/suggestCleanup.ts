import fs from 'fs';
import type { ConflictPair } from '../types/skill';
import type { CleanupSuggestion } from '../types/cleanup';

export function suggestCleanup(
  pairs: ConflictPair[],
  statFn: (path: string) => { mtime: Date } = (p) => fs.statSync(p),
): CleanupSuggestion[] {
  const duplicates = pairs.filter((p) => p.kind === 'duplicate');
  if (duplicates.length === 0) return [];

  const suggestions: CleanupSuggestion[] = [];
  const seen = new Set<string>();

  for (const pair of duplicates) {
    const key = [pair.a.sourcePath, pair.b.sourcePath].sort().join('\0');
    if (seen.has(key)) continue;
    seen.add(key);

    let aStat: { mtime: Date } | null = null;
    let bStat: { mtime: Date } | null = null;
    try { aStat = statFn(pair.a.sourcePath); } catch { /* file may not exist in tests */ }
    try { bStat = statFn(pair.b.sourcePath); } catch { /* file may not exist in tests */ }
    if (!aStat || !bStat) continue;

    const aIsNewer = aStat.mtime >= bStat.mtime;
    const keep = aIsNewer ? pair.a : pair.b;
    const remove = aIsNewer ? pair.b : pair.a;
    const keepDate = (aIsNewer ? aStat : bStat).mtime.toISOString().slice(0, 10);

    suggestions.push({
      skillName: pair.a.name,
      keepPath: keep.sourcePath,
      removePath: remove.sourcePath,
      keepReason: `newer (modified ${keepDate})`,
    });
  }

  return suggestions;
}
