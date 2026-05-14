import type { ConflictPair, SkillRecord } from '../types/skill';

export function renderReport(skills: SkillRecord[], conflicts: ConflictPair[]): string {
  const duplicates = conflicts.filter((p) => p.kind === 'duplicate');
  const semantic = conflicts.filter((p) => p.kind === 'conflict');
  const platformCounts = countBy(skills, (s) => s.platform);
  const generatedAt = new Date().toLocaleString();

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Skill Doctor Report</title>
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
  .platforms { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 4px; }
  .pill { display: inline-flex; align-items: center; gap: 5px; padding: 3px 10px; border-radius: 99px; font-size: 12px; font-weight: 500; background: #f1f5f9; color: #334155; border: 1px solid #e2e8f0; }
  .pill-count { background: #e2e8f0; border-radius: 99px; padding: 0 6px; font-size: 11px; }
  table { width: 100%; border-collapse: collapse; background: #fff; border: 1px solid #e2e8f0; border-radius: 10px; overflow: hidden; }
  th { text-align: left; padding: 10px 14px; background: #f8fafc; font-size: 12px; font-weight: 600; color: #64748b; text-transform: uppercase; letter-spacing: .04em; border-bottom: 1px solid #e2e8f0; }
  td { padding: 10px 14px; border-bottom: 1px solid #f1f5f9; vertical-align: top; }
  tr:last-child td { border-bottom: none; }
  tr:hover td { background: #f8fafc; }
  .badge { display: inline-block; padding: 1px 7px; border-radius: 4px; font-size: 11px; font-weight: 600; }
  .badge-scope-project { background: #dbeafe; color: #1d4ed8; }
  .badge-scope-global { background: #ede9fe; color: #6d28d9; }
  .badge-high { background: #fee2e2; color: #b91c1c; }
  .badge-med { background: #fef3c7; color: #92400e; }
  .badge-low { background: #f1f5f9; color: #475569; }
  .badge-duplicate { background: #fce7f3; color: #9d174d; }
  .badge-conflict { background: #ffedd5; color: #9a3412; }
  .desc { color: #475569; max-width: 340px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .triggers { color: #64748b; font-size: 12px; }
  .shared { font-size: 12px; color: #64748b; }
  .analysis { font-size: 12px; color: #475569; max-width: 320px; }
  .sim { font-weight: 600; color: #0f172a; }
  .empty { color: #94a3b8; font-style: italic; padding: 20px 14px; }
  .conflict-pair td:first-child { font-weight: 500; }
</style>
</head>
<body>
<div class="page">
  <h1>Skill Doctor Report</h1>
  <p class="meta">Generated ${generatedAt} &nbsp;·&nbsp; ${skills.length} skill${skills.length !== 1 ? 's' : ''} scanned</p>

  <div class="cards">
    <div class="card">
      <div class="card-val">${skills.length}</div>
      <div class="card-label">Skills installed</div>
    </div>
    <div class="card">
      <div class="card-val">${Object.keys(platformCounts).length}</div>
      <div class="card-label">Platforms</div>
    </div>
    <div class="card">
      <div class="card-val ${duplicates.length > 0 ? 'warn' : ''}">${duplicates.length}</div>
      <div class="card-label">Duplicates</div>
    </div>
    <div class="card">
      <div class="card-val ${semantic.length > 0 ? 'danger' : ''}">${semantic.length}</div>
      <div class="card-label">Conflicts</div>
    </div>
  </div>

  <h2>Platforms</h2>
  <div class="platforms">
    ${Object.entries(platformCounts)
      .sort((a, b) => b[1] - a[1])
      .map(([platform, count]) => `<span class="pill">${platform}<span class="pill-count">${count}</span></span>`)
      .join('\n    ')}
  </div>

  <h2>Skills (${skills.length})</h2>
  <table>
    <thead>
      <tr><th>Name</th><th>Platform</th><th>Scope</th><th>Description</th><th>Triggers</th></tr>
    </thead>
    <tbody>
      ${skills.length === 0 ? '<tr><td colspan="5" class="empty">No skills found.</td></tr>' : skills
        .map(
          (s) => `<tr>
        <td>${esc(s.name)}</td>
        <td><span class="pill">${esc(s.platform)}</span></td>
        <td><span class="badge badge-scope-${s.scope}">${s.scope}</span></td>
        <td><span class="desc" title="${esc(s.description)}">${esc(s.description)}</span></td>
        <td class="triggers">${s.triggers.length > 0 ? esc(s.triggers.slice(0, 3).join(', ')) + (s.triggers.length > 3 ? ` +${s.triggers.length - 3}` : '') : '—'}</td>
      </tr>`,
        )
        .join('\n      ')}
    </tbody>
  </table>

  <h2>Duplicates (${duplicates.length})</h2>
  ${renderPairsTable(duplicates)}

  <h2>Conflicts (${semantic.length})</h2>
  ${renderPairsTable(semantic)}
</div>
</body>
</html>`;
}

function renderPairsTable(pairs: ConflictPair[]): string {
  if (pairs.length === 0) {
    return '<table><tbody><tr><td class="empty">None detected.</td></tr></tbody></table>';
  }

  const rows = pairs
    .map(
      (p) => `<tr class="conflict-pair">
      <td>${esc(p.a.name)}<br><span class="badge badge-scope-${p.a.scope}">${p.a.scope}</span> <span class="pill">${esc(p.a.platform)}</span></td>
      <td>${esc(p.b.name)}<br><span class="badge badge-scope-${p.b.scope}">${p.b.scope}</span> <span class="pill">${esc(p.b.platform)}</span></td>
      <td><span class="badge badge-${p.severity}">${p.severity}</span></td>
      <td>${esc(p.detectionMethod ?? 'unknown')}</td>
      <td class="sim">${Math.round(p.similarity * 100)}%</td>
      <td class="shared">${p.sharedTokens.join(', ') || '—'}</td>
      <td class="analysis">${esc(p.analysis?.summary ?? '—')}</td>
      <td class="analysis">${esc(p.remediation ?? '—')}</td>
    </tr>`,
    )
    .join('\n    ');

  return `<table>
    <thead>
      <tr><th>Skill A</th><th>Skill B</th><th>Severity</th><th>Method</th><th>Similarity</th><th>Shared tokens</th><th>Summary</th><th>Fix</th></tr>
    </thead>
    <tbody>
      ${rows}
    </tbody>
  </table>`;
}

function countBy<T>(arr: T[], key: (item: T) => string): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const item of arr) {
    const k = key(item);
    counts[k] = (counts[k] ?? 0) + 1;
  }
  return counts;
}

function esc(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
