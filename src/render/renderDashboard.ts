import type { AuditFinding, AuditResult, RuleId } from '../types/audit';
import type { CleanupSuggestion } from '../types/cleanup';
import type { ConflictPair, Platform, SkillRecord } from '../types/skill';
import { esc } from './theme';
import packageJson from '../../package.json';

/* ─── Public interface ─────────────────────────────── */

export interface DashboardInput {
  skills: SkillRecord[];
  conflicts: ConflictPair[];
  auditResult: AuditResult;
  duplicates: ConflictPair[];
  suggestions: CleanupSuggestion[];
}

/* ─── CSS ──────────────────────────────────────────── */

const DASHBOARD_CSS = `
*{margin:0;padding:0;box-sizing:border-box}
body{background:#0a0e17;color:#c8d6e5;font-family:Menlo,Monaco,'Courier New',monospace;font-size:14px;line-height:1.6}
a{color:#00c8ff;text-decoration:none}
.container{max-width:1100px;margin:0 auto;padding:0 24px}

/* header */
.db-header{background:#0d1320;border-bottom:1px solid #1a2238;padding:20px 0}
.db-header-inner{display:flex;align-items:center;justify-content:space-between}
.db-brand{font-size:20px;font-weight:700;letter-spacing:2px;color:#00c8ff}
.db-brand-sub{font-size:12px;color:#5a6a80;margin-top:2px}
.db-version{background:#1a2238;color:#00c8ff;font-size:11px;padding:3px 10px;border-radius:12px;border:1px solid #00c8ff33}

/* sections */
.db-section{margin:32px 0}
.db-section-title{font-size:13px;text-transform:uppercase;letter-spacing:2px;color:#5a6a80;border-bottom:1px solid #1a2238;padding-bottom:8px;margin-bottom:16px}

/* overview grid */
.overview-grid{display:grid;grid-template-columns:240px 1fr;gap:32px;align-items:start}
.health-ring-wrap{text-align:center}
.health-pct{font-size:28px;font-weight:700;color:#00c8ff}
.health-label{font-size:11px;color:#5a6a80;text-transform:uppercase;letter-spacing:1px;margin-top:4px}
.metric-cards{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:20px}
.metric-card{background:#111827;border:1px solid #1a2238;border-radius:8px;padding:14px;text-align:center}
.metric-val{font-size:24px;font-weight:700;color:#e2e8f0}
.metric-lbl{font-size:11px;color:#5a6a80;text-transform:uppercase;letter-spacing:1px}

/* platform bars */
.bar-row{display:flex;align-items:center;margin:4px 0}
.bar-label{width:80px;font-size:12px;color:#5a6a80;text-align:right;padding-right:10px}
.bar-track{flex:1;height:18px;background:#111827;border-radius:4px;overflow:hidden}
.bar-fill{height:100%;background:#00c8ff;border-radius:4px;transition:width .3s}
.bar-count{width:30px;font-size:12px;color:#5a6a80;text-align:right;padding-left:6px}

/* table */
.db-table{width:100%;border-collapse:collapse}
.db-table th{text-align:left;font-size:11px;text-transform:uppercase;letter-spacing:1px;color:#5a6a80;padding:8px 12px;border-bottom:1px solid #1a2238}
.db-table td{padding:8px 12px;border-bottom:1px solid #111827;font-size:13px}
.db-table tr:hover td{background:#111827}
.dot{display:inline-block;width:8px;height:8px;border-radius:50%;margin-right:6px;vertical-align:middle}
.dot-clean{background:#22c55e}
.dot-conflict{background:#ef4444}
.dot-risk{background:#f59e0b}
.dot-dup{background:#a855f7}

/* severity bar */
.sev-bar{display:flex;height:20px;border-radius:4px;overflow:hidden;margin-bottom:16px}
.sev-seg-high{background:#ef4444}
.sev-seg-med{background:#f59e0b}
.sev-seg-low{background:#22c55e}

/* conflict / finding cards */
.card{background:#111827;border:1px solid #1a2238;border-radius:8px;padding:16px;margin-bottom:12px}
.card-header{display:flex;align-items:center;justify-content:space-between;margin-bottom:8px}
.card-title{font-weight:600;color:#e2e8f0;font-size:14px}
.sev-high{background:#ef4444;color:#fff;font-size:11px;padding:2px 8px;border-radius:4px;font-weight:600;text-transform:uppercase}
.sev-med{background:#f59e0b;color:#0a0e17;font-size:11px;padding:2px 8px;border-radius:4px;font-weight:600;text-transform:uppercase}
.sev-low{background:#22c55e;color:#0a0e17;font-size:11px;padding:2px 8px;border-radius:4px;font-weight:600;text-transform:uppercase}
.score-bar{height:6px;background:#1a2238;border-radius:3px;margin:8px 0;overflow:hidden}
.score-fill{height:100%;background:#00c8ff;border-radius:3px}
.card-desc{font-size:12px;color:#5a6a80}

/* rule heatmap */
.rule-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:20px}
.rule-cell{background:#111827;border:1px solid #1a2238;border-radius:8px;padding:14px;text-align:center}
.rule-count{font-size:22px;font-weight:700}
.rule-name{font-size:11px;color:#5a6a80;text-transform:uppercase;letter-spacing:1px;margin-top:4px}
.heat-0{color:#5a6a80}
.heat-low{color:#22c55e}
.heat-med{color:#f59e0b}
.heat-high{color:#ef4444}

/* code block */
code.match-text{display:block;background:#0d1320;border:1px solid #1a2238;border-radius:4px;padding:8px 12px;margin-top:8px;font-size:12px;color:#c8d6e5;white-space:pre-wrap;word-break:break-all}

/* cleanup */
.suggest-badge{display:inline-block;font-size:11px;padding:2px 8px;border-radius:4px;font-weight:600;text-transform:uppercase}
.badge-keep{background:#22c55e;color:#0a0e17}
.badge-remove{background:#ef4444;color:#fff}
.cleanup-pair{background:#111827;border:1px solid #1a2238;border-radius:8px;padding:14px;margin-bottom:10px}
.cleanup-path{font-size:12px;color:#5a6a80;margin:4px 0}
.cleanup-reason{font-size:12px;color:#c8d6e5;font-style:italic}

/* empty state */
.empty-state{text-align:center;padding:32px;color:#5a6a80;font-style:italic}
`;

