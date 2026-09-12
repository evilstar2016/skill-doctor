import { ArrowRight, ChevronRight, Eye, LockKeyhole, Search, Undo2, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';

import type { HistoryCandidate, OfflineHistoryAnalysis } from '../../../src/benefit/historyTypes';
import { applyBenefitControl, previewBenefitControl, undoBenefitControl, type ControlPreview, type ControlResult } from '../api';
import { useTranslation } from '../i18n';
import './historyBenefit.css';

type RecommendationFilter = 'review-disable' | 'retain' | 'unknown' | 'all';
type Strategy = 'individual' | 'whole';

interface PendingControl {
  kind: string;
  id: string;
  enabled: boolean;
  label: string;
  preview: ControlPreview;
}

interface OperationState {
  result: ControlResult;
  label: string;
  restored: boolean;
}

function controlAvailable(item: HistoryCandidate): boolean {
  return item.kind === 'recommended_plugins'
    || (item.kind === 'skills_instructions' && item.control === 'source-supported' && Boolean(item.sourcePath) && !/\/plugins\/cache\/|\/\.system\//.test(item.sourcePath ?? ''));
}

function isMatch(item: HistoryCandidate, query: string): boolean {
  if (!query.trim()) return true;
  const needle = query.trim().toLocaleLowerCase();
  return `${item.name} ${item.id} ${item.sourcePath ?? ''}`.toLocaleLowerCase().includes(needle);
}

export function HistoryControlPanel({ history, jobId, projectDir, showAgentPrompt = true, onExpired }: { history: OfflineHistoryAnalysis; jobId: string; projectDir: string; showAgentPrompt?: boolean; onExpired?: () => void }) {
  const { t } = useTranslation();
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<RecommendationFilter>('review-disable');
  const [page, setPage] = useState(0);
  const [selected, setSelected] = useState<HistoryCandidate>();
  const [pending, setPending] = useState<PendingControl>();
  const [operation, setOperation] = useState<OperationState>();
  const [undoPending, setUndoPending] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);
  const [strategy, setStrategy] = useState<Strategy>('individual');
  const panelRef = useRef<HTMLElement>(null);
  const lastTriggerRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => setPage(0), [filter, query]);

  const filteredItems = useMemo(() => history.usageProfile
    .filter((item) => (filter === 'all' || item.recommendation === filter) && isMatch(item, query))
    .sort((left, right) => {
      const rank = (item: HistoryCandidate) => item.recommendation === 'review-disable' ? 0 : item.recommendation === 'unknown' ? 1 : 2;
      return rank(left) - rank(right) || left.kind.localeCompare(right.kind) || left.name.localeCompare(right.name);
    }), [filter, history.usageProfile, query]);
  const pageSize = 20;
  const pageCount = Math.max(1, Math.ceil(filteredItems.length / pageSize));
  const boundedPage = Math.min(page, pageCount - 1);
  const pageItems = filteredItems.slice(boundedPage * pageSize, (boundedPage + 1) * pageSize);
  const groups = (['skills_instructions', 'recommended_plugins'] as const).map((kind) => ({
    kind,
    items: pageItems.filter((item) => item.kind === kind),
  })).filter((group) => group.items.length > 0);
  const reviewCount = history.usageProfile.filter((item) => item.recommendation === 'review-disable').length;
  const controllableCount = history.usageProfile.filter((item) => item.recommendation === 'review-disable' && controlAvailable(item)).length;
  const drawerOpen = Boolean(selected || pending || undoPending);
  const prompt = t('benefit.controlAgentPrompt', { project: projectDir });

  useEffect(() => {
    if (!drawerOpen) return;
    const focusTarget = panelRef.current?.querySelector<HTMLElement>('[data-history-autofocus]');
    focusTarget?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeDrawer();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [drawerOpen]);

  const focusLastTrigger = () => {
    const trigger = lastTriggerRef.current;
    window.setTimeout(() => trigger?.focus(), 0);
  };

  const closeDrawer = () => {
    setSelected(undefined);
    setPending(undefined);
    setUndoPending(false);
    setError('');
    focusLastTrigger();
  };

  const openCandidate = (item: HistoryCandidate, trigger?: HTMLButtonElement) => {
    lastTriggerRef.current = trigger ?? null;
    setSelected(item);
    setPending(undefined);
    setUndoPending(false);
    setError('');
  };

  const preview = async (kind: string, id: string, enabled: boolean, label: string, trigger?: HTMLButtonElement) => {
    lastTriggerRef.current = trigger ?? lastTriggerRef.current;
    setBusy(true);
    setError('');
    setPending(undefined);
    setUndoPending(false);
    try {
      const next = await previewBenefitControl({ jobId, kind, id, enabled });
      setPending({ kind, id, enabled, label, preview: next });
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : String(nextError));
    } finally {
      setBusy(false);
    }
  };

  const previewCandidate = (item: HistoryCandidate, enabled: boolean) => {
    void preview(item.kind, item.id, enabled, item.name);
  };

  const apply = async () => {
    if (!pending || !pending.preview.changed) return;
    setBusy(true);
    setError('');
    try {
      const next = await applyBenefitControl({ jobId, kind: pending.kind, id: pending.id, enabled: pending.enabled, confirmation: pending.preview.digest });
      setOperation({ result: next, label: pending.label, restored: false });
      setPending(undefined);
      setSelected(undefined);
      setUndoPending(false);
      focusLastTrigger();
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : String(nextError));
    } finally {
      setBusy(false);
    }
  };

  const beginUndo = (trigger: HTMLButtonElement) => {
    lastTriggerRef.current = trigger;
    setSelected(undefined);
    setPending(undefined);
    setUndoPending(true);
    setError('');
  };

  const undo = async () => {
    if (!operation) return;
    setBusy(true);
    setError('');
    try {
      await undoBenefitControl(jobId, operation.result.operationId);
      setOperation({ ...operation, restored: true });
      setUndoPending(false);
      focusLastTrigger();
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : String(nextError));
    } finally {
      setBusy(false);
    }
  };

  const actionLabel = (item: HistoryCandidate): string => {
    if (item.recommendation === 'retain') return t('benefit.historyRetainAction');
    if (controlAvailable(item)) return t('benefit.historyReviewAction');
    return t('benefit.historyLimitAction');
  };

  const kindLabel = (item: HistoryCandidate): string => item.kind === 'recommended_plugins' ? t('benefit.historyPlugin') : 'Skill';
  const recommendationReason = (item: HistoryCandidate): string => t(item.recommendation === 'retain' ? 'benefit.controlUsedReason' : item.recommendation === 'unknown' ? 'benefit.controlUnknownReason' : 'benefit.controlUnusedReason');
  const pendingAction = pending ? t(pending.enabled ? 'benefit.controlConfirmEnableAction' : 'benefit.controlConfirmDisableAction', { target: pending.label }) : '';
  const projectedStrategy = history.pluginControl?.wholeBlockSelected ? 'whole' : 'individual';
  const reportExpired = /expired|unavailable|not found|benefit_not_found/i.test(error);

  return <section className="panel history-control-panel" aria-label={t('benefit.controlTitle')}>
    <header className="history-control-heading">
      <div><span className="history-benefit-kicker">{t('benefit.historyRecommendationsKicker')}</span><h2>{t('benefit.historyRecommendationsTitle')}</h2><p>{t('benefit.historyRecommendationsIntro')}</p></div>
      <div className="history-control-counts"><span>{t('benefit.historyReviewCount')} <strong>{reviewCount}</strong></span><span>{t('benefit.historyControllable')} <strong>{controllableCount}</strong></span></div>
    </header>

    <section className="history-strategy" aria-labelledby="history-strategy-title">
      <div className="history-strategy-heading"><div><h3 id="history-strategy-title">{t('benefit.controlStrategyTitle')}</h3><p>{t('benefit.controlStrategyIntro')}</p></div><span className="history-state-pill unknown">{t('benefit.historyConfigUnknown')}</span></div>
      <div className="history-strategy-options" role="radiogroup" aria-label={t('benefit.controlStrategyTitle')}>
        <label className={strategy === 'individual' ? 'selected' : ''}><input type="radio" name="history-strategy" checked={strategy === 'individual'} onChange={() => setStrategy('individual')} /><span><strong>{t('benefit.controlStrategyIndividual')}</strong><small>{t('benefit.controlStrategyIndividualDetail')}</small></span></label>
        <label className={strategy === 'whole' ? 'selected' : ''}><input type="radio" name="history-strategy" checked={strategy === 'whole'} onChange={() => setStrategy('whole')} /><span><strong>{t('benefit.controlStrategyWhole')}</strong><small>{t('benefit.controlStrategyWholeDetail')}</small></span></label>
      </div>
      <div className="history-strategy-footnote"><span>{t('benefit.controlStrategyProjection', { state: t(projectedStrategy === 'whole' ? 'benefit.controlStrategyWhole' : 'benefit.controlStrategyIndividual') })}</span>{strategy === 'whole' && <div className="history-strategy-actions"><button className="button primary compact" disabled={busy} onClick={(event) => void preview('recommendations', 'recommended_plugins', false, t('benefit.controlBlockDisable'), event.currentTarget)}>{t('benefit.controlStrategyPreviewDisable')}</button><button className="button secondary compact" disabled={busy} onClick={(event) => void preview('recommendations', 'recommended_plugins', true, t('benefit.controlBlockEnable'), event.currentTarget)}>{t('benefit.controlStrategyPreviewEnable')}</button></div>}</div>
    </section>

    <div className="history-control-toolbar">
      <label className="history-search"><Search size={16} /><span className="visually-hidden">{t('benefit.historySearch')}</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t('benefit.historySearchPlaceholder')} /></label>
      <label className="history-filter"><span>{t('benefit.historyFilterLabel')}</span><select value={filter} onChange={(event) => setFilter(event.target.value as RecommendationFilter)}><option value="review-disable">{t('benefit.historyFilterReview')}</option><option value="retain">{t('benefit.historyFilterRetain')}</option><option value="unknown">{t('benefit.historyFilterUnknown')}</option><option value="all">{t('benefit.historyFilterAll')}</option></select></label>
      <span className="history-control-result-count">{t('benefit.historyResultCount', { count: filteredItems.length })}</span>
    </div>

    {error && !drawerOpen && <div className="history-control-error" role="alert"><span>{reportExpired ? t('benefit.reportExpiredDetail') : error}</span>{reportExpired && onExpired && <button className="button secondary compact" onClick={onExpired}>{t('benefit.reanalyze')}</button>}<button className="icon-button" onClick={() => setError('')} aria-label={t('benefit.controlCloseError')}><X size={15} /></button></div>}
    {operation && <div className="history-control-result" role="status"><div><strong>{t(operation.restored ? 'benefit.controlRestored' : 'benefit.controlSuccess')}</strong><span>{operation.label}</span><code>{operation.result.operationId}</code></div><button className="button secondary compact" disabled={busy || operation.restored} onClick={(event) => beginUndo(event.currentTarget)}><Undo2 size={14} />{t('benefit.controlUndo')}</button></div>}

    {groups.length > 0 ? <div className="history-candidate-groups">{groups.map((group) => <section key={group.kind} className="history-candidate-group" aria-labelledby={`history-group-${group.kind}`}>
      <div className="history-candidate-group-heading"><h3 id={`history-group-${group.kind}`}>{group.kind === 'recommended_plugins' ? t('benefit.historyPluginGroup') : t('benefit.historySkillGroup')}</h3><span>{group.items.length}</span></div>
      <div className="history-candidate-list">{group.items.map((item) => <article className="history-candidate-row" key={`${item.kind}:${item.id}`}>
        <div className="history-candidate-main">
          <span className="history-candidate-copy"><span className="history-candidate-name"><strong>{item.name}</strong><small>{kindLabel(item)}</small></span><span className="history-candidate-reason">{recommendationReason(item)}</span><span className="history-candidate-evidence">{t('benefit.controlCounts', { mentions: item.explicitMentionCount ?? 0, activations: item.activationCount ?? 0, reads: item.observedReadCount ?? 0, sessions: item.usedSessionCount ?? 0 })}</span></span>
          <span className="history-candidate-status"><span className={`history-recommendation ${item.recommendation}`}>{t(`benefit.controlRecommendation.${item.recommendation}`)}</span><span className="history-state-pill unknown">{t('benefit.historyConfigUnknown')}</span>{controlAvailable(item) ? <span className="history-feasibility">{t('benefit.historyControlAvailable')}</span> : <span className="history-feasibility">{t('benefit.historyControlUnverified')}</span>}</span>
          <ChevronRight size={17} aria-hidden />
        </div>
        <button className={`button compact ${item.recommendation === 'review-disable' && controlAvailable(item) ? 'primary' : 'secondary'}`} onClick={(event) => openCandidate(item, event.currentTarget)}>{actionLabel(item)}<ArrowRight size={14} /></button>
      </article>)}</div>
    </section>)}</div> : <div className="history-control-empty"><Eye size={20} /><div><strong>{query ? t('benefit.historyNoSearchResults') : filter === 'review-disable' ? t('benefit.historyNoReviewItems') : t('benefit.historyNoItems')}</strong><p>{query ? t('benefit.historyNoSearchDetail') : t('benefit.historyNoItemsDetail')}</p></div></div>}

    <div className="history-pagination"><span>{t('benefit.historyPageInfo', { page: boundedPage + 1, pages: pageCount, count: filteredItems.length })}</span><div><button className="button secondary compact" disabled={boundedPage === 0} onClick={() => setPage(Math.max(0, boundedPage - 1))}>{t('benefit.previous')}</button><button className="button secondary compact" disabled={boundedPage >= pageCount - 1} onClick={() => setPage(Math.min(pageCount - 1, boundedPage + 1))}>{t('benefit.next')}</button></div></div>

    {showAgentPrompt && <details className="history-agent-inline"><summary>{t('benefit.controlAgentTitle')}</summary><p>{prompt}</p><button className="button secondary compact" onClick={async () => { try { await navigator.clipboard.writeText(prompt); setCopied(true); window.setTimeout(() => setCopied(false), 1600); } catch (nextError) { setError(nextError instanceof Error ? nextError.message : String(nextError)); } }}>{t(copied ? 'benefit.controlCopied' : 'benefit.controlCopy')}</button></details>}

    {drawerOpen && <div className="history-drawer-overlay" onMouseDown={(event) => { if (event.target === event.currentTarget) closeDrawer(); }}>
      <aside className="history-control-drawer" role="dialog" aria-modal="true" aria-labelledby="history-control-drawer-title" ref={panelRef}>
        <header className="history-drawer-heading"><div><span className="history-benefit-kicker">{pending ? t('benefit.controlConfirmTitle') : undoPending ? t('benefit.controlUndo') : t('benefit.historyDetailKicker')}</span><h2 id="history-control-drawer-title">{pending ? pendingAction : undoPending ? t('benefit.controlUndo') : selected?.name}</h2></div><button className="icon-button" data-history-autofocus aria-label={t('benefit.controlClosePanel')} onClick={closeDrawer}><X size={17} /></button></header>
        <div className="history-drawer-body">
          {error && <div className="history-control-error" role="alert"><span>{reportExpired ? t('benefit.reportExpiredDetail') : error}</span>{reportExpired && onExpired && <button className="button secondary compact" onClick={onExpired}>{t('benefit.reanalyze')}</button>}<button className="icon-button" onClick={() => setError('')} aria-label={t('benefit.controlCloseError')}><X size={15} /></button></div>}
          {pending && <div className="history-confirm-content">
            <div className="history-confirm-lead"><LockKeyhole size={20} /><p>{t('benefit.controlConfirmLead', { action: pendingAction })}</p></div>
            <section><h3>{t('benefit.controlImpactTitle')}</h3><ul>{pending.preview.warnings.slice(0, 3).map((warning) => <li key={warning}>{warning}</li>)}</ul></section>
            <section className="history-config-summary"><h3>{t('benefit.controlTargetTitle')}</h3><span>{t('benefit.controlScope')}</span><span>{t('benefit.projectLabel')}: {pending.preview.projectDir}</span><code>{pending.preview.configPath}</code><span>{pending.preview.target.kind} · {pending.preview.target.id}</span><span>{pending.preview.changed ? t('benefit.controlWillChange') : t('benefit.controlUnchanged')}</span></section>
            <p className="history-control-note">{t('benefit.controlNoDiff')}</p>
            <p className="history-control-note">{t('benefit.controlNewSession')}</p>
          </div>}
          {undoPending && operation && <div className="history-confirm-content"><div className="history-confirm-lead"><Undo2 size={20} /><p>{t('benefit.controlUndoConfirm')}</p></div><section className="history-config-summary"><h3>{t('benefit.controlTargetTitle')}</h3><code>{operation.result.configPath}</code><span>{operation.label}</span><code>{operation.result.operationId}</code></section></div>}
          {!pending && !undoPending && selected && <div className="history-detail-content">
            <div className="history-detail-summary"><span className="history-recommendation large">{t(`benefit.controlRecommendation.${selected.recommendation}`)}</span><span className="history-state-pill unknown">{t('benefit.historyConfigUnknown')}</span><span className="history-feasibility">{controlAvailable(selected) ? t('benefit.historyControlAvailable') : t('benefit.historyControlUnverified')}</span></div>
            <section><h3>{t('benefit.historyDetailRecommendation')}</h3><p>{recommendationReason(selected)}</p><p className="muted">{selected.reason}</p></section>
            <section><h3>{t('benefit.historyDetailEvidence')}</h3><p>{t('benefit.controlCounts', { mentions: selected.explicitMentionCount ?? 0, activations: selected.activationCount ?? 0, reads: selected.observedReadCount ?? 0, sessions: selected.usedSessionCount ?? 0 })}</p><p>{t('benefit.historyLastUsed', { date: selected.lastUsedAt ?? '—' })}</p>{selected.evidence.length > 0 ? <ul className="history-evidence-list">{selected.evidence.map((entry, index) => <li key={`${entry.sessionId}:${entry.line}:${index}`}><span>{entry.kind}</span><code>{entry.sessionId} · {entry.sourcePath}:{entry.line}</code></li>)}</ul> : <p className="muted">{t('benefit.historyNoEvidence')}</p>}</section>
            <section><h3>{t('benefit.historyDetailControl')}</h3>{selected.sourcePath && <code className="history-detail-path">{selected.sourcePath}</code>}<p>{controlAvailable(selected) ? (selected.controlMethod ?? t('benefit.historyControlAvailable')) : t('benefit.controlUnsupported')}</p>{selected.controlMethod && <code>{selected.controlMethod}</code>}</section>
          </div>}
        </div>
        <footer className="history-drawer-footer">
          {pending ? <><button className="button primary" disabled={busy || !pending.preview.changed} onClick={() => void apply()}>{t(pending.enabled ? 'benefit.controlConfirmEnableAction' : 'benefit.controlConfirmDisableAction', { target: pending.label })}</button><button className="button secondary" disabled={busy} onClick={() => setPending(undefined)}>{t('benefit.controlBackToReview')}</button></> : undoPending ? <><button className="button primary" disabled={busy} onClick={() => void undo()}>{t('benefit.controlUndoConfirmAction')}</button><button className="button secondary" disabled={busy} onClick={closeDrawer}>{t('benefit.controlCancel')}</button></> : selected && <><button className="button secondary" data-history-autofocus onClick={closeDrawer}>{t('benefit.controlClosePanel')}</button>{controlAvailable(selected) && selected.recommendation !== 'unknown' && <button className={`button ${selected.recommendation === 'review-disable' ? 'primary' : 'secondary'}`} disabled={busy} onClick={() => previewCandidate(selected, false)}>{t('benefit.historyPreviewDisable')}</button>}</>}
        </footer>
      </aside>
    </div>}
  </section>;
}
