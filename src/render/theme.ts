/* Shared design system for all HTML reports — gstack-decoder aesthetic */

export function esc(s: string): string {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function htmlPage(title: string, brandSub: string, body: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${title}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@200;300;400;500;600&display=swap" rel="stylesheet">
<style>${THEME_CSS}</style>
</head>
<body>
<header class="site-header">
  <div class="container">
    <div class="header-inner">
      <div>
        <div class="brand-name">skill<span>·</span>doctor</div>
        <div class="brand-sub">${brandSub}</div>
      </div>
      <button class="theme-btn" id="themeToggle">&#9680; Dark</button>
    </div>
  </div>
</header>
<main class="container">
${body}
</main>
${PAGE_SCRIPT}
</body>
</html>`;
}

export function section(label: string, content: string): string {
  return `<div class="section">
  <div class="section-label">${label}</div>
  ${content}
</div>`;
}

const PAGE_SCRIPT = `<script>
(function(){
  var btn=document.getElementById('themeToggle'),dark=false;
  btn.addEventListener('click',function(){
    dark=!dark;
    document.documentElement.setAttribute('data-theme',dark?'dark':'');
    btn.textContent=dark?'◑ Light':'◐ Dark';
  });
  document.querySelectorAll('.conflict-head').forEach(function(head){
    head.addEventListener('click',function(){
      var body=head.closest('.conflict-card').querySelector('.conflict-body');
      var icon=head.querySelector('.toggle-icon');
      var open=body.classList.toggle('open');
      icon.classList.toggle('open',open);
    });
  });
})();
</script>`;

const THEME_CSS = `
:root {
  --bg:         #FAFAF8;
  --bg-alt:     #F3F1ED;
  --text:       #1A1A1A;
  --text-light: #4A4640;
  --muted:      #9A9590;
  --accent:     #D4A574;
  --accent-dim: rgba(212,165,116,0.12);
  --surface:    #EDECE9;
  --border:     1px solid rgba(0,0,0,0.07);
  --border-acc: 1px solid rgba(212,165,116,0.35);
  --radius:     4px;
  --font:       'Inter', system-ui, -apple-system, sans-serif;
  --mono:       'Menlo', 'Consolas', 'Courier New', monospace;
  --shadow:     0 1px 3px rgba(0,0,0,0.05);
  --shadow-md:  0 4px 16px rgba(0,0,0,0.08);
  --high-fg:#C4544A; --high-bg:rgba(196,84,74,0.08);
  --med-fg: #B07828; --med-bg: rgba(176,120,40,0.08);
  --low-fg: #5A8A6A; --low-bg: rgba(90,138,106,0.08);
  --dup-fg: #7A5A9A; --dup-bg: rgba(122,90,154,0.08);
}
[data-theme="dark"] {
  --bg:         #1C1B19;
  --bg-alt:     #232220;
  --text:       #E8E4DF;
  --text-light: #B0ACA4;
  --muted:      #6B6560;
  --surface:    #2A2822;
  --border:     1px solid rgba(255,255,255,0.06);
  --border-acc: 1px solid rgba(212,165,116,0.25);
  --shadow:     0 1px 3px rgba(0,0,0,0.2);
  --shadow-md:  0 4px 16px rgba(0,0,0,0.3);
  --high-bg:rgba(196,84,74,0.15);
  --med-bg: rgba(176,120,40,0.15);
  --low-bg: rgba(90,138,106,0.15);
  --dup-bg: rgba(122,90,154,0.15);
}
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
body{font-family:var(--font);background:var(--bg);color:var(--text);font-size:14px;font-weight:400;line-height:1.7;-webkit-font-smoothing:antialiased;transition:background 0.3s,color 0.3s}
.container{max-width:1080px;margin:0 auto;padding:0 32px}
.site-header{border-bottom:var(--border);padding:28px 0 22px;margin-bottom:52px}
.header-inner{display:flex;align-items:flex-start;justify-content:space-between;gap:24px}
.brand-name{font-size:22px;font-weight:300;letter-spacing:-0.3px}
.brand-name span{color:var(--accent)}
.brand-sub{margin-top:5px;font-size:12px;color:var(--muted);font-weight:300}
.theme-btn{background:var(--surface);border:var(--border);color:var(--muted);font-family:var(--font);font-size:11px;padding:6px 13px;border-radius:var(--radius);cursor:pointer;flex-shrink:0;margin-top:3px;letter-spacing:0.5px;transition:color 0.2s}
.theme-btn:hover{color:var(--text)}
.section{margin-bottom:52px}
.section-label{font-size:10px;font-weight:500;letter-spacing:2px;text-transform:uppercase;color:var(--muted);padding-bottom:12px;border-bottom:var(--border);margin-bottom:18px}
.metrics{display:grid;grid-template-columns:repeat(4,1fr);gap:12px}
@media(max-width:640px){.metrics{grid-template-columns:repeat(2,1fr)}}
.metric-card{background:var(--surface);border:var(--border);border-radius:var(--radius);padding:20px 24px;box-shadow:var(--shadow)}
.metric-val{font-size:40px;font-weight:200;line-height:1;margin-bottom:6px;font-variant-numeric:tabular-nums}
.metric-val.warn{color:var(--med-fg)}
.metric-val.danger{color:var(--high-fg)}
.metric-label{font-size:10px;font-weight:500;letter-spacing:1.5px;text-transform:uppercase;color:var(--muted)}
.tag-list{display:flex;flex-wrap:wrap;gap:8px}
.tag{font-size:12px;padding:4px 10px;border:var(--border);border-radius:2px;color:var(--text-light);background:var(--surface);display:flex;align-items:center;gap:6px}
.tag-count{font-size:11px;color:var(--accent);font-weight:500}
.conflict-list{display:flex;flex-direction:column;gap:6px}
.conflict-card{border:var(--border);border-radius:var(--radius);background:var(--bg);overflow:hidden;box-shadow:var(--shadow);transition:box-shadow 0.2s}
.conflict-card:hover{box-shadow:var(--shadow-md)}
.conflict-card.high{border-left:3px solid var(--high-fg)}
.conflict-card.med {border-left:3px solid var(--med-fg)}
.conflict-card.low {border-left:3px solid var(--low-fg)}
.conflict-card.dup {border-left:3px solid var(--dup-fg)}
.conflict-head{display:flex;align-items:center;gap:12px;padding:13px 16px;cursor:pointer;user-select:none}
.conflict-names{flex:1;font-size:13px;font-family:var(--mono);color:var(--text);display:flex;align-items:center;gap:8px;flex-wrap:wrap;min-width:0}
.conflict-sep{color:var(--muted);font-family:var(--font)}
.sev-badge{font-size:9px;font-weight:600;letter-spacing:1.5px;text-transform:uppercase;padding:3px 7px;border-radius:2px;flex-shrink:0}
.sev-badge.high{background:var(--high-bg);color:var(--high-fg)}
.sev-badge.med {background:var(--med-bg); color:var(--med-fg)}
.sev-badge.low {background:var(--low-bg); color:var(--low-fg)}
.sev-badge.dup {background:var(--dup-bg); color:var(--dup-fg)}
.sim-pct{font-size:12px;color:var(--muted);margin-left:auto;flex-shrink:0;font-variant-numeric:tabular-nums}
.toggle-icon{font-size:14px;color:var(--muted);flex-shrink:0;transition:transform 0.2s;line-height:1;margin-left:8px}
.toggle-icon.open{transform:rotate(180deg)}
.conflict-body{padding:0 16px 14px;border-top:var(--border);display:none}
.conflict-body.open{display:block}
.conflict-meta{display:flex;flex-wrap:wrap;gap:12px;padding-top:10px;font-size:11px;color:var(--muted);letter-spacing:0.3px}
.conflict-summary{font-size:13px;color:var(--text-light);margin-top:8px;line-height:1.6}
.conflict-fix{margin-top:8px;font-size:12px;color:var(--accent)}
.finding-rule{font-size:9px;font-weight:600;letter-spacing:1.5px;text-transform:uppercase;padding:2px 7px;border-radius:2px;background:var(--bg-alt);color:var(--text-light)}
.finding-match{font-family:var(--mono);font-size:12px;background:var(--bg-alt);border:var(--border);border-radius:var(--radius);padding:8px 12px;color:var(--text-light);margin-top:8px;overflow-x:auto;white-space:pre-wrap;word-break:break-all}
.finding-prov{margin-top:8px;font-size:11px;color:var(--muted);display:flex;flex-wrap:wrap;gap:14px}
.skills-table{width:100%;border-collapse:collapse}
.skills-table th{text-align:left;padding:9px 13px;font-size:10px;font-weight:500;letter-spacing:1.5px;text-transform:uppercase;color:var(--muted);border-bottom:var(--border);background:var(--surface)}
.skills-table td{padding:9px 13px;border-bottom:var(--border);vertical-align:middle;font-size:13px}
.skills-table tbody tr:last-child td{border-bottom:none}
.skills-table tbody tr:hover td{background:var(--surface)}
.skill-name-cell{font-family:var(--mono);font-size:12px;font-weight:500}
.scope-badge{font-size:9px;font-weight:500;letter-spacing:1px;text-transform:uppercase;padding:2px 7px;border-radius:2px}
.scope-badge.global {background:var(--dup-bg);color:var(--dup-fg)}
.scope-badge.project{background:rgba(74,122,155,0.1);color:#4A7A9B}
.platform-tag{font-size:11px;padding:2px 8px;border:var(--border);border-radius:2px;color:var(--text-light);background:var(--surface)}
.desc-cell{color:var(--muted);max-width:240px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.trigger-cell{color:var(--muted);font-size:11px}
.empty-state{color:var(--muted);font-style:italic;padding:20px 13px}
.two-col{display:grid;grid-template-columns:1fr 1fr;gap:12px}
@media(max-width:640px){.two-col{grid-template-columns:1fr}}
.diff-card{background:var(--surface);border:var(--border);border-radius:var(--radius);padding:20px 22px;box-shadow:var(--shadow)}
.diff-card-name{font-size:14px;font-weight:500;font-family:var(--mono);color:var(--accent);margin-bottom:12px;padding-bottom:10px;border-bottom:var(--border)}
.pro-item{font-size:13px;color:var(--low-fg);margin:4px 0;display:flex;gap:6px;align-items:flex-start}
.con-item{font-size:13px;color:var(--muted);margin:4px 0;display:flex;gap:6px;align-items:flex-start}
.advice-table{width:100%;border-collapse:collapse}
.advice-table th{text-align:left;padding:8px 13px;font-size:10px;font-weight:500;letter-spacing:1.5px;text-transform:uppercase;color:var(--muted);border-bottom:var(--border);background:var(--surface)}
.advice-table td{padding:9px 13px;border-bottom:var(--border);vertical-align:top;font-size:13px}
.advice-table tbody tr:last-child td{border-bottom:none}
.advice-table tbody tr:hover td{background:var(--surface)}
.rec-a{font-family:var(--mono);font-size:11px;padding:2px 8px;border-radius:2px;background:rgba(74,122,155,0.12);color:#4A7A9B;font-weight:500}
.rec-b{font-family:var(--mono);font-size:11px;padding:2px 8px;border-radius:2px;background:var(--accent-dim);color:var(--accent);font-weight:500}
.rec-both{font-size:11px;padding:2px 8px;border-radius:2px;background:var(--surface);color:var(--muted);font-weight:500}
.reason-cell{color:var(--muted);font-size:12px}
.warn-banner{background:var(--med-bg);border:1px solid rgba(176,120,40,0.3);border-radius:var(--radius);padding:12px 16px;color:var(--med-fg);font-size:13px;margin-bottom:16px}
.coverage-table{width:100%;border-collapse:collapse}
.coverage-table th{text-align:left;padding:8px 13px;font-size:10px;font-weight:500;letter-spacing:1.5px;text-transform:uppercase;color:var(--muted);border-bottom:var(--border);background:var(--surface)}
.coverage-table td{padding:9px 13px;border-bottom:var(--border);vertical-align:top;font-size:13px}
.coverage-table tbody tr:last-child td{border-bottom:none}
.coverage-label{font-size:12px;font-weight:500;color:var(--text-light);white-space:nowrap;width:180px}
.coverage-items{color:var(--muted);font-size:12px}
.all-clear{text-align:center;padding:48px 24px;border:var(--border);border-radius:var(--radius);background:var(--surface)}
.all-clear-icon{font-size:32px;margin-bottom:10px}
.all-clear-title{font-size:18px;font-weight:300;color:var(--low-fg);margin-bottom:6px}
.all-clear-sub{font-size:13px;color:var(--muted)}
`;
