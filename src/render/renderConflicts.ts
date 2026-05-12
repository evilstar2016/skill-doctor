import type { ConflictPair } from '../types/skill';

export function renderConflicts(pairs: ConflictPair[]): string {
  if (pairs.length === 0) {
    return 'CONFLICTS\nNo conflicts found.';
  }

  const duplicates = pairs.filter((pair) => pair.kind === 'duplicate');
  const conflicts = pairs.filter((pair) => pair.kind === 'conflict');

  const sections: string[] = [];

  if (duplicates.length > 0) {
    const clusters = new Map<string, Set<string>>();
    for (const pair of duplicates) {
      if (!clusters.has(pair.a.name)) clusters.set(pair.a.name, new Set());
      clusters.get(pair.a.name)!.add(pair.a.sourcePath);
      clusters.get(pair.a.name)!.add(pair.b.sourcePath);
    }

    sections.push([
      'DUPLICATES',
      ...[...clusters.entries()].map(([name, paths]) =>
        [
          `${name}  [${paths.size} copies]`,
          ...[...paths].map((p) => `  ${p}`),
        ].join('\n'),
      ),
    ].join('\n\n'));
  }

  if (conflicts.length > 0) {
    sections.push([
      'CONFLICTS',
      ...conflicts.map((pair) =>
        [
          `${pair.a.name} <-> ${pair.b.name}`,
          `severity: ${pair.severity}`,
          `method: ${pair.detectionMethod ?? 'unknown'}`,
          `similarity: ${pair.similarity.toFixed(2)}`,
          `shared: ${pair.sharedTokens.join(', ') || '—'}`,
          ...(pair.analysis ? [`summary: ${pair.analysis.summary}`] : []),
        ].join('\n'),
      ),
    ].join('\n\n'));
  }

  return sections.join('\n\n');
}