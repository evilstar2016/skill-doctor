import type { AuditResult, AuditFinding } from '../types/audit';

export function renderAuditReport(result: AuditResult): string {
  const { high, med, low } = result.summary;
  const total = high + med + low;
  const generatedAt = new Date().toLocaleString();

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Skill Doctor Security Audit</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #f8fafc; color: #1e293b; font-size: 14px; line-height: 1.5; }
  .page { max-width: 1100px; margin: 0 auto; padding: 32px 24px; }
  h1 { font-size: 22px; font-weight: 700; color: #0f172a; }
  h2 { font-size: 15px; font-weight: 600; color: #475569; text-transform: uppercase; letter-spacing: .06em; margin: 32px 0 12px; }
  .meta { color: #64748b; font-size: 13px; margin-top: 4px; }
  .cards { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin-top: 20px; }
  .card { background: #fff; border: 1px solid #e2e8f0; border-radius: 10px; padding: 16px 20px; }
  .card-val { font-size: 28px; font-weight: 700; color: #0f172a; }
  .card-val.warn { color: #b45309; }
  .card-val.danger { color: #b91c1c; }
  .card-label { font-size: 12px; color: #64748b; margin-top: 2px; }
  table { width: 100%; border-collapse: collapse; background: #fff; border: 1px solid #e2e8f0; border-radius: 10px; overflow: hidden; }
  th { text-align: left; padding: 10px 14px; background: #f8fafc; font-size: 12px; font-weight: 600; color: #64748b; text-transform: uppercase; letter-spacing: .04em; border-bottom: 1px solid #e2e8f0; }
  td { padding: 10px 14px; border-bottom: 1px solid #f1f5f9; vertical-align: top; }
  tr:last-child td { border-bottom: none; }
  tr:hover td { background: #f8fafc; }
  .badge { display: inline-block; padding: 1px 7px; border-radius: 4px; font-size: 11px; font-weight: 600; }
  .badge-high { background: #fee2e2; color: #b91c1c; }
  .badge-med { background: #fef3c7; color: #92400e; }
  .badge-low { background: #f1f5f9; color: #475569; }
  .badge-scope-project { background: #dbeafe; color: #1d4ed8; }
  .badge-scope-global { background: #ede9fe; color: #6d28d9; }
  .pill { display: inline-flex; align-items: center; padding: 2px 8px; border-radius: 99px; font-size: 12px; font-weight: 500; background: #f1f5f9; color: #334155; border: 1px solid #e2e8f0; }
  .provenance { color: #64748b; font-size: 12px; line-height: 1.6; }
  .match { font-family: monospace; font-size: 12px; color: #475569; max-width: 280px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .empty { color: #94a3b8; font-style: italic; padding: 20px 14px; }
  .clean { color: #16a34a; font-weight: 600; }
</style>
</head>
<body>
<div class="page">
  <h1>Skill Doctor — Security Audit</h1>
  <p class="meta">Generated ${generatedAt} &nbsp;·&nbsp; ${result.scanned} skill${result.scanned !== 1 ? 's' : ''} scanned</p>

  <div class="cards">
    <div class="card">
      <div class="card-val">${result.scanned}</div>
      <div class="card-label">Skills scanned</div>
    </div>
    <div class="card">
      <div class="card-val ${high > 0 ? 'danger' : ''}">${high}</div>
      <div class="card-label">High severity</div>
    </div>
    <div class="card">
      <div class="card-val ${med > 0 ? 'warn' : ''}">${med}</div>
      <div class="card-label">Med severity</div>
    </div>
    <div class="card">
      <div class="card-val">${low}</div>
      <div class="card-label">Low severity</div>
    </div>
  </div>

  <h2>Findings (${total})</h2>
  ${renderFindingsTable(result.findings)}
</div>
</body>
</html>`;
}

function renderFindingsTable(findings: AuditFinding[]): string {
  if (findings.length === 0) {
    return '<table><tbody><tr><td class="empty clean">No findings — all skills passed.</td></tr></tbody></table>';
  }

  const rows = findings
    .map(
      (f) => `<tr>
      <td>${esc(f.skillName)}</td>
      <td><span class="pill">${esc(f.platform)}</span></td>
      <td><span class="badge badge-scope-${f.scope}">${f.scope}</span></td>
      <td><span class="badge badge-${f.severity}">${f.severity.toUpperCase()}</span></td>
      <td>${esc(f.ruleId)}</td>
      <td class="match" title="${esc(f.summary)}">${esc(f.matchedText)}</td>
      <td class="provenance">${renderProvenance(f)}</td>
    </tr>`,
    )
    .join('\n    ');

  return `<table>
    <thead>
      <tr><th>Skill</th><th>Platform</th><th>Scope</th><th>Severity</th><th>Rule</th><th>Match</th><th>Provenance</th></tr>
    </thead>
    <tbody>
      ${rows}
    </tbody>
  </table>`;
}

function renderProvenance(f: AuditFinding): string {
  return [
    `install: ${esc(f.provenance?.installSource ?? '—')}`,
    `confidence: ${esc(f.provenance?.confidence ?? '—')}`,
    `repo: ${esc(f.provenance?.repository ?? '—')}`,
    `author: ${esc(f.provenance?.author ?? '—')}`,
  ].join('<br>');
}

function esc(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
