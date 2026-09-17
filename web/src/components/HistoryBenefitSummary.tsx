import type { OfflineHistoryAnalysis } from '../../../src/benefit/historyTypes';
import type { BenefitReport } from '../../../src/benefit/types';
import { useTranslation } from '../i18n';
import { HistoryBenefitDetails } from './HistoryBenefitDetails';
import './historyBenefit.css';

function controlAvailable(item: OfflineHistoryAnalysis['usageProfile'][number]): boolean {
  return item.kind === 'recommended_plugins'
    || (item.kind === 'skills_instructions' && ['source-supported', 'config-only', 'already-disabled'].includes(item.control) && Boolean(item.sourcePath) && !/\/plugins\/cache\/|\/\.system\//.test(item.sourcePath ?? ''));
}

function formatCost(value: { amount?: number; currency?: string } | undefined): string {
  if (!value || value.amount === undefined) return '—';
  return `${value.currency ?? 'USD'} ${value.amount.toFixed(6)}`;
}

export function HistoryBenefitSummary({
  history: h,
  hideCandidates = false,
  compact = false,
  onOpenEvidence,
}: {
  history: OfflineHistoryAnalysis;
  hideCandidates?: boolean;
  compact?: boolean;
  onOpenEvidence?: () => void;
}) {
  const { t, locale } = useTranslation();
  const n = (value: number | undefined) => value === undefined ? '—' : value.toLocaleString(locale);
  const date = (value: string | undefined) => {
    if (!value || !Number.isFinite(Date.parse(value))) return '—';
    return new Intl.DateTimeFormat(locale, { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }).format(new Date(value));
  };
  const b = h.baselineSession;
  const count = (kind: 'skills_instructions' | 'recommended_plugins', selected = false) => h.usageProfile.filter((item) => item.kind === kind && (!selected || item.recommendation === 'review-disable')).length;
  const retained = h.usageProfile.filter((item) => item.recommendation === 'retain').length;
  const unknown = h.usageProfile.filter((item) => item.recommendation === 'unknown').length;
  const first = h.firstResponse;
  const reviewItems = h.usageProfile.filter((item) => item.recommendation === 'review-disable');
  const controllableItems = reviewItems.filter(controlAvailable);
  const unknownControlCount = reviewItems.length - controllableItems.length;

  if (compact) {
    return <section className="panel history-benefit history-benefit-summary" aria-label={t('benefit.historyTitle')}>
      <header className="history-benefit-heading">
        <div><span className="history-benefit-kicker">{t('benefit.historyKicker')}</span><h2>{t('benefit.historyTitle')}</h2><p>{t('benefit.historyIntro')}</p></div>
        <span className="history-benefit-badge">{t('benefit.historyHypothesis')}</span>
      </header>
      <div className="history-benefit-summary-grid">
        <div className="history-benefit-summary-primary">
          <span>{t('benefit.historyPerResponse')}</span>
          <strong>{n(h.descriptionTokensPerResponse)} <small>Token / {t('benefit.historyResponseSuffix')}</small></strong>
          <p>{t('benefit.historyBlockBreakdown', { skills: n(h.blockDeltas.skills_instructions), plugins: n(h.blockDeltas.recommended_plugins) })}</p>
        </div>
        <div className="history-benefit-summary-count"><span>{t('benefit.historyReviewCount')}</span><strong>{n(reviewItems.length)}</strong><p>{t('benefit.historyReviewCountDetail')}</p></div>
        <div className="history-benefit-summary-count"><span>{t('benefit.historyControllable')}</span><strong>{n(controllableItems.length)}</strong><p>{t('benefit.historyControllableDetail', { total: n(reviewItems.length) })}</p></div>
        <div className="history-benefit-summary-count"><span>{t('benefit.historyControlUnknown')}</span><strong>{n(unknownControlCount)}</strong><p>{t('benefit.historyControlUnknownDetail')}</p></div>
        <div className="history-benefit-summary-count"><span>{t('benefit.historyRetainedCount')}</span><strong>{n(retained)}</strong><p>{t('benefit.historyRetainedDetail')}</p></div>
        <div className="history-benefit-summary-count"><span>{t('benefit.historyRecommendationUnknown')}</span><strong>{n(unknown)}</strong><p>{t('benefit.historyRecommendationUnknownDetail')}</p></div>
      </div>
      <div className="history-benefit-summary-meta">
        <div><strong>{t('benefit.historyBaselineLabel')}</strong><span>{b ? `${date(b.firstTimestamp)} — ${date(b.lastTimestamp)}` : t('benefit.historyBaselineMissing')}</span><small>{b ? t('benefit.historyBaselineCompact', { responses: n(b.responseCount), turns: n(b.completedTurnCount), messages: n(b.userMessageCount) }) : t('benefit.historyBaselineUnavailable')}</small></div>
        {onOpenEvidence && <button className="button secondary compact" onClick={onOpenEvidence}>{t('benefit.historyOpenEvidence')}</button>}
      </div>
      <p className="history-benefit-disclaimer">{t('benefit.historyDisclaimer')}</p>
      {h.historyCoverage.sessionCount === 0 ? <p className="history-benefit-empty-note">{t('benefit.historyNoHistory')}</p> : (h.catalogSources.length === 0 || h.descriptionTokensPerResponse === undefined) && <p className="history-benefit-empty-note">{t('benefit.historyNoCatalog')}</p>}
      {(h.historyCoverage.limited || h.historyCoverage.incompleteFiles > 0) && <p className="history-benefit-warning">{t('benefit.historyLimited', { count: h.historyCoverage.incompleteFiles })}</p>}
    </section>;
  }

  return <section className="panel history-benefit" aria-label={t('benefit.historyTitle')}>
    <header className="history-benefit-heading">
      <div><h3>{t('benefit.historyTitle')}</h3><p>{t('benefit.historyIntro')}</p></div>
      <span className="history-benefit-badge">{t('benefit.historyHypothesis')}</span>
    </header>

    <div className="history-benefit-metrics">
      <div className="history-benefit-metric history-benefit-primary"><span>{t('benefit.historyPerResponse')}</span><strong>{n(h.descriptionTokensPerResponse)} <small>Token</small></strong><p>Skill {n(h.blockDeltas.skills_instructions)} · {t('benefit.historyPlugin')} {n(h.blockDeltas.recommended_plugins)}</p></div>
      <div className="history-benefit-metric"><span>{t('benefit.historySkillSelected')}</span><strong>{n(count('skills_instructions', true))} <small>/ {n(count('skills_instructions'))}</small></strong><p>{t('benefit.historyCatalogBasis')}</p></div>
      <div className="history-benefit-metric"><span>{t('benefit.historyPluginSelected')}</span><strong>{n(count('recommended_plugins', true))} <small>/ {n(count('recommended_plugins'))}</small></strong><p>{t('benefit.historyReviewOnly')}</p></div>
      <div className="history-benefit-metric"><span>{t('benefit.historyBaselineResponses')}</span><strong>{n(b?.responseCount)}</strong><p>{t('benefit.historyTurnCount', { count: n(b?.completedTurnCount) })}</p></div>
    </div>

    <div className="history-benefit-baseline">
      <div><h4>{t('benefit.historyBaselineLabel')}</h4><p>{date(b?.firstTimestamp)} — {date(b?.lastTimestamp)}</p><small>{t('benefit.historyBaselineRule')}</small></div>
      <dl><div><dt>{t('benefit.historyUserMessages')}</dt><dd>{n(b?.userMessageCount)}</dd></div><div><dt>{t('benefit.historyRetained')}</dt><dd>{n(retained)}</dd></div><div><dt>{t('benefit.historyUnknown')}</dt><dd>{n(unknown)}</dd></div></dl>
    </div>
    <p className="history-benefit-coverage">{t('benefit.historyCoverageSummary', { sessions: n(h.historyCoverage.sessionCount), files: n(h.historyCoverage.fileCount) })} · {t(h.historyCoverage.since === new Date(0).toISOString() ? 'benefit.historyAll' : 'benefit.historyWindow')}{h.historyCoverage.since !== new Date(0).toISOString() && ` ${date(h.historyCoverage.since)}`} · {t(h.historyCoverage.includesArchived ? 'benefit.historyArchivedYes' : 'benefit.historyArchivedNo')} · {t('benefit.historyUntil', { date: date(h.historyCoverage.until) })}</p>
    {(h.historyCoverage.limited || h.historyCoverage.incompleteFiles > 0) && <p className="history-benefit-warning">{t('benefit.historyLimited', { count: h.historyCoverage.incompleteFiles })}</p>}

    <div className="history-benefit-comparisons">
      <div><span>{t('benefit.historyFirstResponse')}</span><strong>{n(first?.descriptionTokens)} <small>Token</small></strong><p>{t('benefit.historyFirstCache', { input: n(first?.before.inputTokens), cache: n(first?.before.cachedInputTokens) })}</p></div>
      <div><span>{t('benefit.historyFirstTurn')}</span><strong>{n(h.firstInteraction?.descriptionTokens)} <small>Token</small></strong><p>{t('benefit.historyFirstTurnCount', { count: n(h.firstInteraction?.responseCount) })}</p></div>
      <div><span>{t('benefit.historyReplay')}</span><strong className={h.historicalReplay.coveredResponses === 0 ? 'history-benefit-unavailable' : ''}>{h.historicalReplay.coveredResponses === 0 ? t('benefit.historyInsufficient') : `${n(h.historicalReplay.inputTokens)} Token`}</strong><p>{t('benefit.historyReplayCoverage', { known: n(h.historicalReplay.coveredResponses), unknown: n(h.historicalReplay.unknownResponses) })}</p></div>
    </div>
    <p className="history-benefit-disclaimer">{t('benefit.historyDisclaimer')}</p>

    <div className="history-benefit-disclosures">
      <HistoryBenefitDetails history={h} hideCandidates={hideCandidates} />
      <details><summary>{t('benefit.historySources')}</summary><div className="history-benefit-detail-body">
        <h4>{t('benefit.historyBaselineLabel')}</h4><code>{b?.sessionId ?? '—'}</code><code>{b?.sourcePath ?? '—'}</code>
        <p>{t('benefit.historyNativeCounts', { items: n(b?.userMessageItemCount), turns: n(b?.distinctTurnCount), completed: n(b?.completedTurnCount) })}</p>
        <p>{t('benefit.historySourceTimes')}</p>
        {h.catalogSources.map((source) => <div className="history-benefit-source" key={source.kind}><h4>{source.kind}</h4><p>{date(source.timestamp)}</p><code>{source.sessionId}</code><code>{source.sourcePath}:{source.line}</code><code>SHA256 {source.sha256}</code></div>)}
        <p>{t('benefit.historyChild', { count: n(h.childUsage.responseCount), input: n(h.childUsage.inputTokens), cache: n(h.childUsage.cachedInputTokens) })}</p>
      </div></details>
      <details><summary>{t('benefit.historyControls')}</summary><div className="history-benefit-detail-body">
        <h4>{t('benefit.historyCacheRule')}</h4><p>{t('benefit.historyCacheBounds', { lower: n(first?.cacheAttribution?.lower), upper: n(first?.cacheAttribution?.upper) })}</p>
        <h4>{t('benefit.historyPluginControls')}</h4><code>{h.pluginControl.perId}</code><code>{h.pluginControl.wholeBlock}</code>
        <p>{t(h.pluginControl.wholeBlockSelected ? 'benefit.historyWholeYes' : 'benefit.historyWholeNo')}</p><p>{t('benefit.historyControlWarning')}</p>
      </div></details>
    </div>
  </section>;
}

export function HistoryBenefitEvidence({ history: h, report }: { history: OfflineHistoryAnalysis; report?: BenefitReport }) {
  const { t, locale } = useTranslation();
  const n = (value: number | undefined) => value === undefined ? '—' : value.toLocaleString(locale);
  const date = (value: string | undefined) => {
    if (!value || !Number.isFinite(Date.parse(value))) return '—';
    return new Intl.DateTimeFormat(locale, { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }).format(new Date(value));
  };
  const b = h.baselineSession;
  const reviewCount = h.usageProfile.filter((item) => item.recommendation === 'review-disable').length;
  const first = h.firstResponse;
  return <section className="panel history-benefit history-evidence-panel" aria-label={t('benefit.historyEvidenceView')}>
    <header className="history-benefit-heading">
      <div><span className="history-benefit-kicker">{t('benefit.historyEvidenceKicker')}</span><h2>{t('benefit.historyEvidenceView')}</h2><p>{t('benefit.historyEvidenceIntro')}</p></div>
      <span className="history-benefit-badge">{t('benefit.historyEvidenceReadOnly')}</span>
    </header>
    <div className="history-evidence-flow">
      <div><span>{t('benefit.historyEvidenceHistory')}</span><strong>{n(h.historyCoverage.sessionCount)} / {n(h.historyCoverage.fileCount)}</strong><p>{t('benefit.historyEvidenceHistoryDetail', { until: date(h.historyCoverage.until) })}</p></div>
      <div><span>{t('benefit.historyEvidenceBaseline')}</span><strong>{n(b?.responseCount)} {t('benefit.historyResponsesShort')}</strong><p>{t('benefit.historyEvidenceBaselineDetail', { turns: n(b?.completedTurnCount), messages: n(b?.userMessageCount) })}</p></div>
      <div><span>{t('benefit.historyEvidenceRemoved')}</span><strong>{n(h.descriptionTokensPerResponse)} Token</strong><p>{t('benefit.historyEvidenceRemovedDetail', { review: n(reviewCount), skills: n(h.blockDeltas.skills_instructions), plugins: n(h.blockDeltas.recommended_plugins) })}</p></div>
      <div><span>{t('benefit.historyEvidenceAccumulation')}</span><strong>{n(h.firstInteraction?.descriptionTokens)} Token</strong><p>{t('benefit.historyEvidenceAccumulationDetail', { responses: n(h.firstInteraction?.responseCount) })}</p></div>
      <div><span>{t('benefit.historyEvidenceCache')}</span><strong>{n(first?.cacheAttribution?.lower)}–{n(first?.cacheAttribution?.upper)}</strong><p>{t('benefit.historyEvidenceCacheDetail', { input: n(first?.before.inputTokens), cache: n(first?.before.cachedInputTokens) })}</p></div>
      <div><span>{t('benefit.historyEvidenceReplay')}</span><strong>{h.historicalReplay.coveredResponses === 0 ? t('benefit.historyInsufficient') : `${n(h.historicalReplay.inputTokens)} Token`}</strong><p>{t('benefit.historyReplayCoverage', { known: n(h.historicalReplay.coveredResponses), unknown: n(h.historicalReplay.unknownResponses) })}</p></div>
    </div>
    {report && <section className="history-evidence-cost">
      <div><h3>{t('benefit.historyEvidenceCostTitle')}</h3><p>{t('benefit.historyEvidenceCostDetail')}</p></div>
      {report.scenarios.length > 0 ? <div className="history-cost-list">{report.scenarios.map((scenario) => <div key={scenario.id}><strong>{scenario.label}</strong><span>{formatCost(scenario.baseline)} → {formatCost(scenario.projected)}</span><small>{scenario.assumption}</small></div>)}</div> : <p className="muted">{t('benefit.historyEvidenceCostUnavailable')}</p>}
    </section>}
    <div className="history-benefit-disclosures">
      <HistoryBenefitDetails history={h} />
      <details><summary>{t('benefit.historySources')}</summary><div className="history-benefit-detail-body">
        <h3>{t('benefit.historyEvidenceBaselineSource')}</h3><code>{b?.sessionId ?? '—'}</code><code>{b?.sourcePath ?? '—'}</code>
        <p>{t('benefit.historyNativeCounts', { items: n(b?.userMessageItemCount), turns: n(b?.distinctTurnCount), completed: n(b?.completedTurnCount) })}</p>
        <p>{t('benefit.historySourceTimes')}</p>
        {h.catalogSources.map((source) => <div className="history-benefit-source" key={source.kind}><h4>{source.kind}</h4><p>{date(source.timestamp)}</p><code>{source.sessionId}</code><code>{source.sourcePath}:{source.line}</code><code>SHA256 {source.sha256}</code></div>)}
        <p>{t('benefit.historyChild', { count: n(h.childUsage.responseCount), input: n(h.childUsage.inputTokens), cache: n(h.childUsage.cachedInputTokens) })}</p>
      </div></details>
      <details><summary>{t('benefit.historyControls')}</summary><div className="history-benefit-detail-body">
        <h3>{t('benefit.historyCacheRule')}</h3><p>{t('benefit.historyCacheBounds', { lower: n(first?.cacheAttribution?.lower), upper: n(first?.cacheAttribution?.upper) })}</p>
        <h3>{t('benefit.historyPluginControls')}</h3><code>{h.pluginControl.perId}</code><code>{h.pluginControl.wholeBlock}</code>
        <p>{t(h.pluginControl.wholeBlockSelected ? 'benefit.historyWholeYes' : 'benefit.historyWholeNo')}</p><p>{t('benefit.historyControlWarning')}</p>
      </div></details>
    </div>
  </section>;
}
