import type { ConflictPair, SkillRecord } from '../types/skill';
import { esc, htmlPage, section } from './theme';

export function renderReport(skills: SkillRecord[], conflicts: ConflictPair[]): string {
  const duplicates = conflicts.filter((p) => p.kind === 'duplicate');
  const semantic = conflicts.filter((p) => p.kind === 'conflict');
  const platformCounts = countBy(skills, (s) => s.platform);
  const date = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });

  const totalConflicts = duplicates.length + semantic.length;
  const brandSub = `${skills.length} skill${skills.length !== 1 ? 's' : ''} &middot; ${Object.keys(platformCounts).length} platform${Object.keys(platformCounts).length !== 1 ? 's' : ''} &middot; ${totalConflicts} issue${totalConflicts !== 1 ? 's' : ''} &middot; ${date}`;

  const body = [
    section('Overview', metricsRow(skills, duplicates, semantic, platformCounts)),
    section('Platforms', platformTags(platformCounts)),
    section(`Conflicts&thinsp;(${semantic.length})`, conflictCards(semantic, 'conflict')),
    section(`Duplicates&thinsp;(${duplicates.length})`, conflictCards(duplicates, 'duplicate')),
    section(`All Skills&thinsp;(${skills.length})`, skillsTable(skills)),
  ].join('\n');

  return htmlPage('Skill Doctor Report', brandSub, body);
}

function metricsRow(
  skills: SkillRecord[],
  duplicates: ConflictPair[],
  semantic: ConflictPair[],
  platformCounts: Record<string, number>,
): string {
  return `<div class="metrics">
  <div class="metric-card">
    <div class="metric-val">${skills.length}</div>
    <div class="metric-label">Skills</div>
  </div>
  <div class="metric-card">
    <div class="metric-val">${Object.keys(platformCounts).length}</div>
    <div class="metric-label">Platforms</div>
  </div>
  <div class="metric-card">
    <div class="metric-val${duplicates.length > 0 ? ' warn' : ''}">${duplicates.length}</div>
    <div class="metric-label">Duplicates</div>
  </div>
  <div class="metric-card">
    <div class="metric-val${semantic.length > 0 ? ' danger' : ''}">${semantic.length}</div>
    <div class="metric-label">Conflicts</div>
  </div>
</div>`;
}

function platformTags(counts: Record<string, number>): string {
  if (Object.keys(counts).length === 0) {
    return '<span class="empty-state">No platforms detected.</span>';
  }
  const tags = Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .map(([p, n]) => `<span class="tag">${esc(p)}<span class="tag-count">${n}</span></span>`)
    .join('\n  ');
  return `<div class="tag-list">\n  ${tags}\n</div>`;
}

function conflictCards(pairs: ConflictPair[], kind: 'conflict' | 'duplicate'): string {
  if (pairs.length === 0) {
    const msg = kind === 'duplicate' ? 'No duplicates found.' : 'No conflicts detected.';
    return `<div class="all-clear">
  <div class="all-clear-icon">&#10003;</div>
  <div class="all-clear-title">${msg}</div>
</div>`;
  }

  const cards = pairs.map((p) => conflictCard(p, kind)).join('\n');
  return `<div class="conflict-list">\n${cards}\n</div>`;
}

function conflictCard(p: ConflictPair, kind: 'conflict' | 'duplicate'): string {
  const cssKind = kind === 'duplicate' ? 'dup' : p.severity;
  const sevLabel = kind === 'duplicate' ? 'DUP' : p.severity.toUpperCase();
  const simPct = `${Math.round(p.similarity * 100)}%`;

  const metaParts: string[] = [esc(p.detectionMethod ?? 'token')];
  if (p.sharedTokens.length > 0) {
    metaParts.push(`shared: ${esc(p.sharedTokens.slice(0, 6).join(', '))}${p.sharedTokens.length > 6 ? ` +${p.sharedTokens.length - 6}` : ''}`);
  }

  const summary = p.analysis?.summary
    ? `<div class="conflict-summary">${esc(p.analysis.summary)}</div>`
    : '';
  const fix = p.remediation
    ? `<div class="conflict-fix">&#8594; ${esc(p.remediation)}</div>`
    : '';
  const pathA = `<span style="font-size:11px;color:var(--muted);font-family:var(--font)">${esc(p.a.scope)} &middot; ${esc(p.a.platform)}</span>`;
  const pathB = `<span style="font-size:11px;color:var(--muted);font-family:var(--font)">${esc(p.b.scope)} &middot; ${esc(p.b.platform)}</span>`;

  return `<div class="conflict-card ${cssKind}">
  <div class="conflict-head">
    <div class="conflict-names">
      <span>${esc(p.a.name)}</span>
      <span class="conflict-sep">&#8596;</span>
      <span>${esc(p.b.name)}</span>
    </div>
    <span class="sev-badge ${cssKind}">${sevLabel}</span>
    <span class="sim-pct">${simPct}</span>
    <span class="toggle-icon">&#8964;</span>
  </div>
  <div class="conflict-body">
    <div class="conflict-meta">
      ${metaParts.map((m) => `<span>${m}</span>`).join('\n      ')}
    </div>
    <div style="margin-top:10px;display:flex;gap:16px;flex-wrap:wrap">
      <div>${pathA}<br><span style="font-family:var(--mono);font-size:12px;color:var(--text-light)">${esc(p.a.description || '—')}</span></div>
      <div>${pathB}<br><span style="font-family:var(--mono);font-size:12px;color:var(--text-light)">${esc(p.b.description || '—')}</span></div>
    </div>
    ${summary}
    ${fix}
  </div>
</div>`;
}

function renderProvenance(prov: SkillRecord['provenance']): string {
  const parts: string[] = [];
  if (prov?.installSource) parts.push(esc(prov.installSource));
  if (prov?.repository) parts.push(esc(prov.repository));
  if (prov?.author) parts.push(esc(prov.author));
  return parts.length > 0 ? parts.join('<br>') : '—';
}

function skillsTable(skills: SkillRecord[]): string {
  if (skills.length === 0) {
    return '<div class="empty-state">No skills found.</div>';
  }

  const rows = skills
    .map(
      (s) => `<tr>
    <td class="skill-name-cell">${esc(s.name)}</td>
    <td><span class="platform-tag">${esc(s.platform)}</span></td>
    <td><span class="scope-badge ${s.scope}">${s.scope}</span></td>
    <td class="desc-cell" title="${esc(s.description)}">${esc(s.description || '—')}</td>
    <td class="trigger-cell">${s.triggers.length > 0 ? esc(s.triggers.slice(0, 3).join(', ')) + (s.triggers.length > 3 ? ` <span style="color:var(--accent)">+${s.triggers.length - 3}</span>` : '') : '<span style="color:var(--muted)">—</span>'}</td>
    <td style="font-size:11px;color:var(--muted);line-height:1.5">${renderProvenance(s.provenance)}</td>
  </tr>`,
    )
    .join('\n  ');

  return `<table class="skills-table">
  <thead>
    <tr>
      <th>Name</th>
      <th>Platform</th>
      <th>Scope</th>
      <th>Description</th>
      <th>Triggers</th>
      <th>Provenance</th>
    </tr>
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