/* ─── Page wrapper ─────────────────────────────────── */

function dashboardPage(brandSub: string, body: string): string {
  const version = packageJson.version ?? '0.0.0';
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Skill Doctor — Mission Control</title>
<style>${DASHBOARD_CSS}</style>
</head>
<body>
<header class="db-header">
  <div class="container">
    <div class="db-header-inner">
      <div>
        <div class="db-brand">SKILL DOCTOR</div>
        <div class="db-brand-sub">${brandSub}</div>
      </div>
      <span class="db-version">v${esc(version)}</span>
    </div>
  </div>
</header>
<main class="container">
${body}
</main>
</body>
</html>`;
}

/* ─── Utilities ────────────────────────────────────── */

function countBy<T>(items: T[], fn: (item: T) => string): Record<string, number> {
  const out: Record<string, number> = {};
  for (const item of items) {
    const key = fn(item);
    out[key] = (out[key] ?? 0) + 1;
  }
  return out;
}

function healthPercent(total: number, conflicts: number, risks: number, dups: number): number {
  if (total === 0) return 100;
  return Math.round(Math.max(0, total - conflicts - risks - dups) / total * 100);
}

function heatClass(count: number): string {
  if (count === 0) return 'heat-0';
  if (count === 1) return 'heat-low';
  if (count <= 3) return 'heat-med';
  return 'heat-high';
}

/* ─── Section: Overview ────────────────────────────── */

function overviewSection(
  skills: SkillRecord[],
  conflicts: ConflictPair[],
  auditResult: AuditResult,
  duplicates: ConflictPair[],
): string {
  const total = skills.length;
  const conflictCount = conflicts.length;
  const riskCount = auditResult.summary.high;
  const dupCount = duplicates.length;
  const health = healthPercent(total, conflictCount, riskCount, dupCount);

  // SVG donut ring — radius 80, circumference = 2 * PI * 80 ~ 502.65
  const R = 80;
  const C = 2 * Math.PI * R;
  const cleanPct = health / 100;
  const conflictPct = total > 0 ? conflictCount / total : 0;
  const riskPct = total > 0 ? riskCount / total : 0;
  const dupPct = total > 0 ? dupCount / total : 0;

  // Offsets: segments go clean -> conflict -> risk -> dup
  const cleanLen = C * cleanPct;
  const conflictLen = C * conflictPct;
  const riskLen = C * riskPct;
  const dupLen = C * dupPct;

  const cleanOffset = 0;
  const conflictOffset = -(cleanLen);
  const riskOffset = -(cleanLen + conflictLen);
  const dupOffset = -(cleanLen + conflictLen + riskLen);

  const ringSvg = `<svg viewBox="0 0 200 200" width="180" height="180">
  <circle cx="100" cy="100" r="${R}" fill="none" stroke="#1a2238" stroke-width="16"/>
  ${cleanLen > 0 ? `<circle cx="100" cy="100" r="${R}" fill="none" stroke="#22c55e" stroke-width="16" stroke-dasharray="${cleanLen} ${C - cleanLen}" stroke-dashoffset="${cleanOffset}" transform="rotate(-90 100 100)"/>` : ''}
  ${conflictLen > 0 ? `<circle cx="100" cy="100" r="${R}" fill="none" stroke="#ef4444" stroke-width="16" stroke-dasharray="${conflictLen} ${C - conflictLen}" stroke-dashoffset="${conflictOffset}" transform="rotate(-90 100 100)"/>` : ''}
  ${riskLen > 0 ? `<circle cx="100" cy="100" r="${R}" fill="none" stroke="#f59e0b" stroke-width="16" stroke-dasharray="${riskLen} ${C - riskLen}" stroke-dashoffset="${riskOffset}" transform="rotate(-90 100 100)"/>` : ''}
  ${dupLen > 0 ? `<circle cx="100" cy="100" r="${R}" fill="none" stroke="#a855f7" stroke-width="16" stroke-dasharray="${dupLen} ${C - dupLen}" stroke-dashoffset="${dupOffset}" transform="rotate(-90 100 100)"/>` : ''}
</svg>`;

  // Metric cards
  const platformCounts = countBy(skills, (s) => s.platform);
  const platforms = Object.keys(platformCounts).length;
  const globalCount = skills.filter((s) => s.scope === 'global').length;
  const projectCount = skills.filter((s) => s.scope === 'project').length;

  const cards = `<div class="metric-cards">
  <div class="metric-card"><div class="metric-val">${total}</div><div class="metric-lbl">Skills</div></div>
  <div class="metric-card"><div class="metric-val">${platforms}</div><div class="metric-lbl">Platforms</div></div>
  <div class="metric-card"><div class="metric-val">${globalCount}</div><div class="metric-lbl">Global</div></div>
  <div class="metric-card"><div class="metric-val">${projectCount}</div><div class="metric-lbl">Project</div></div>
</div>`;

  // Platform bars
  const maxCount = Math.max(1, ...Object.values(platformCounts));
  const bars = Object.entries(platformCounts)
    .sort(([, a], [, b]) => b - a)
    .map(([p, c]) => {
      const pct = Math.round((c / maxCount) * 100);
      return `<div class="bar-row"><span class="bar-label">${esc(p)}</span><div class="bar-track"><div class="bar-fill" style="width:${pct}%"></div></div><span class="bar-count">${c}</span></div>`;
    })
    .join('\n');

  return `<div class="db-section">
<div class="db-section-title">Overview</div>
<div class="overview-grid">
  <div class="health-ring-wrap">
    ${ringSvg}
    <div class="health-pct">${health}%</div>
    <div class="health-label">Health</div>
  </div>
  <div>
    ${cards}
    ${bars}
  </div>
</div>
</div>`;
}

/* ─── Section: Skill table ─────────────────────────── */

function skillTableSection(
  skills: SkillRecord[],
  conflictNames: Set<string>,
  riskNames: Set<string>,
  dupNames: Set<string>,
): string {
  if (skills.length === 0) {
    return `<div class="db-section"><div class="db-section-title">Skills</div><div class="empty-state">No skills found.</div></div>`;
  }

  const rows = skills
    .map((s) => {
      let dotClass = 'dot-clean';
      if (conflictNames.has(s.name)) dotClass = 'dot-conflict';
      else if (riskNames.has(s.name)) dotClass = 'dot-risk';
      else if (dupNames.has(s.name)) dotClass = 'dot-dup';

      return `<tr>
  <td><span class="dot ${dotClass}"></span>${esc(s.name)}</td>
  <td>${esc(s.platform)}</td>
  <td>${esc(s.scope)}</td>
  <td>${esc(s.description)}</td>
</tr>`;
    })
    .join('\n');

  return `<div class="db-section">
<div class="db-section-title">Skills</div>
<table class="db-table">
<thead><tr><th>Name</th><th>Platform</th><th>Scope</th><th>Description</th></tr></thead>
<tbody>
${rows}
</tbody>
</table>
</div>`;
}

/* ─── Section: Conflicts ───────────────────────────── */

function conflictsSection(conflicts: ConflictPair[]): string {
  if (conflicts.length === 0) {
    return `<div class="db-section"><div class="db-section-title">Conflicts</div><div class="empty-state">No conflicts detected.</div></div>`;
  }

  // Severity stacked bar
  const high = conflicts.filter((c) => c.severity === 'high').length;
  const med = conflicts.filter((c) => c.severity === 'med').length;
  const low = conflicts.filter((c) => c.severity === 'low').length;
  const total = conflicts.length;

  const sevBar = `<div class="sev-bar">
  ${high > 0 ? `<div class="sev-seg-high" style="width:${Math.round(high / total * 100)}%"></div>` : ''}
  ${med > 0 ? `<div class="sev-seg-med" style="width:${Math.round(med / total * 100)}%"></div>` : ''}
  ${low > 0 ? `<div class="sev-seg-low" style="width:${Math.round(low / total * 100)}%"></div>` : ''}
</div>`;

  const cards = conflicts
    .map((c) => {
      const pct = Math.round(c.similarity * 100);
      const desc = c.analysis?.summary ?? c.remediation ?? '';
      return `<div class="card">
  <div class="card-header">
    <span class="card-title">${esc(c.a.name)} vs ${esc(c.b.name)}</span>
    <span class="sev-${c.severity}">${c.severity.toUpperCase()}</span>
  </div>
  <div class="score-bar"><div class="score-fill" style="width:${pct}%"></div></div>
  <div class="card-desc">${pct}% similarity${desc ? ' &mdash; ' + esc(desc) : ''}</div>
</div>`;
    })
    .join('\n');

  return `<div class="db-section">
<div class="db-section-title">Conflicts (${conflicts.length})</div>
${sevBar}
${cards}
</div>`;
}

/* ─── Section: Audit ───────────────────────────────── */

function auditSection(auditResult: AuditResult): string {
  const allRules: RuleId[] = ['shell-exec', 'destructive', 'secret-leak', 'network-call'];
  const ruleCount: Record<string, number> = {};
  for (const r of allRules) ruleCount[r] = 0;
  for (const f of auditResult.findings) ruleCount[f.ruleId] = (ruleCount[f.ruleId] ?? 0) + 1;

  const heatmap = `<div class="rule-grid">
${allRules.map((r) => `  <div class="rule-cell"><div class="rule-count ${heatClass(ruleCount[r])}">${ruleCount[r]}</div><div class="rule-name">${esc(r)}</div></div>`).join('\n')}
</div>`;

  if (auditResult.findings.length === 0) {
    return `<div class="db-section">
<div class="db-section-title">Security Audit</div>
${heatmap}
<div class="empty-state">No security risks detected.</div>
</div>`;
  }

  const findingCards = auditResult.findings
    .map((f) => `<div class="card">
  <div class="card-header">
    <span class="card-title">${esc(f.skillName)} &mdash; ${esc(f.ruleId)}</span>
    <span class="sev-${f.severity}">${f.severity.toUpperCase()}</span>
  </div>
  <div class="card-desc">${esc(f.summary)}</div>
  <code class="match-text">${esc(f.matchedText)}</code>
</div>`)
    .join('\n');

  return `<div class="db-section">
<div class="db-section-title">Security Audit</div>
${heatmap}
${findingCards}
</div>`;
}

/* ─── Section: Cleanup ─────────────────────────────── */

function cleanupSection(duplicates: ConflictPair[], suggestions: CleanupSuggestion[]): string {
  if (duplicates.length === 0 && suggestions.length === 0) {
    return `<div class="db-section"><div class="db-section-title">Cleanup</div><div class="empty-state">No duplicates found.</div></div>`;
  }

  const scopeDups = duplicates.filter((d) => d.a.scope !== d.b.scope).length;
  const funcDups = duplicates.filter((d) => d.a.scope === d.b.scope).length;

  const summaryCards = `<div class="metric-cards" style="grid-template-columns:repeat(2,1fr);margin-bottom:16px">
  <div class="metric-card"><div class="metric-val">${scopeDups}</div><div class="metric-lbl">Cross-Scope Dups</div></div>
  <div class="metric-card"><div class="metric-val">${funcDups}</div><div class="metric-lbl">Same-Scope Dups</div></div>
</div>`;

  const pairItems = suggestions
    .map((s) => `<div class="cleanup-pair">
  <div style="font-weight:600;color:#e2e8f0;margin-bottom:6px">${esc(s.skillName)}</div>
  <div class="cleanup-path"><span class="suggest-badge badge-keep">keep</span> ${esc(s.keepPath)}</div>
  <div class="cleanup-path"><span class="suggest-badge badge-remove">remove</span> ${esc(s.removePath)}</div>
  <div class="cleanup-reason">${esc(s.keepReason)}</div>
</div>`)
    .join('\n');

  const dupPairItems = duplicates
    .map((d) => `<div class="cleanup-pair">
  <div style="font-weight:600;color:#e2e8f0;margin-bottom:6px">${esc(d.a.name)} <span style="color:#5a6a80">x${2}</span></div>
  <div class="cleanup-path">${esc(d.a.sourcePath)}</div>
  <div class="cleanup-path">${esc(d.b.sourcePath)}</div>
</div>`)
    .join('\n');

  return `<div class="db-section">
<div class="db-section-title">Cleanup</div>
${summaryCards}
${suggestions.length > 0 ? '<div class="db-section-title" style="font-size:12px">Suggestions</div>' : ''}
${pairItems}
${dupPairItems}
</div>`;
}

/* ─── Main export ──────────────────────────────────── */

export function renderDashboard(input: DashboardInput): string {
  const { skills, conflicts, auditResult, duplicates, suggestions } = input;
  const date = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
  const brandSub = `Mission Control &middot; ${skills.length} skill${skills.length !== 1 ? 's' : ''} &middot; ${date}`;

  // Derive name sets for status dots
  const conflictNames = new Set<string>();
  for (const c of conflicts) { conflictNames.add(c.a.name); conflictNames.add(c.b.name); }
  const dupNames = new Set<string>();
  for (const d of duplicates) { dupNames.add(d.a.name); dupNames.add(d.b.name); }
  const riskNames = new Set<string>();
  for (const f of auditResult.findings.filter((f) => f.severity === 'high')) { riskNames.add(f.skillName); }

  const body = [
    overviewSection(skills, conflicts, auditResult, duplicates),
    skillTableSection(skills, conflictNames, riskNames, dupNames),
    conflictsSection(conflicts),
    auditSection(auditResult),
    cleanupSection(duplicates, suggestions),
  ].join('\n');

  return dashboardPage(brandSub, body);
}
