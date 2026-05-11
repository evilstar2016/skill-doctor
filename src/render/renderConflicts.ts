import type { ConflictPair } from '../types/skill';

export function renderConflicts(pairs: ConflictPair[]): string {
  if (pairs.length === 0) {
    return 'CONFLICTS\nNo conflicts found.';
  }

  const duplicates = pairs.filter((pair) => pair.kind === 'duplicate');
  const conflicts = pairs.filter((pair) => pair.kind === 'conflict');

  const sections: string[] = [];

  if (duplicates.length > 0) {
    sections.push([
      'DUPLICATES',
      ...duplicates.map((pair) =>
        [
          `${pair.a.name}`,
          `severity: ${pair.severity}`,
          `left: ${pair.a.sourcePath}`,
          `right: ${pair.b.sourcePath}`,
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
          `similarity: ${pair.similarity.toFixed(2)}`,
          `shared: ${pair.sharedTokens.join(', ')}`,
        ].join('\n'),
      ),
    ].join('\n\n'));
  }

  return sections.join('\n\n');
}