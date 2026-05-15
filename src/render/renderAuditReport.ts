import type { AuditFinding, AuditResult } from '../types/audit';
import { esc, htmlPage, section } from './theme';

export function renderAuditReport(result: AuditResult): string {
  const { high, med, low } = result.summary;
  const date = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
  const brandSub = `Security Audit &middot; ${result.scanned} skill${result.scanned !== 1 ? 's' : ''} scanned &middot; ${date}`;

  const sortedFindings = [...result.findings].sort((a, b) => severityRank(b.severity) - severityRank(a.severity));

  const body = [
    section('Overview', metricsRow(result.scanned, high, med, low)),
    section(`Findings&thinsp;(${result.findings.length})`, findingsSection(sortedFindings)),
  ].join('\n');

  return htmlPage('Skill Doctor — Security Audit', brandSub, body);
}

function metricsRow(scanned: number, high: number, med: number, low: number): string {
  return `<div class="metrics">
  <div class="metric-card">
    <div class="metric-val">${scanned}</div>
    <div class="metric-label">Scanned</div>
  </div>
  <div class="metric-card">
    <div class="metric-val${high > 0 ? ' danger' : ''}">${high}</div>
    <div class="metric-label">High</div>
  </div>
  <div class="metric-card">
    <div class="metric-val${med > 0 ? ' warn' : ''}">${med}</div>
    <div class="metric-label">Med</div>
  </div>
  <div class="metric-card">
    <div class="metric-val">${low}</div>
    <div class="metric-label">Low</div>
  </div>
</div>`;
}

function findingsSection(findings: AuditFinding[]): string {
  if (findings.length === 0) {
    return `<div class="all-clear">
  <div class="all-clear-icon">&#10003;</div>
  <div class="all-clear-title">All skills passed</div>
  <div class="all-clear-sub">No security findings detected.</div>
</div>`;
  }

  const cards = findings.map(findingCard).join('\n');
  return `<div class="conflict-list">\n${cards}\n</div>`;
}

function findingCard(f: AuditFinding): string {
  const provParts: string[] = [
    `install: ${esc(f.provenance?.installSource ?? '—')}`,
  ];
  if (f.provenance?.repository) provParts.push(`repo: ${esc(f.provenance.repository)}`);
  if (f.provenance?.author) provParts.push(`author: ${esc(f.provenance.author)}`);
  if (f.provenance?.confidence) provParts.push(`confidence: ${esc(f.provenance.confidence)}`);

  return `<div class="conflict-card ${f.severity}">
  <div class="conflict-head" style="cursor:default">
    <div class="conflict-names">
      <span>${esc(f.skillName)}</span>
    </div>
    <span class="finding-rule">${esc(f.ruleId)}</span>
    <span class="sev-badge ${f.severity}">${f.severity.toUpperCase()}</span>
    <span class="platform-tag" style="margin-left:4px">${esc(f.platform)}</span>
    <span class="scope-badge ${f.scope}" style="margin-left:4px">${f.scope}</span>
  </div>
  <div class="conflict-body open">
    <div class="conflict-summary">${esc(f.summary)}</div>
    ${f.matchedText ? `<div class="finding-match">${esc(f.matchedText)}</div>` : ''}
    ${provParts.length > 0 ? `<div class="finding-prov">${provParts.map((p) => `<span>${p}</span>`).join('')}</div>` : ''}
  </div>
</div>`;
}

function severityRank(s: string): number {
  return s === 'high' ? 3 : s === 'med' ? 2 : 1;
}
