import type { AiFinding, AuditFinding, AuditResult } from '../types/audit';

const useColor = process.stdout.isTTY === true;
const red = (s: string) => (useColor ? `\x1b[31m${s}\x1b[0m` : s);
const yellow = (s: string) => (useColor ? `\x1b[33m${s}\x1b[0m` : s);
const gray = (s: string) => (useColor ? `\x1b[90m${s}\x1b[0m` : s);
const cyan = (s: string) => (useColor ? `\x1b[36m${s}\x1b[0m` : s);

function colorBadge(severity: AuditFinding['severity'], text: string): string {
  if (severity === 'high') return red(text);
  if (severity === 'med') return yellow(text);
  return gray(text);
}

function renderRuleFinding(f: AuditFinding): string[] {
  const badge = colorBadge(f.severity, f.severity.toUpperCase().padEnd(4));
  const name = f.skillName.padEnd(24);
  const rule = f.ruleId.padEnd(16);
  return [
    `${badge}  ${name}  ${rule}  ${f.summary}`,
    `      install: ${f.provenance?.installSource ?? '—'}  scope: ${f.scope}  confidence: ${f.provenance?.confidence ?? '—'}  repo: ${f.provenance?.repository ?? '—'}  author: ${f.provenance?.author ?? '—'}`,
  ];
}

function renderAiFinding(f: AiFinding): string[] {
  const badge = colorBadge(f.severity, f.severity.toUpperCase().padEnd(4));
  const name = f.skillName.padEnd(24);
  const code = f.code.padEnd(22);
  const lines = [`${badge}  ${name}  ${cyan('[AI]')} ${code}  ${f.title}`];
  if (f.detail) lines.push(`      ${f.detail}`);
  if (f.evidence) lines.push(`      evidence: "${f.evidence}"`);
  return lines;
}

export function renderAudit(result: AuditResult): string {
  const lines: string[] = [];
  const plural = result.scanned === 1 ? '' : 's';
  lines.push(`Skill Safety Audit — ${result.scanned} skill${plural} scanned`);

  const aiFindings = result.aiFindings ?? [];
  const hasAny = result.findings.length > 0 || aiFindings.length > 0;

  if (!hasAny) {
    lines.push('', 'No findings.');
    return lines.join('\n');
  }

  lines.push('');

  for (const f of result.findings) {
    lines.push(...renderRuleFinding(f));
  }

  if (aiFindings.length > 0) {
    if (result.findings.length > 0) lines.push('');
    lines.push(gray('— AI Analysis —'));
    for (const f of aiFindings) {
      lines.push(...renderAiFinding(f));
    }
  }

  const { high, med, low } = result.summary;
  const total = high + med + low;
  const aiTotal = aiFindings.length;
  lines.push('');
  if (total > 0) {
    const label = aiTotal > 0 ? 'rule finding' : 'finding';
    lines.push(`${total} ${label}${total === 1 ? '' : 's'}  (${high} high · ${med} med · ${low} low)`);
  }
  if (aiTotal > 0) {
    const aiHigh = aiFindings.filter((f) => f.severity === 'high').length;
    const aiMed = aiFindings.filter((f) => f.severity === 'med').length;
    const aiLow = aiFindings.filter((f) => f.severity === 'low').length;
    lines.push(`${aiTotal} AI finding${aiTotal === 1 ? '' : 's'}  (${aiHigh} high · ${aiMed} med · ${aiLow} low)`);
  }

  return lines.join('\n');
}
