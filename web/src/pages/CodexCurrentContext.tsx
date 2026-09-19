import { ArrowRight, RefreshCw } from 'lucide-react';
import { useEffect, useState } from 'react';
import type { DoctorSnapshot, UiResource } from '../../../src/application/types';
import type { CodexSkillCatalogReport } from '../../../src/context/codexSkillCatalog';
import type { ContextCostItem } from '../../../src/types/context';
import { loadCodexSkillCatalogs } from '../api';
import { InlineNotice, PageHeading } from '../components/ui';
import { useTranslation } from '../i18n';
import { ContextPage } from './ContextPage';

export function CodexCurrentContext({ projectDir, snapshot, onOptimize, openResource, onToggle }: {
  projectDir: string;
  snapshot: DoctorSnapshot | null;
  onOptimize: () => void;
  openResource: (resource: UiResource) => void;
  onToggle: (item: ContextCostItem) => Promise<void>;
}) {
  const { t, locale } = useTranslation();
  const [report, setReport] = useState<CodexSkillCatalogReport>();
  const [sessionId, setSessionId] = useState('');
  const [revision, setRevision] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  useEffect(() => {
    const controller = new AbortController();
    setReport(undefined); setLoading(true); setError('');
    void loadCodexSkillCatalogs(projectDir, controller.signal).then((value) => {
      if (!controller.signal.aborted) setReport(value);
    }).catch((reason) => {
      if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : String(reason));
    }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [projectDir, revision, snapshot?.id]);
  const session = report?.sessions.find((item) => item.sessionId === sessionId) ?? report?.sessions[0];
  const date = (value: string) => new Date(value).toLocaleString(locale);
  return <section className="codex-current-context">
    <PageHeading title={t('context.title')} subtitle={t('context.codex.observedSubtitle')} />
    <div className="codex-context-next"><div><strong>{t('context.codex.optimizeTitle')}</strong><p>{t('context.codex.optimizeDetail')}</p></div><button className="button primary" onClick={onOptimize}>{t('context.codex.optimizeAction')}<ArrowRight size={16} /></button></div>
    <InlineNotice kind="info" title={t('context.codex.controlTitle')}>{t('context.codex.controlDetail')}</InlineNotice>
    <div className="section-toolbar"><div><strong>{t('context.codex.catalogTitle')}</strong><small>{t('context.codex.historyScope')}</small></div><button className="button ghost compact" aria-label={t('opt.refresh')} disabled={loading} onClick={() => setRevision((value) => value + 1)}><RefreshCw size={15} /></button></div>
    {loading && <p role="status">{t('opt.loading')}</p>}
    {error && <p role="alert">{error}</p>}
    {!loading && !error && !session && <p>{t('context.codex.noHistory')}</p>}
    {session && <>
      <label className="codex-catalog-session">{t('context.codex.session')}<select value={session.sessionId} onChange={(event) => setSessionId(event.target.value)}>{report?.sessions.map((item) => <option key={item.sessionId} value={item.sessionId}>{date(item.timestamp)} · {item.sessionId.slice(-8)} · {t(`context.codex.${item.status}`)}</option>)}</select></label>
      <div className="codex-catalog-summary"><strong>{t(`context.codex.${session.status}`)}</strong><span>{t('context.codex.skillCount', { count: session.status === 'unknown' ? '—' : session.skills.length.toLocaleString(locale) })}</span><span>{session.tokens?.toLocaleString(locale) ?? '—'} Token · {t('context.codex.blockEstimate')}</span></div>
      <p className="muted">{t('context.codex.evidenceBoundary')}</p>
      {session.status !== 'present' && <p>{t(session.status === 'absent' ? 'context.codex.absentDetail' : 'context.codex.unknownDetail')}</p>}
      <ul className="codex-observed-skills">{session.skills.map((skill, index) => <li key={`${skill.name}:${index}`}><strong>{skill.name}</strong><p>{skill.description}</p>{skill.sourcePath && <code>{skill.sourcePath}</code>}</li>)}</ul>
      <details className="codex-catalog-source"><summary>{t('opt.dataSource')}</summary><p>{date(session.timestamp)} · Codex {session.version ?? '—'} · {session.sessionId}</p><code>{session.sourcePath}</code><p>host_skills.instructions / &lt;skills_instructions&gt;</p></details>
    </>}
    {report?.diagnostics.map((message, index) => <p className="muted" key={index}>{message}</p>)}
    <details className="codex-static-context"><summary>{t('context.codex.otherResources')}</summary><p className="muted">{t('context.codex.otherResourcesDetail')}</p><ContextPage snapshot={snapshot} openResource={openResource} onToggle={onToggle} excludeCodexSkills /></details>
  </section>;
}
