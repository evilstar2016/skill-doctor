import type { DiffResult } from '../diff/types';
import { zhMessage } from '../i18n';

const useColor = process.stdout.isTTY === true;
const bold = (s: string) => (useColor ? `\x1b[1m${s}\x1b[0m` : s);
const cyan = (s: string) => (useColor ? `\x1b[36m${s}\x1b[0m` : s);
const green = (s: string) => (useColor ? `\x1b[32m${s}\x1b[0m` : s);
const gray = (s: string) => (useColor ? `\x1b[90m${s}\x1b[0m` : s);
const yellow = (s: string) => (useColor ? `\x1b[33m${s}\x1b[0m` : s);

const LINE_WIDTH = 60;

function rule(char = '─'): string {
  return char.repeat(LINE_WIDTH);
}

function section(title: string): string {
  return cyan(`── ${title} `) + cyan(rule('─').slice(title.length + 4));
}

export function renderDiff(result: DiffResult): string {
  const lines: string[] = [];
  const { skillA, skillB, analysis } = result;

  lines.push(bold(`┌${'─'.repeat(LINE_WIDTH - 2)}┐`));
  lines.push(bold(`│  Skill Diff: ${skillA.name}  vs  ${skillB.name}`));
  lines.push(bold(`└${'─'.repeat(LINE_WIDTH - 2)}┘`));
  lines.push('');

  if (!analysis) {
    lines.push(yellow('⚠  LLM analysis unavailable — showing extracted fields only.'));
    lines.push('');
    lines.push(section(zhMessage('cli.triggerConditions')));
    lines.push(`  ${skillA.name.padEnd(28)} ${skillA.whenToUse || skillA.triggers[0] || '—'}`);
    lines.push(`  ${skillB.name.padEnd(28)} ${skillB.whenToUse || skillB.triggers[0] || '—'}`);
    return lines.join('\n');
  }

  lines.push(section(zhMessage('cli.triggerConditions')));
  lines.push(`  ${bold(skillA.name.padEnd(28))} ${analysis.triggerComparison.split('。')[0] || skillA.whenToUse || '—'}`);
  lines.push(`  ${bold(skillB.name.padEnd(28))} ${skillB.whenToUse || skillB.triggers[0] || '—'}`);
  lines.push('');

  lines.push(section(zhMessage('cli.coverage')));
  if (analysis.coverageOverlap.length > 0) {
    lines.push(`  ${gray(zhMessage('cli.sharedCoverage'))}   ${analysis.coverageOverlap.join('、')}`);
  }
  if (analysis.coverageOnlyA.length > 0) {
    lines.push(`  ${gray(zhMessage('cli.only', { name: skillA.name }))}   ${analysis.coverageOnlyA.join('、')}`);
  }
  if (analysis.coverageOnlyB.length > 0) {
    lines.push(`  ${gray(zhMessage('cli.only', { name: skillB.name }))}   ${analysis.coverageOnlyB.join('、')}`);
  }
  lines.push('');

  lines.push(section(zhMessage('cli.prosCons')));
  lines.push(`  ${bold(skillA.name)}`);
  for (const p of analysis.prosConsA.pros) lines.push(`    ${green('+')} ${p}`);
  for (const c of analysis.prosConsA.cons) lines.push(`    ${gray('-')} ${c}`);
  lines.push('');
  lines.push(`  ${bold(skillB.name)}`);
  for (const p of analysis.prosConsB.pros) lines.push(`    ${green('+')} ${p}`);
  for (const c of analysis.prosConsB.cons) lines.push(`    ${gray('-')} ${c}`);
  lines.push('');

  lines.push(section(zhMessage('cli.advice')));
  for (const advice of analysis.situationalAdvice) {
    const rec = advice.recommendation === 'A' ? bold(skillA.name) : advice.recommendation === 'B' ? bold(skillB.name) : bold(zhMessage('cli.either'));
    lines.push(`  ${advice.condition.padEnd(32)} → ${zhMessage('cli.choose', { name: rec })}`);
    if (advice.reason) lines.push(`    ${gray(advice.reason)}`);
  }

  return lines.join('\n');
}
