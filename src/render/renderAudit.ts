import type { AuditResult } from '../types/audit';

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
    const badge = f.severity.toUpperCase().padEnd(4);
    const name = f.skillName.padEnd(24);
    const rule = f.ruleId.padEnd(16);
    lines.push(`${badge}  ${name}  ${rule}  ${f.summary}`);
  }

  const { high, med, low } = result.summary;
  const total = high + med + low;
  lines.push('', `${total} finding${total === 1 ? '' : 's'}  (${high} high · ${med} med · ${low} low)`);

  return lines.join('\n');
}
