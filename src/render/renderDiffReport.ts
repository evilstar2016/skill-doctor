import type { DiffResult } from '../diff/types';

export function renderDiffReport(result: DiffResult): string {
  const { skillA, skillB, analysis } = result;
  const generatedAt = new Date().toLocaleString();

  const triggerRows = `
    <tr><td class="label">${esc(skillA.name)}</td><td>${esc(skillA.whenToUse || skillA.triggers[0] || '—')}</td></tr>
    <tr><td class="label">${esc(skillB.name)}</td><td>${esc(skillB.whenToUse || skillB.triggers[0] || '—')}</td></tr>`;

  const coverageSection = analysis
    ? `
    <h2>功能覆盖</h2>
    <table>
      <thead><tr><th>维度</th><th>内容</th></tr></thead>
      <tbody>
        <tr><td class="label">共同覆盖</td><td>${listOrDash(analysis.coverageOverlap)}</td></tr>
        <tr><td class="label">仅 ${esc(skillA.name)}</td><td>${listOrDash(analysis.coverageOnlyA)}</td></tr>
        <tr><td class="label">仅 ${esc(skillB.name)}</td><td>${listOrDash(analysis.coverageOnlyB)}</td></tr>
      </tbody>
    </table>`
    : '';

  const prosConsSection = analysis
    ? `
    <h2>优缺点</h2>
    <div class="two-col">
      <div class="card">
        <div class="skill-name">${esc(skillA.name)}</div>
        ${renderProsCons(analysis.prosConsA)}
      </div>
      <div class="card">
        <div class="skill-name">${esc(skillB.name)}</div>
        ${renderProsCons(analysis.prosConsB)}
      </div>
    </div>`
    : '';

  const adviceSection = analysis
    ? `
    <h2>分情况建议</h2>
    <table>
      <thead><tr><th>场景</th><th>推荐</th><th>原因</th></tr></thead>
      <tbody>
        ${analysis.situationalAdvice.map((a) => `
        <tr>
          <td>${esc(a.condition)}</td>
          <td><span class="badge badge-rec">${a.recommendation === 'A' ? esc(skillA.name) : a.recommendation === 'B' ? esc(skillB.name) : '均可'}</span></td>
          <td class="reason">${esc(a.reason)}</td>
        </tr>`).join('')}
      </tbody>
    </table>`
    : '<p class="warn">⚠ LLM analysis unavailable — only extracted fields shown.</p>';

  return `<!DOCTYPE html>
<html lang="zh">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Skill Diff: ${esc(skillA.name)} vs ${esc(skillB.name)}</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #f8fafc; color: #1e293b; font-size: 14px; line-height: 1.6; }
  .page { max-width: 1000px; margin: 0 auto; padding: 32px 24px; }
  h1 { font-size: 22px; font-weight: 700; color: #0f172a; }
  h2 { font-size: 13px; font-weight: 600; color: #475569; text-transform: uppercase; letter-spacing: .06em; margin: 28px 0 10px; }
  .meta { color: #64748b; font-size: 13px; margin-top: 4px; }
  table { width: 100%; border-collapse: collapse; background: #fff; border: 1px solid #e2e8f0; border-radius: 10px; overflow: hidden; margin-bottom: 8px; }
  th { text-align: left; padding: 9px 14px; background: #f8fafc; font-size: 12px; font-weight: 600; color: #64748b; border-bottom: 1px solid #e2e8f0; }
  td { padding: 9px 14px; border-bottom: 1px solid #f1f5f9; vertical-align: top; }
  tr:last-child td { border-bottom: none; }
  td.label { font-weight: 600; color: #334155; white-space: nowrap; width: 200px; }
  td.reason { color: #64748b; font-size: 13px; }
  .two-col { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
  .card { background: #fff; border: 1px solid #e2e8f0; border-radius: 10px; padding: 16px 20px; }
  .skill-name { font-weight: 700; font-size: 15px; margin-bottom: 10px; color: #0f172a; }
  .pro { color: #15803d; margin: 3px 0; }
  .con { color: #64748b; margin: 3px 0; }
  .badge-rec { display: inline-block; padding: 2px 10px; border-radius: 99px; font-size: 12px; font-weight: 600; background: #dbeafe; color: #1d4ed8; }
  ul { padding-left: 16px; }
  li { margin: 2px 0; }
  .warn { color: #b45309; background: #fef3c7; border-radius: 8px; padding: 10px 14px; }
</style>
</head>
<body>
<div class="page">
  <h1>Skill Diff: ${esc(skillA.name)} vs ${esc(skillB.name)}</h1>
  <p class="meta">Generated ${generatedAt}</p>

  <h2>触发条件</h2>
  <table>
    <thead><tr><th>Skill</th><th>When to Use</th></tr></thead>
    <tbody>${triggerRows}</tbody>
  </table>

  ${coverageSection}
  ${prosConsSection}
  ${adviceSection}
</div>
</body>
</html>`;
}

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function listOrDash(items: string[]): string {
  if (!items || items.length === 0) return '<span style="color:#94a3b8">—</span>';
  if (items.length === 1) return esc(items[0]);
  return `<ul>${items.map((i) => `<li>${esc(i)}</li>`).join('')}</ul>`;
}

function renderProsCons(pc: { pros: string[]; cons: string[] }): string {
  const pros = pc.pros.map((p) => `<div class="pro">✓ ${esc(p)}</div>`).join('');
  const cons = pc.cons.map((c) => `<div class="con">– ${esc(c)}</div>`).join('');
  return pros + cons;
}
