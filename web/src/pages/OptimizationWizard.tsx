import { ArrowLeft, ArrowRight, Check, Info, Star, FileText, RefreshCw, Undo2 } from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';
import type { CodexUsage } from '../../../src/benefit/types';
import type { OptimizationOperation, OptimizationOverview, OptimizationPeriod, OptimizationPricingMode, OptimizationPreview, OptimizationSuggestion, OptimizationTarget, OptimizationVerification } from '../../../src/context/optimizationTypes';
import { applyOptimizationChange, checkOptimizationChange, loadOptimization, previewOptimizationChange, undoOptimizationChange } from '../api';
import { useTranslation } from '../i18n';
import { InlineNotice } from '../components/ui';
import './optimizationWizard.css';

type MoneyRange = NonNullable<OptimizationSuggestion['cost']>;

function Help({ id, label, children }: { id: string; label: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return <span className="opt-help" onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)} onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false); }} onKeyDown={(event) => { if (event.key === 'Escape') { event.stopPropagation(); setOpen(false); } }}>
    <button type="button" className="opt-info" aria-label={label} aria-describedby={open ? id : undefined} aria-expanded={open} onFocus={() => setOpen(true)} onClick={() => setOpen(true)}><Info size={17} /></button>
    {open && <span id={id} role="tooltip" className="opt-tooltip">{children}</span>}
  </span>;
}

function sumMoney(values: Array<MoneyRange | undefined>): MoneyRange | undefined {
  const known = values.filter((value): value is MoneyRange => Boolean(value));
  if (!known.length) return undefined;
  return { lower: known.reduce((sum, value) => sum + value.lower, 0), upper: known.reduce((sum, value) => sum + value.upper, 0), currency: known[0].currency };
}

function sumAmount(values: Array<number | undefined>): number | undefined {
  const known = values.filter((value): value is number => value !== undefined);
  return known.length ? known.reduce((sum, value) => sum + value, 0) : undefined;
}

function sumUsage(sessions: OptimizationOverview['sessions']): CodexUsage | undefined {
  const known = sessions.filter((session) => session.usage);
  if (!known.length) return undefined;
  return known.reduce<CodexUsage>((total, session) => {
    for (const key of Object.keys(total) as Array<keyof CodexUsage>) total[key] += session.usage![key];
    return total;
  }, { inputTokens: 0, cachedInputTokens: 0, cacheWriteInputTokens: 0, outputTokens: 0, reasoningOutputTokens: 0, totalTokens: 0 });
}

function sumSavings(sessions: OptimizationOverview['sessions'], target: OptimizationTarget): NonNullable<OptimizationSuggestion['cumulative']> {
  let tokens = 0; let tokenSessions = 0; let coveredResponses = 0; let pricedResponses = 0; let actualPricedResponses = 0;
  const costs: Array<MoneyRange | undefined> = []; const actualCosts: Array<MoneyRange | undefined> = [];
  for (const session of sessions) {
    const suggestion = session.suggestions.find((item) => item.id === target);
    const cumulative = suggestion?.cumulative;
    if (cumulative?.tokens !== undefined) { tokens += cumulative.tokens; tokenSessions++; }
    coveredResponses += cumulative?.coveredResponses ?? 0;
    pricedResponses += cumulative?.pricedResponses ?? 0;
    actualPricedResponses += cumulative?.actualPricedResponses ?? 0;
    costs.push(cumulative?.cost); actualCosts.push(cumulative?.actualCost);
  }
  return { tokens: tokenSessions ? tokens : undefined, cost: sumMoney(costs), actualCost: sumMoney(actualCosts), coveredResponses, pricedResponses, actualPricedResponses };
}

