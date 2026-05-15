import type { CleanupSuggestion } from '../types/cleanup';

const useColor = process.stdout.isTTY === true;
const bold = (s: string) => (useColor ? `\x1b[1m${s}\x1b[0m` : s);
const gray = (s: string) => (useColor ? `\x1b[90m${s}\x1b[0m` : s);
const green = (s: string) => (useColor ? `\x1b[32m${s}\x1b[0m` : s);
const yellow = (s: string) => (useColor ? `\x1b[33m${s}\x1b[0m` : s);

export function renderCleanup(suggestions: CleanupSuggestion[]): string {
  const lines: string[] = ['CLEANUP SUGGESTIONS'];

  if (suggestions.length === 0) {
    lines.push('No duplicate skills found.');
    return lines.join('\n');
  }

  lines.push(`${suggestions.length} suggestion${suggestions.length > 1 ? 's' : ''} found.\n`);

  for (const s of suggestions) {
    lines.push(bold(s.skillName));
    lines.push(`  ${yellow('remove:')} ${s.removePath}`);
    lines.push(`  ${green('keep:')}   ${s.keepPath}  ${gray(`(${s.keepReason})`)}`);
    lines.push('');
  }

  return lines.join('\n').trimEnd();
}
