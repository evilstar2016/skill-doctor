import type { DiffResult } from '../diff/types';
import { esc, htmlPage, section } from './theme';

export function renderDiffReport(result: DiffResult): string {
  const { skillA, skillB, analysis } = result;
  const date = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
  const brandSub = `Comparing <span style="font-family:var(--mono)">${esc(skillA.name)}</span> and <span style="font-family:var(--mono)">${esc(skillB.name)}</span> &middot; ${date}`;

  const triggerSection = section('When to Use', triggersComparison(skillA, skillB));

  const coverageSection = analysis
    ? section('Coverage', coverageTable(skillA.name, skillB.name, analysis))
    : '';

  const prosConsSection = analysis
    ? section('Pros &amp; Cons', prosConsCards(skillA.name, skillB.name, analysis))
    : '';

  const adviceSection = section(
    'Situational Advice',
    analysis
      ? adviceTable(skillA.name, skillB.name, analysis)
      : '<div class="warn-banner">LLM analysis unavailable — only extracted fields shown.</div>',
  );

  const body = [triggerSection, coverageSection, prosConsSection, adviceSection].join('\n');

  return htmlPage(
    `Skill Diff: ${skillA.name} vs ${skillB.name}`,
    brandSub,
    body,
  );
}

function triggersComparison(
  skillA: DiffResult['skillA'],
  skillB: DiffResult['skillB'],
): string {
  return `<div class="two-col">
  <div class="diff-card">
    <div class="diff-card-name">${esc(skillA.name)}</div>
    <div style="font-size:13px;color:var(--text-light);line-height:1.6">${esc(skillA.whenToUse || skillA.triggers[0] || '—')}</div>
  </div>
  <div class="diff-card">
    <div class="diff-card-name">${esc(skillB.name)}</div>
    <div style="font-size:13px;color:var(--text-light);line-height:1.6">${esc(skillB.whenToUse || skillB.triggers[0] || '—')}</div>
  </div>
</div>`;
}

function coverageTable(
  nameA: string,
  nameB: string,
  analysis: NonNullable<DiffResult['analysis']>,
): string {
  const rows = [
    { label: 'Shared', items: analysis.coverageOverlap },
    { label: `Only ${nameA}`, items: analysis.coverageOnlyA },
    { label: `Only ${nameB}`, items: analysis.coverageOnlyB },
  ];

  return `<table class="coverage-table">
  <thead>
    <tr><th>Scope</th><th>Coverage</th></tr>
  </thead>
  <tbody>
    ${rows
      .map(
        (r) => `<tr>
      <td class="coverage-label">${esc(r.label)}</td>
      <td class="coverage-items">${itemsOrDash(r.items)}</td>
    </tr>`,
      )
      .join('\n    ')}
  </tbody>
</table>`;
}

function prosConsCards(
  nameA: string,
  nameB: string,
  analysis: NonNullable<DiffResult['analysis']>,
): string {
  return `<div class="two-col">
  <div class="diff-card">
    <div class="diff-card-name">${esc(nameA)}</div>
    ${renderProsCons(analysis.prosConsA)}
  </div>
  <div class="diff-card">
    <div class="diff-card-name">${esc(nameB)}</div>
    ${renderProsCons(analysis.prosConsB)}
  </div>
</div>`;
}

function renderProsCons(pc: { pros: string[]; cons: string[] }): string {
  const pros = pc.pros.map((p) => `<div class="pro-item"><span>&#10003;</span><span>${esc(p)}</span></div>`).join('');
  const cons = pc.cons.map((c) => `<div class="con-item"><span>&ndash;</span><span>${esc(c)}</span></div>`).join('');
  return pros + cons || '<span style="color:var(--muted);font-size:13px">—</span>';
}

function adviceTable(
  nameA: string,
  nameB: string,
  analysis: NonNullable<DiffResult['analysis']>,
): string {
  if (analysis.situationalAdvice.length === 0) {
    return '<div class="empty-state">No situational advice available.</div>';
  }

  const rows = analysis.situationalAdvice
    .map(
      (a) => `<tr>
    <td style="color:var(--text-light);font-size:13px">${esc(a.condition)}</td>
    <td>${recBadge(a.recommendation, nameA, nameB)}</td>
    <td class="reason-cell">${esc(a.reason)}</td>
  </tr>`,
    )
    .join('\n  ');

  return `<table class="advice-table">
  <thead>
    <tr><th>Scenario</th><th>Recommended</th><th>Reason</th></tr>
  </thead>
  <tbody>
  ${rows}
  </tbody>
</table>`;
}

function recBadge(rec: string, nameA: string, nameB: string): string {
  if (rec === 'A') return `<span class="rec-a">${esc(nameA)}</span>`;
  if (rec === 'B') return `<span class="rec-b">${esc(nameB)}</span>`;
  return `<span class="rec-both">Either</span>`;
}

function itemsOrDash(items: string[]): string {
  if (!items || items.length === 0) return '<span style="color:var(--muted)">—</span>';
  return items.map((i) => esc(i)).join(', ');
}