function sumSelectedSavings(sessions: OptimizationOverview['sessions'], targets: OptimizationTarget[]): NonNullable<OptimizationSuggestion['cumulative']> {
  const parts = targets.map((target) => sumSavings(sessions, target));
  const totalResponses = sessions.reduce((sum, session) => sum + session.responseCount, 0);
  const tokens = parts.some((part) => part.tokens !== undefined) ? parts.reduce((sum, part) => sum + (part.tokens ?? 0), 0) : undefined;
  return {
    tokens,
    cost: sumMoney(parts.map((part) => part.cost)),
    actualCost: sumMoney(parts.map((part) => part.actualCost)),
    coveredResponses: Math.min(totalResponses, Math.max(0, ...parts.map((part) => part.coveredResponses))),
    pricedResponses: Math.min(totalResponses, Math.max(0, ...parts.map((part) => part.pricedResponses))),
    actualPricedResponses: Math.min(totalResponses, Math.max(0, ...parts.map((part) => part.actualPricedResponses ?? 0))),
  };
}

export function OptimizationWizard({ projectDir }: { projectDir: string }) {
  const { t, locale } = useTranslation();
  const [data, setData] = useState<OptimizationOverview>();
  const [period, setPeriod] = useState<OptimizationPeriod>('month');
  const [pricingMode, setPricingMode] = useState<OptimizationPricingMode>('max');
  const [sessionId, setSessionId] = useState('');
  const [selectedTargets, setSelectedTargets] = useState<OptimizationTarget[]>(['skill-catalog']);
  const [step, setStep] = useState(2);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [preview, setPreview] = useState<OptimizationPreview>();
  const [globalConfirmed, setGlobalConfirmed] = useState(false);
  const [operation, setOperation] = useState<OptimizationOperation>();
  const [verification, setVerification] = useState<OptimizationVerification>();
  const [undoPending, setUndoPending] = useState(false);
  const [exampleOpen, setExampleOpen] = useState(false);
  const storageKey = `skill-doctor:optimization:${projectDir}`;
  const n = (value?: number) => value === undefined ? '—' : value.toLocaleString(locale);
  const usd = (value?: number) => value === undefined ? '—' : `$${value.toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 6 })}`;
  const moneyRange = (cost?: { lower: number; upper: number }) => !cost ? t('opt.costUnknown') : cost.lower === cost.upper ? usd(cost.lower) : `${usd(cost.lower)} – ${usd(cost.upper)}`;
  const periodSessions = data?.sessions ?? [];
  const session = data?.sessions.find((item) => item.id === sessionId) ?? data?.sessions[0];
  const selectedSuggestions = selectedTargets.map((id) => session?.suggestions.find((item) => item.id === id)).filter((item): item is OptimizationSuggestion => Boolean(item));
  const selectionScope = selectedSuggestions.some((item) => item.scope === 'user') ? selectedSuggestions.some((item) => item.scope === 'project') ? 'mixed' : 'user' : 'project';
  const selectionReady = selectedSuggestions.length > 0 && selectedSuggestions.every((item) => item.available);
  const periodUsage = sumUsage(periodSessions);
  const periodResponseCount = periodSessions.reduce((sum, item) => sum + item.responseCount, 0);
  const periodTurnCount = periodSessions.reduce((sum, item) => sum + (item.turnCount ?? 0), 0);
  const periodCost = sumAmount(periodSessions.map((item) => item.cost));
  const periodActualCost = sumAmount(periodSessions.map((item) => item.actualCost));
  const periodCostCoverage = periodSessions.reduce((sum, item) => sum + item.costCoverage, 0);
  const periodActualCostCoverage = periodSessions.reduce((sum, item) => sum + (item.actualCostCoverage ?? item.costCoverage), 0);
  const periodSavings = sumSelectedSavings(periodSessions, selectedTargets);
  const firstResponseSavings = {
    tokens: selectedSuggestions.some((item) => item.tokens !== undefined) ? selectedSuggestions.reduce((sum, item) => sum + (item.tokens ?? 0), 0) : undefined,
    cost: sumMoney(selectedSuggestions.map((item) => item.cost)),
    actualCost: sumMoney(selectedSuggestions.map((item) => item.actualCost)),
  };
  const displayCost = pricingMode === 'max' ? periodCost : periodActualCost;
  const displayCostCoverage = pricingMode === 'max' ? periodCostCoverage : periodActualCostCoverage;
  const displaySavings = pricingMode === 'max' ? periodSavings : { ...periodSavings, cost: periodSavings.actualCost, pricedResponses: periodSavings.actualPricedResponses ?? 0 };
  const displayFirstResponse = pricingMode === 'max' ? firstResponseSavings : { ...firstResponseSavings, cost: firstResponseSavings.actualCost };
  const verified = verification?.matched ?? (verification?.status === 'removed' && !operation?.enabled);
  const previousPending = operation?.status === 'pending' && !verified;
  const date = (value: string) => new Date(value).toLocaleString(locale, { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
  const day = (value: string) => new Date(value).toLocaleDateString(locale, { month: '2-digit', day: '2-digit' });
  const label = (id: OptimizationTarget) => t(`opt.${id}.title`);
  const operationTargets = operation?.targets ?? (operation?.target ? [operation.target] : []);

  async function refresh(signal?: AbortSignal) {
    setLoading(true); setError(''); setPreview(undefined);
    try {
      const next = await loadOptimization(projectDir, signal, period);
      if (signal?.aborted) return;
      setData(next);
      const current = next.sessions.find((item) => item.id === sessionId);
      const initial = current ?? next.sessions.find((item) => item.suggestions.some((suggestion) => suggestion.available)) ?? next.sessions[0];
      if (initial && initial.id !== sessionId) {
        setSessionId(initial.id); setSelectedTargets(initial.suggestions.filter((item) => item.available).slice(0, 1).map((item) => item.id));
      } else if (initial) {
        setSelectedTargets((currentTargets) => {
          const available = currentTargets.filter((id) => initial.suggestions.some((item) => item.id === id && item.available));
          return available.length ? available : initial.suggestions.filter((item) => item.available).slice(0, 1).map((item) => item.id);
        });
      } else if (!initial) {
        setSessionId('');
        setSelectedTargets([]);
      }
    }
    catch (e) { if (!signal?.aborted) setError(String(e)); }
    finally { if (!signal?.aborted) setLoading(false); }
  }

  useEffect(() => {
    const controller = new AbortController();
    void refresh(controller.signal);
    try {
      const saved = JSON.parse(localStorage.getItem(storageKey) ?? 'null');
      if (saved?.projectDir === projectDir && saved?.status === 'pending') { setOperation(saved); setStep(3); }
    } catch { /* Invalid local display state is ignored; server validates every operation. */ }
    return () => controller.abort();
  }, [projectDir, period]);

  const persist = (value: OptimizationOperation) => {
    setOperation(value);
    try { localStorage.setItem(storageKey, JSON.stringify(value)); } catch { /* The operation also persists on the local server. */ }
  };
  async function action(run: () => Promise<void>) {
    setBusy(true); setError('');
    try { await run(); } catch (e) { setError(e instanceof Error ? e.message : String(e)); } finally { setBusy(false); }
  }
  function choose(id: OptimizationTarget) {
    setSelectedTargets((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
    setPreview(undefined); setGlobalConfirmed(false);
  }
  function chooseSession(id: string) {
    setExampleOpen(false);
    setSessionId(id); setPreview(undefined); setGlobalConfirmed(false);
    const next = data?.sessions.find((item) => item.id === id);
    if (next) setSelectedTargets((current) => {
      const available = current.filter((targetId) => next.suggestions.some((item) => item.id === targetId && item.available));
      return available.length ? available : next.suggestions.filter((item) => item.available).slice(0, 1).map((item) => item.id);
    });
  }

  return <section className="optimization-wizard" aria-label={t('opt.title')}>
    <header className="opt-heading"><div><h1>{t('opt.title')}</h1><p>{t('opt.subtitle')}</p></div>
      <button className="button ghost" onClick={() => setStep(step === 1 ? 2 : 1)}><ArrowLeft size={16} />{t(step === 1 ? 'opt.backSuggestions' : 'opt.backCost')}</button>
    </header>
    <nav className="opt-steps" aria-label={t('opt.steps')}>
      {([1, 2, 3] as const).map((value) => <button key={value} className={`opt-step ${step === value ? 'active' : ''}`} aria-current={step === value ? 'step' : undefined} onClick={() => setStep(value)}>
        <span className="opt-step-number">{value === 1 && session ? <Check size={18} /> : value}</span><span><strong>{t(`opt.step${value}`)}</strong><small>{t(`opt.step${value}Detail`)}</small></span>
      </button>)}
    </nav>
    <div className="opt-session-bar">
      <div className="opt-period-switch" role="group" aria-label={t('opt.periodLabel')}>
        <button className={`button ghost compact ${period === 'month' ? 'active' : ''}`} aria-pressed={period === 'month'} disabled={loading || busy} onClick={() => setPeriod('month')}>{t('opt.month')}</button>
        <button className={`button ghost compact ${period === 'week' ? 'active' : ''}`} aria-pressed={period === 'week'} disabled={loading || busy} onClick={() => setPeriod('week')}>{t('opt.week')}</button>
      </div>
      <label><span className="sr-only">{t('opt.session')}</span><select aria-label={t('opt.session')} value={session?.id ?? ''} disabled={loading || busy || !data?.sessions.length} onChange={(e) => chooseSession(e.target.value)}>
        {!data?.sessions.length && <option value="">{t(loading ? 'opt.loading' : 'opt.noSessions')}</option>}
        {data?.sessions.slice(0, 20).map((item) => <option value={item.id} key={item.id}>{date(item.timestamp)} · {n(item.usage?.totalTokens)} Token · {usd(pricingMode === 'max' ? item.cost : item.actualCost)} · {item.id.slice(-6)}</option>)}
      </select></label>
      <button className="button ghost compact" disabled={loading || busy} onClick={() => void refresh()} aria-label={t('opt.refresh')}><RefreshCw size={15} className={loading ? 'spin' : ''} /></button>
      <button className="button ghost compact opt-pricing-toggle" disabled={loading || busy} onClick={() => setPricingMode(pricingMode === 'max' ? 'actual' : 'max')} aria-label={t('opt.pricingToggle')}>
        {t(pricingMode === 'max' ? 'opt.useActualModel' : 'opt.useMaxModel')}
      </button>
      {data && <small>{t('opt.periodMeta', { period: t(period === 'month' ? 'opt.month' : 'opt.week'), start: day(data.periodStart), end: day(data.periodEnd) })}</small>}
    </div>
    {error && <div role="alert"><InlineNotice kind="danger" title={t('opt.failed')}>{error}</InlineNotice></div>}
    {loading && <p role="status">{t('opt.loading')}</p>}
    {!loading && !data?.sessions.length && <div className="opt-empty"><FileText size={32} /><h2>{t('opt.noSessions')}</h2><p>{t('opt.emptyDetail')}</p><button className="button primary" onClick={() => void refresh()}>{t('opt.refresh')}</button></div>}
    {step === 1 && session && <div className="opt-cost">
      <h2>{t('opt.periodCostTitle')}</h2><p className="muted">{t('opt.periodCostDetail', { period: t(period === 'month' ? 'opt.month' : 'opt.week') })}</p>
      <div className="opt-period-total"><strong>{t('opt.periodTotal')}</strong><span>{t('opt.periodSummary', { sessions: n(periodSessions.length), turns: n(periodTurnCount), responses: n(periodResponseCount) })}</span></div>
      <dl className="opt-cost-metrics"><div><dt>{t('opt.total')}</dt><dd>{n(periodUsage?.totalTokens)}</dd></div><div><dt>{t('opt.input')}</dt><dd>{n(periodUsage?.inputTokens)}</dd><small>{t('opt.cached', { count: n(periodUsage?.cachedInputTokens) })}</small></div><div><dt>{t('opt.output')}</dt><dd>{n(periodUsage?.outputTokens)}</dd></div><div><dt>{t('opt.apiEstimate')}</dt><dd>{usd(displayCost)}</dd><small>{t(pricingMode === 'max' ? 'opt.maxPriceDetail' : 'opt.actualPriceDetail', { model: data?.maxPriceModel ?? '—' })}</small></div></dl>
      <p className="muted">{t('opt.coverage', { priced: n(displayCostCoverage), total: n(periodResponseCount) })}</p>
      <div className="opt-table-wrap"><table><caption>{t('opt.periodSessions', { count: n(periodSessions.length) })}</caption><thead><tr><th>{t('opt.session')}</th><th>Token</th><th>{t('opt.apiEstimate')}</th><th>{t('opt.action')}</th></tr></thead><tbody>{data?.sessions.slice(0, 20).map((item) => <tr key={item.id}><td>{date(item.timestamp)}<small>{item.model ?? t('opt.unknownModel')} · {item.id.slice(-6)}</small></td><td>{n(item.usage?.totalTokens)}</td><td>{usd(pricingMode === 'max' ? item.cost : item.actualCost)}</td><td><button className="button secondary compact" onClick={() => { chooseSession(item.id); setStep(2); }}>{t('opt.viewSuggestions')}<ArrowRight size={14} /></button></td></tr>)}</tbody></table></div>
    </div>}
    {step === 2 && session && <div className="opt-select">
      <div className="opt-decision-grid"><div className="opt-options">
      <div className="opt-options-heading"><h2>{t('opt.startWhere')}</h2><Help id="opt-selection-help" label={t('opt.details')}><span>{t('opt.selectDetail')}</span>{session.suggestions.some((item) => item.versionWarning) && <span>{t('opt.versionWarning', { version: session.version ?? '—' })}</span>}</Help></div>
      <fieldset className="opt-choices"><legend className="sr-only">{t('opt.selectDetail')}</legend>{session.suggestions.map((item) => {
        const checked = selectedTargets.includes(item.id);
        const recommendation = data?.recommendations?.[item.id];
        const recommended = recommendation && recommendation.reason !== 'insufficient-evidence';
        return <div key={item.id} className={`opt-choice ${checked ? 'selected' : ''} ${!item.available && !item.canEnable ? 'unavailable' : ''}`}>
          <input id={`opt-${item.id}`} type="checkbox" aria-label={label(item.id)} name="optimization" value={item.id} checked={checked} onChange={() => choose(item.id)} disabled={busy || !item.available} />
          <label className="opt-choice-name" htmlFor={`opt-${item.id}`}>{label(item.id)}</label>
          {recommended && <span className="opt-recommended"><Star size={12} fill="currentColor" />{t('opt.recommended')}</span>}
          <span className={`opt-scope ${item.scope === 'user' ? 'global' : ''}`}>{t(item.scope === 'user' ? 'opt.globalImpact' : 'opt.projectOnly')}</span>
          {item.configuredOff && <span className="opt-off">{t('opt.off')}</span>}
          <Help id={`opt-help-${item.id}`} label={t('opt.itemDetails', { item: label(item.id) })}>
            <strong>{label(item.id)}</strong><span>{t(`opt.${item.id}.summary`)}</span><span>{t(`opt.${item.id}.impactDetail`)}</span>
            <span>{t(item.scope === 'user' ? 'opt.globalDetail' : 'opt.projectDetail')}</span>
            {item.reason && <span className="opt-reason">{t(`opt.reason.${item.reason}`)}</span>}
            {recommendation && <span>{t(`opt.recommendation.${recommendation.reason}`, { count: n(recommendation.explicitRequests), sessions: n(recommendation.sessions) })}</span>}
            {item.id === 'plugins' && recommended && <span className="opt-reason">{t('opt.pluginRecommendationCaution')}</span>}
          </Help>
          {item.configuredOff && <button className="button secondary compact" disabled={busy || loading || !item.canEnable} onClick={() => void action(async () => {
            setSelectedTargets([]); setGlobalConfirmed(false);
            setPreview(await previewOptimizationChange(projectDir, session.id, [item.id], true));
          })}>{t('opt.enable')}</button>}
        </div>;
      })}</fieldset>
      <p className="opt-selection-meta">{t('opt.selectedCount', { count: n(selectedTargets.length) })}{selectionScope !== 'project' && <span>{t('opt.globalImpact')}</span>}</p>
      <p className="opt-compact-note">{t('opt.nextSessionDetail')}</p>
      </div>
        <div className="opt-impact"><section aria-label={t(displaySavings.coveredResponses === periodResponseCount && periodResponseCount > 0 ? 'opt.totalSavings' : 'opt.coveredSavings')}><h3>{t(displaySavings.coveredResponses === periodResponseCount && periodResponseCount > 0 ? 'opt.totalSavings' : 'opt.coveredSavings')}</h3>
          <small>{t('opt.periodSummary', { sessions: n(periodSessions.length), turns: n(periodTurnCount), responses: n(periodResponseCount) })}</small>
          <div className="opt-savings-layout"><div className="opt-total-saving"><div className="opt-saving">{n(displaySavings.tokens)} <span>Token</span></div><div className="opt-money">{moneyRange(displaySavings.cost)}</div>
            {displaySavings.cost && displaySavings.pricedResponses < displaySavings.coveredResponses && <small>{t('opt.partialCost', { count: n(displaySavings.pricedResponses) })}</small>}</div>
            <aside className="opt-first-saving" aria-label={t('opt.firstResponse')}><small>{t('opt.firstResponse')}</small><strong>{n(displayFirstResponse.tokens)} Token</strong><small>{moneyRange(displayFirstResponse.cost)}</small></aside></div>
          <small>{t('opt.savingsCoverage', { covered: n(displaySavings.coveredResponses), total: n(periodResponseCount), priced: n(displaySavings.pricedResponses) })}</small>
          <small>{selectedSuggestions.length ? t('opt.cumulativeDetail') : t('opt.noSelection')}</small></section></div>
      </div>
      <div className="opt-example-toggle"><button className="button ghost compact" aria-expanded={exampleOpen} aria-controls="opt-session-example" onClick={() => setExampleOpen(!exampleOpen)}>{t(exampleOpen ? 'opt.hideExample' : 'opt.showExample')}<ArrowRight size={15} /></button><small>{t('opt.previewPrompt')}</small></div>
      {exampleOpen && <section id="opt-session-example" className="opt-example" aria-label={t('opt.exampleTitle')}>
        <div className="opt-example-heading"><div><h3>{t('opt.exampleTitle')}</h3><p>{projectDir} · {date(session.timestamp)} · {session.id}</p></div></div>
        {!session.completeHeader && <p>{t('opt.previewIncomplete')}</p>}
        <div className="opt-example-grid">{(['before', 'after'] as const).map((side) => <div className={`opt-example-pane ${side}`} key={side}>
          <h4>{t(side === 'before' ? 'opt.realBefore' : 'opt.realAfter')}</h4>
          {(session.headerBlocks ?? []).filter((block) => side === 'before' || !block.target || !selectedTargets.includes(block.target)).map((block) => <article className="opt-real-block" key={block.kind}>
            <strong>{block.kind}</strong><small>{t('opt.blockCharacters', { count: n(block.characters) })}</small>
            <pre>{block.excerpt}{block.characters > 50 ? '…' : ''}</pre>
          </article>)}
          {!(session.headerBlocks ?? []).some((block) => side === 'before' || !block.target || !selectedTargets.includes(block.target)) && <p>{t('opt.noPreviewBlocks')}</p>}
        </div>)}</div>
        <small className="opt-example-note">{t('opt.realPreviewNote')}</small>
      </section>}
      {preview && <div className="opt-confirm" role="region" aria-label={t('opt.confirmTitle')}><h3>{t('opt.confirmTitle')}</h3><p>{t(preview.after ? 'opt.enableDetail' : preview.scope === 'project' ? 'opt.confirmDetail' : preview.scope === 'user' ? 'opt.globalConfirmDetail' : 'opt.mixedConfirmDetail')}</p><details><summary>{t('opt.technical')}</summary><code>{preview.configPaths.join('\n')}</code><code>{preview.targets.map((targetId, index) => `${preview.configKeys[index]}: ${String(preview.before[targetId] ?? 'default')} → ${preview.after}`).join('\n')}</code></details>{preview.scope !== 'project' && <label className="check-row"><input type="checkbox" checked={globalConfirmed} onChange={(e) => setGlobalConfirmed(e.target.checked)} />{t('opt.globalConsent')}</label>}</div>}
      {previousPending && <p className="muted">{t('opt.finishPrevious')}</p>}
      <div className="opt-actions"><button className="button primary" disabled={busy || loading || (!preview?.after && (previousPending || !selectionReady)) || Boolean(preview && preview.scope !== 'project' && !globalConfirmed)} onClick={() => void action(async () => {
        if (!session || (!preview && !selectedTargets.length)) return;
        if (!preview) { setPreview(await previewOptimizationChange(projectDir, session.id, selectedTargets)); return; }
        const result = await applyOptimizationChange(projectDir, session.id, preview); persist(result); setVerification(undefined); setPreview(undefined); setStep(3); void refresh();
      })}>{busy ? t('opt.working') : t(preview?.after ? 'opt.confirmEnable' : preview ? 'opt.apply' : 'opt.review')}</button><button className="button secondary" disabled={busy} onClick={() => { setPreview(undefined); setStep(1); }}>{t('opt.later')}</button></div>
      <details className="opt-limitations"><summary>{t('opt.limits')}</summary><p>{t('opt.pluginLimit')}</p><p>{t('opt.skillLimit')}</p><p>{t('opt.otherBlocks')}</p></details>
    </div>}
    {step === 3 && <div className="opt-verification" aria-live="polite"><h2>{t(operation?.status === 'restored' ? 'opt.restored' : verified ? operation?.enabled ? 'opt.enabledVerified' : 'opt.verified' : operation ? 'opt.pending' : 'opt.noOperation')}</h2>
      {operation ? <><p>{operationTargets.map((targetId) => label(targetId)).join(' + ')} · {date(operation.createdAt)}</p><p>{t('opt.verificationDetail')}</p><ol><li>{t('opt.createTask', { project: projectDir })}</li><li>{t('opt.sendMessage')}</li><li>{t('opt.checkDetail')}</li></ol>
        {verification && <p className={`opt-verification-result ${verification.status}`} role="status">{t(operation.enabled && verification.status !== 'unknown' ? verified ? 'opt.enabledDetail' : 'opt.enableNotObserved' : verification.status === 'removed' ? 'opt.removedDetail' : verification.status === 'present' ? 'opt.stillPresent' : verification.reason === 'config-changed' ? 'opt.configChanged' : 'opt.noFreshSession')}{verification.sessionId && <code>{verification.sessionId}</code>}</p>}
        {operation.status === 'pending' && <div className="opt-actions"><button className="button primary" disabled={busy} onClick={() => void action(async () => setVerification(await checkOptimizationChange(projectDir, operation.id)))}>{busy ? t('opt.working') : t('opt.checkNewSession')}</button><button className="button secondary" disabled={busy} onClick={() => setUndoPending(true)}><Undo2 size={17} />{t('opt.undo')}</button></div>}
        {undoPending && <div className="opt-confirm"><p>{t('opt.undoConfirm')}</p><button className="button secondary" disabled={busy} onClick={() => void action(async () => { persist(await undoOptimizationChange(projectDir, operation.id)); setUndoPending(false); setVerification(undefined); void refresh(); })}>{t('opt.confirmUndo')}</button><button className="button ghost" onClick={() => setUndoPending(false)}>{t('opt.cancel')}</button></div>}
      </> : <><p>{t('opt.noOperationDetail')}</p><button className="button primary" onClick={() => setStep(2)}>{t('opt.backSuggestions')}</button></>}
    </div>}
    {data && <footer className="opt-footnote">{t('opt.disclaimer')}<details><summary>{t('opt.dataSource')}</summary><p>{t('opt.priceDate', { date: data.priceDate })} · {t('opt.updatedAt', { date: date(data.generatedAt) })}</p>{session && <><code>{session.sourcePath}</code><p>Codex {session.version ?? '—'} · {t(session.completeHeader ? 'opt.headerComplete' : 'opt.headerIncomplete')}</p></>}{data.diagnostics.map((item, index) => <p key={index}>{item}</p>)}</details></footer>}
  </section>;
}
