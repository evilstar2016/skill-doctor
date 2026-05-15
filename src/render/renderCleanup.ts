import type { ConflictPair } from '../types/skill';

const useColor = process.stdout.isTTY === true;
const bold = (s: string) => (useColor ? `\x1b[1m${s}\x1b[0m` : s);

export function renderCleanup(duplicates: ConflictPair[]): string {
  const lines: string[] = ['DUPLICATE SKILLS'];

  if (duplicates.length === 0) {
    lines.push('No duplicate skills found.');
    return lines.join('\n');
  }

  lines.push(
    `${duplicates.length} duplicate${duplicates.length > 1 ? 's' : ''} found. Run with --execute to remove interactively.\n`,
  );

  for (const pair of duplicates) {
    lines.push(bold(pair.a.name));
    lines.push(`  [1] ${pair.a.sourcePath}`);
    lines.push(`  [2] ${pair.b.sourcePath}`);
    lines.push('');
  }

  return lines.join('\n').trimEnd();
}
