import { useEffect, useState } from 'react';
import type { SecurityMode, SecurityState } from '../../../src/security-component/component';
import { useTranslation } from '../i18n';

async function call(body?: Record<string, unknown>): Promise<SecurityState & { task?: string; target?: string }> {
  const response = await fetch('/api/security-component', body ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : undefined);
  const data = await response.json();
  if (!response.ok) throw new Error(data.error?.message ?? 'Request failed');
  return data;
}
export function SecurityComponent() {
  const { locale } = useTranslation();
  const zh = locale === 'zh-CN';
  const [state, setState] = useState<SecurityState>({ enabled: false, reports: [] });
  const [target, setTarget] = useState('');
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [mode, setMode] = useState<SecurityMode>('design');
  const [scope, setScope] = useState('');
  const [revision, setRevision] = useState('');
  const [designReportId, setDesignReportId] = useState('');
  const [task, setTask] = useState('');
  useEffect(() => {
    let active = true;
    call().then((data) => { if (active) { setState(data); setTarget(data.target ?? ''); setReady(true); } }).catch((cause) => { if (active) setError(String(cause)); });
    return () => { active = false; };
  }, []);
  async function run(action: () => Promise<void>) {
    setBusy(true); setError('');
    try { await action(); } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); } finally { setBusy(false); }
  }
  return <details className="drawer-section">
    <summary>{zh ? '可选安全组件 · Cloudflare' : 'Optional security component · Cloudflare'}</summary>
    <p className="muted">{zh ? '安全设计与代码审计由外部编码 Agent 执行。导入仅校验格式，结论未经 skill-doctor 独立核验。' : 'External coding Agents perform design reviews and code audits. Import validates format, not the conclusions.'}</p>
    <p className="muted" style={{ overflowWrap: 'anywhere' }}>{target}</p>
    {error && <p role="alert">{error}</p>}
    <label><input type="checkbox" checked={state.enabled} disabled={!ready || busy} onChange={(event) => { const enabled = event.target.checked; void run(async () => { setState(await call({ action: 'enable', enabled })); setTask(''); }); }} />{zh ? '为当前项目启用' : 'Enable for this project'}</label>
    {state.enabled && <>
      <p className="muted">{zh ? '将任务交给已有 Agent；开始前检查其模型数据共享和执行权限。输出保存在项目外。' : 'Hand the task to your Agent. Check its model data sharing and permissions first. Save output outside the project.'}</p>
      <label className="field"><span>{zh ? '模式' : 'Mode'}</span><select value={mode} onChange={(event) => { setMode(event.target.value as SecurityMode); setTask(''); }}><option value="design">{zh ? '安全设计评审' : 'Security design review'}</option><option value="code">{zh ? '代码安全审计' : 'Code security audit'}</option></select></label>
      <label className="field"><span>{zh ? '审计范围或设计文档' : 'Audit scope or design documents'}</span><input value={scope} onChange={(event) => { setScope(event.target.value); setTask(''); }} /></label>
      <label className="field"><span>{zh ? '目标代码版本' : 'Target revision'}</span><input value={revision} onChange={(event) => { setRevision(event.target.value); setTask(''); }} placeholder="Git commit" /></label>
      {mode === 'code' && <label className="field"><span>{zh ? '关联设计报告' : 'Linked design report'}</span><select value={designReportId} onChange={(event) => { setDesignReportId(event.target.value); setTask(''); }}><option value="">{zh ? '不关联' : 'None'}</option>{state.reports.filter((entry) => entry.report.mode === 'design').map((entry) => <option key={entry.id} value={entry.id}>{entry.report.scope} · {entry.id.slice(0, 8)}</option>)}</select></label>}
      <button className="button primary" disabled={busy || !scope.trim() || !revision.trim()} onClick={() => void run(async () => { const result = await call({ action: 'prepare', mode, scope, revision, ...(mode === 'code' && designReportId ? { designReportId } : {}) }); setTask(result.task ?? ''); })}>{zh ? '生成 Agent 任务' : 'Prepare Agent task'}</button>
      {task && <label className="field"><span>{zh ? '复制以下任务到外部 Agent' : 'Copy this task to your external Agent'}</span><textarea readOnly rows={12} value={task} onFocus={(event) => event.target.select()} /></label>}
      <label className="field"><span>{zh ? '导入 security-report.json（最大 1 MiB）' : 'Import security-report.json (up to 1 MiB)'}</span><input type="file" accept=".json,application/json" disabled={busy} onChange={(event) => { const file = event.target.files?.[0]; event.target.value = ''; if (file) void run(async () => { if (file.size > 1024 * 1024) throw new Error(zh ? '报告超过 1 MiB' : 'Report exceeds 1 MiB'); setState(await call({ action: 'import', report: JSON.parse(await file.text()) })); }); }} /></label>
      <p>{zh ? `已导入 ${state.reports.length} 份报告` : `${state.reports.length} imported reports`}</p>
      {state.reports.map((entry) => <details key={entry.id}><summary>{entry.report.mode === 'design' ? (zh ? '设计评审' : 'Design review') : (zh ? '代码审计' : 'Code audit')} · {entry.report.scope} · {entry.report.revision}</summary><p className="muted">{zh ? '外部报告结论 · 仅通过格式校验' : 'Externally reported · format validated only'} · {entry.importedAt}</p>{entry.report.design && <ul>{entry.report.design.requirements.map((requirement) => <li key={requirement.id}><strong>{requirement.id}</strong> · {requirement.description}</li>)}</ul>}{entry.report.checks && <ul>{entry.report.checks.map((check) => <li key={check.requirementId}><strong>{check.requirementId}</strong> · {check.status} · {check.evidence}</li>)}</ul>}{entry.report.findings && <ul>{entry.report.findings.map((finding, index) => <li key={index}><strong>{String(finding.title)}</strong> · {String(finding.verdict)}<p>{String(finding.description)}</p></li>)}</ul>}<pre style={{ overflowWrap: 'anywhere', whiteSpace: 'pre-wrap', maxWidth: '100%' }}>{JSON.stringify(entry, null, 2)}</pre></details>)}
    </>}
  </details>;
}
