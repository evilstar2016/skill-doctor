import type { AuditResult, AuditFinding } from '../types/audit';

const useColor = process.stdout.isTTY === true;
const red = (s: string) => (useColor ? `\x1b[31m${s}\x1b[0m` : s);
const yellow = (s: string) => (useColor ? `\x1b[33m${s}\x1b[0m` : s);
const gray = (s: string) => (useColor ? `\x1b[90m${s}\x1b[0m` : s);

function colorBadge(severity: AuditFinding['severity'], text: string): string {
  if (severity === 'high') return red(text);
  if (severity === 'med') return yellow(text);
  return gray(text);
}

export function renderAudit(result: AuditResult): string {
  const lines: string[] = [];
  const plural = result.scanned === 1 ? '' : 's';
  lines.push(`Skill Safety Audit — ${result.scanned} skill${plural} scanned`);

  if (result.findings.length === 0) {
    lines.push('', 'No findings.');
    return lines.join('\n');
  }

  lines.push('');

  for (const f of result.findings) {
    const badge = colorBadge(f.severity, f.severity.toUpperCase().padEnd(4));
    const name = f.skillName.padEnd(24);
    const rule = f.ruleId.padEnd(16);
    lines.push(`${badge}  ${name}  ${rule}  ${f.summary}`);
  }

  const { high, med, low } = result.summary;
  const total = high + med + low;
  lines.push('', `${total} finding${total === 1 ? '' : 's'}  (${high} high · ${med} med · ${low} low)`);

  return lines.join('\n');
}
