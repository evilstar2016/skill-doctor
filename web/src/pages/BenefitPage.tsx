import { BookOpen, Bot, Clipboard, Download, Gauge, RefreshCw, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

import type { BenefitCostMetrics, BenefitReport } from '../../../src/benefit/types';
import type { Platform } from '../../../src/types/skill';
import { cancelBenefitJob, startBenefitJob, streamBenefitJob, type BenefitProgressEvent } from '../api';
import { EmptyRows, InlineNotice, PageHeading, StatCard, StatusPill } from '../components/ui';
import { HistoryBenefitEvidence, HistoryBenefitSummary } from '../components/HistoryBenefitSummary';
import { HistoryControlPanel } from '../components/HistoryControlPanel';
import { useTranslation } from '../i18n';
import { renderBenefitCsv, renderBenefitHtml, redactBenefitReport } from '../../../src/render/renderBenefit';
import './benefitPage.css';

type BenefitAnalysisMode = 'history' | 'plan';
export type BenefitView = 'recommendations' | 'evidence';
type BenefitPlatform = Platform | 'all';

type BenefitReportBasis = {
  projectDir: string;
  platform: BenefitPlatform;
  tokenizer: 'openai' | 'approx';
  tokenizerModel: string;
  snapshotId?: string;
  sinceHours: string;
  limit: string;
  plan: string;
  includeArchived: boolean;
  analysisMode: BenefitAnalysisMode;
};

function number(value: number | undefined): string {
  return value === undefined ? '—' : new Intl.NumberFormat().format(value);
}

function percent(value: number | undefined): string {
  return value === undefined ? '—' : `${value.toFixed(2)}%`;
}

function cost(value: BenefitCostMetrics | undefined): string {
  if (!value || value.amount === undefined) return '—';
  return `${value.currency ?? 'USD'} ${value.amount.toFixed(6)}`;
}

function costDetail(value: BenefitCostMetrics | undefined): string | undefined {
  return value?.reason;
}

function dateTime(value: string): string {
  if (!value || !Number.isFinite(Date.parse(value))) return '—';
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
}

export function BenefitPage({ projectDir, tokenizer, tokenizerModel, platform = 'codex', snapshotId, view: controlledView, onViewChange, showViewTabs = true, active = true }: { projectDir: string; tokenizer: 'openai' | 'approx'; tokenizerModel: string; platform?: BenefitPlatform; snapshotId?: string; view?: BenefitView; onViewChange?: (view: BenefitView) => void; showViewTabs?: boolean; active?: boolean }) {
  const { t } = useTranslation();
  const [sinceHours, setSinceHours] = useState('');
  const [limit, setLimit] = useState('');
  const [plan, setPlan] = useState('');
  const [includeArchived, setIncludeArchived] = useState(true);
  const [analysisMode, setAnalysisMode] = useState<BenefitAnalysisMode>('history');
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [localView, setLocalView] = useState<BenefitView>('recommendations');
  const [report, setReport] = useState<BenefitReport | null>(null);
  const [reportBasis, setReportBasis] = useState<BenefitReportBasis | null>(null);
  const [reportJobId, setReportJobId] = useState<string>();
  const [scenarioId, setScenarioId] = useState<BenefitReport['scenarios'][number]['id']>('persistent-context');
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState<BenefitProgressEvent>({ phase: 'reading', message: '', completed: 0, total: 4 });
  const [error, setError] = useState<string | null>(null);
  const [responseModel, setResponseModel] = useState('all');
  const [responseSession, setResponseSession] = useState('all');
  const [responseTurn, setResponseTurn] = useState('all');
  const [responsePage, setResponsePage] = useState(0);
  const [copied, setCopied] = useState(false);
  const [agentOpen, setAgentOpen] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const jobRef = useRef<string | null>(null);
  const agentPanelRef = useRef<HTMLElement>(null);
  const view = controlledView ?? localView;
  const changeView = (nextView: BenefitView) => {
    setLocalView(nextView);
    onViewChange?.(nextView);
  };

  const run = async () => {
    if (analysisMode === 'plan' && !plan.trim()) {
      setError(t('benefit.planRequired'));
      return;
    }
    setLoading(true);
    setError(null);
    setReport(null);
    setReportJobId(undefined);
    setReportBasis({ projectDir, platform, tokenizer, tokenizerModel, snapshotId, sinceHours, limit, plan, includeArchived, analysisMode });
    changeView('recommendations');
    setAgentOpen(false);
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      const parsedSinceHours = sinceHours.trim() ? Number(sinceHours) : undefined;
      const parsedLimit = limit.trim() ? Number(limit) : undefined;
      const input = {
        projectDir,
        ...(parsedSinceHours !== undefined && Number.isFinite(parsedSinceHours) && parsedSinceHours > 0 ? { sinceHours: Math.max(0.01, parsedSinceHours) } : {}),
        ...(parsedLimit !== undefined && Number.isFinite(parsedLimit) && parsedLimit > 0 ? { limit: Math.max(1, Math.floor(parsedLimit)) } : {}),
        ...(analysisMode === 'plan' && plan.trim() ? { plan: plan.trim() } : {}),
        includeArchived,
        tokenizer,
        tokenizerModel,
      };
      const jobId = await startBenefitJob(input, controller.signal);
      jobRef.current = jobId;
      await new Promise<void>((resolve, reject) => {
        let close: () => void = () => undefined;
        const finish = () => {
          controller.signal.removeEventListener('abort', onAbort);
          close();
        };
        const onAbort = () => {
          finish();
          reject(new DOMException('Benefit analysis cancelled', 'AbortError'));
        };
        controller.signal.addEventListener('abort', onAbort, { once: true });
        close = streamBenefitJob(jobId, {
          progress: setProgress,
          complete: (next) => {
            setReport(next);
            setReportJobId(jobId);
            setResponsePage(0);
            if (next.scenarios.length > 0 && !next.scenarios.some((item) => item.id === scenarioId)) setScenarioId(next.scenarios[0].id);
            finish();
            resolve();
          },
          error: (nextError) => {
            finish();
            reject(nextError);
          },
          cancelled: () => {
            finish();
            reject(new DOMException('Benefit analysis cancelled', 'AbortError'));
          },
        });
        if (controller.signal.aborted) onAbort();
      });
    } catch (nextError) {
      if (!(nextError instanceof DOMException && nextError.name === 'AbortError')) setError(nextError instanceof Error ? nextError.message : String(nextError));
    } finally {
      abortRef.current = null;
      jobRef.current = null;
      setLoading(false);
    }
  };

  const cancel = () => {
    abortRef.current?.abort();
    if (jobRef.current) void cancelBenefitJob(jobRef.current);
  };

  const scenario = report?.scenarios.find((item) => item.id === scenarioId);
  const responseModels = report ? [...new Set(report.responses.map((item) => item.model ?? 'unknown'))].sort() : [];
  const responseSessions = report ? [...new Set(report.responses.map((item) => item.sessionId))].sort() : [];
  const responseTurns = report ? [...new Set(report.responses.map((item) => item.turnId ?? 'unknown'))].sort() : [];
  const filteredResponseRows = report?.responses.filter((item) => (responseModel === 'all' || (item.model ?? 'unknown') === responseModel) && (responseSession === 'all' || item.sessionId === responseSession) && (responseTurn === 'all' || (item.turnId ?? 'unknown') === responseTurn)) ?? [];
  const responsePageSize = 50;
  const responsePageCount = Math.max(1, Math.ceil(filteredResponseRows.length / responsePageSize));
  const boundedResponsePage = Math.min(responsePage, responsePageCount - 1);
  const responseRows = filteredResponseRows.slice(boundedResponsePage * responsePageSize, (boundedResponsePage + 1) * responsePageSize);
  const download = (format: 'json' | 'html' | 'csv') => {
    if (!report) return;
    const redacted = redactBenefitReport(report);
    const content = format === 'html' ? renderBenefitHtml(report, { redact: true }) : format === 'csv' ? renderBenefitCsv(redacted) : JSON.stringify(redacted, null, 2);
    const blob = new Blob([content], { type: format === 'html' ? 'text/html;charset=utf-8' : format === 'csv' ? 'text/csv;charset=utf-8' : 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `skill-doctor-benefit.${format}`;
    anchor.click();
    URL.revokeObjectURL(url);
  };
  const copySummary = async () => {
    if (!report || !navigator.clipboard?.writeText) return;
    const scenarioSummary = scenario ? ` ${scenario.label}: ${scenario.assumption}` : '';
    await navigator.clipboard.writeText(`${t('benefit.title')}: ${report.savings.status}; input ${number(report.savings.inputTokens)} (${percent(report.savings.inputTokenPercent)}); total ${number(report.savings.totalTokens)} (${percent(report.savings.totalTokenPercent)}); coverage ${percent(report.coverage.responsePercent)}.${scenarioSummary} ${t('benefit.disclaimer')}`);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  };
  const closeAgent = () => setAgentOpen(false);
  useEffect(() => {
    if (!agentOpen) return;
    agentPanelRef.current?.querySelector<HTMLElement>('[data-benefit-autofocus]')?.focus();
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === 'Escape') closeAgent(); };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [agentOpen]);

  const advancedSettings = <div className="benefit-advanced-fields">
    <label className="field"><span>{t('benefit.window')}</span><input type="number" min="0.01" step="1" value={sinceHours} onChange={(event) => setSinceHours(event.target.value)} /></label>
    <label className="field"><span>{t('benefit.limit')}</span><input type="number" min="1" step="1" value={limit} onChange={(event) => setLimit(event.target.value)} /></label>
    <label className="check-row"><input type="checkbox" checked={includeArchived} onChange={(event) => setIncludeArchived(event.target.checked)} />{t('benefit.archived')}</label>
  </div>;

  const historyReport = report?.historyAnalysis;
  const reportStale = Boolean(report && reportBasis && (
    reportBasis.projectDir !== projectDir
    || reportBasis.platform !== platform
    || reportBasis.tokenizer !== tokenizer
    || reportBasis.tokenizerModel !== tokenizerModel
    || reportBasis.snapshotId !== snapshotId
    || reportBasis.sinceHours !== sinceHours
    || reportBasis.limit !== limit
    || reportBasis.plan !== plan
    || reportBasis.includeArchived !== includeArchived
    || reportBasis.analysisMode !== analysisMode
  ));
  if (!active) return null;
  if (platform !== 'codex') return <section className="benefit-page">
    <PageHeading title={t('benefit.title')} subtitle={t('benefit.subtitle')}>
      <StatusPill kind="warning">{t('benefit.codexOnly')}</StatusPill>
    </PageHeading>
    <InlineNotice kind="info" title={t('benefit.codexOnlyTitle')}>{t('benefit.codexOnlyDetail')}</InlineNotice>
  </section>;
  return <section className="benefit-page">
    <PageHeading title={t('benefit.title')} subtitle={historyReport ? t('benefit.historyPageSubtitle') : t('benefit.subtitle')}>
      <div className="benefit-page-heading-actions">
        <StatusPill kind="warning">{t('benefit.estimatedBadge')}</StatusPill>
        {report && <button className="button secondary compact" onClick={() => void run()} disabled={loading}><RefreshCw size={14} className={loading ? 'spin' : ''} />{t('benefit.reanalyze')}</button>}
        {historyReport && <button className="button secondary compact" onClick={() => setAgentOpen(true)}><Bot size={14} />{t('benefit.agentAssist')}</button>}
        {report && <details className="benefit-export-menu"><summary className="button secondary compact"><Download size={14} />{t('benefit.export')}</summary><div role="menu"><p>{t('benefit.exportShareHint')}</p><button role="menuitem" onClick={() => download('html')}>HTML</button><button role="menuitem" onClick={() => download('json')}>JSON</button><button role="menuitem" onClick={() => download('csv')}>CSV</button></div></details>}
      </div>
    </PageHeading>
    <div className="benefit-context-line"><span><strong>{t('benefit.projectLabel')}</strong><code title={projectDir}>{projectDir}</code></span><span><strong>{t('benefit.agentLabel')}</strong>Codex</span><span><strong>{t('benefit.scopeLabel')}</strong>{t('benefit.projectOnly')}</span>{report && <span><strong>{t('benefit.analyzedAt')}</strong>{dateTime(report.generatedAt)}</span>}</div>
    {reportStale && <InlineNotice kind="warning" title={t('benefit.reportStale')}>{t('benefit.reportStaleDetail')}</InlineNotice>}

    {!report && !loading && <section className="panel benefit-analysis-setup">
      <header className="benefit-setup-heading"><div><span className="benefit-kicker">{t('benefit.analysisKicker')}</span><h2>{t('benefit.analysisTitle')}</h2><p>{t('benefit.analysisDetail')}</p></div><BookOpen size={22} /></header>
      <div className="benefit-mode-label">{t('benefit.analysisMode')}</div><div className="benefit-mode-options" role="radiogroup" aria-label={t('benefit.analysisMode')}>
        <label className={analysisMode === 'history' ? 'selected' : ''}><input type="radio" name="benefit-analysis-mode" checked={analysisMode === 'history'} onChange={() => setAnalysisMode('history')} /><span><strong>{t('benefit.historyMode')}</strong><small>{t('benefit.historyModeDetail')}</small></span></label>
        <label className={analysisMode === 'plan' ? 'selected' : ''}><input type="radio" name="benefit-analysis-mode" checked={analysisMode === 'plan'} onChange={() => setAnalysisMode('plan')} /><span><strong>{t('benefit.planMode')}</strong><small>{t('benefit.planModeDetail')}</small></span></label>
      </div>
      {analysisMode === 'plan' && <label className="field benefit-plan-field"><span>{t('benefit.plan')}</span><input value={plan} onChange={(event) => setPlan(event.target.value)} placeholder={t('benefit.planPlaceholder')} /></label>}
      <div className="benefit-setup-actions"><button className="button primary" disabled={analysisMode === 'plan' && !plan.trim()} onClick={() => void run()}><Gauge size={15} />{analysisMode === 'history' ? t('benefit.analyzeHistory') : t('benefit.analyzePlan')}</button><details open={advancedOpen} onToggle={(event) => setAdvancedOpen(event.currentTarget.open)}><summary>{t('benefit.advancedSettings')}</summary>{advancedSettings}</details></div>
      <p className="benefit-local-note">{t('benefit.localOnly')}</p>
    </section>}
    {report && <div className="benefit-analysis-inline"><span><strong>{t('benefit.analysisMode')}</strong>{analysisMode === 'history' ? t('benefit.historyMode') : t('benefit.planMode')}</span><span>{t('benefit.analysisScopeSummary', { archived: includeArchived ? t('benefit.historyArchivedYes') : t('benefit.historyArchivedNo') })}</span><details><summary>{t('benefit.advancedSettings')}</summary>{advancedSettings}</details></div>}
    {error && <InlineNotice kind="danger" title={t('notice.incomplete')} onClose={() => setError(null)}>{error}</InlineNotice>}
    {loading && <div className="benefit-progress"><div className="benefit-progress-heading"><strong>{t('benefit.loading')}</strong><span>{progress.completed}/{progress.total}</span></div><div className="benefit-progress-track"><span style={{ width: `${Math.max(0, Math.min(100, progress.completed / Math.max(1, progress.total) * 100))}%` }} /></div><small>{progress.message || t('benefit.loading')}</small><button className="button secondary compact" onClick={cancel}>{t('benefit.cancel')}</button></div>}
    {!report && !loading && <div className="clean-state benefit-empty"><span><Gauge size={22} /></span><div><h3>{analysisMode === 'history' ? t('benefit.emptyHistory') : t('benefit.emptyPlan')}</h3><p>{t('benefit.emptyDetail')}</p></div></div>}

    {historyReport && <div className="benefit-history-workbench">
      <HistoryBenefitSummary history={historyReport} compact onOpenEvidence={() => changeView('evidence')} />
      {showViewTabs && <nav className="benefit-view-tabs" role="tablist" aria-label={t('benefit.historyViews')}><button role="tab" aria-selected={view === 'recommendations'} className={view === 'recommendations' ? 'active' : ''} onClick={() => changeView('recommendations')}>{t('benefit.historyRecommendationsTitle')}</button><button role="tab" aria-selected={view === 'evidence'} className={view === 'evidence' ? 'active' : ''} onClick={() => changeView('evidence')}>{t('benefit.historyEvidenceView')}</button></nav>}
      {view === 'recommendations' && <>{reportJobId && report.projectDir === projectDir ? <HistoryControlPanel key={reportJobId} history={historyReport} jobId={reportJobId} projectDir={report.projectDir} showAgentPrompt={false} onExpired={() => void run()} /> : <InlineNotice kind="warning" title={t('benefit.reportExpired')}>{t('benefit.reportExpiredDetail')}</InlineNotice>}</>}
      {view === 'evidence' && <HistoryBenefitEvidence history={historyReport} report={report} />}
    </div>}

    {report && !historyReport && <>
      <div className="stat-grid">
        <StatCard label={t('benefit.inputSavings')} value={report.savings.inputTokens ?? 0} detail={report.savings.inputTokenPercent === undefined ? t('benefit.notAvailable') : percent(report.savings.inputTokenPercent)} />
        <StatCard label={t('benefit.totalSavings')} value={report.savings.totalTokens ?? 0} detail={report.savings.totalTokenPercent === undefined ? t('benefit.notAvailable') : percent(report.savings.totalTokenPercent)} />
        <StatCard label={t('benefit.responses')} value={report.selection.selectedResponseCount} detail={`${report.coverage.responsePercent.toFixed(2)}% ${t('benefit.covered')}`} />
        <StatCard label={t('benefit.priceCoverage')} value={report.costCoverage.pricedResponseCount} detail={`${percent(report.costCoverage.responsePercent)} ${t('benefit.priced')}`} />
      </div>
      {report.plan?.sourceKind === 'offline' && report.plan.offline?.descriptionEstimates && <section className="panel">
        <div className="panel-heading"><div><h3>{t('benefit.descriptionEstimateTitle')}</h3><p>{t('benefit.descriptionEstimateDetail')}</p></div></div>
        <div className="benefit-evidence-grid"><div><span>{t('benefit.skillDescriptionDefinite')}</span><strong>{number(report.plan.offline.descriptionEstimates.skillsInstructions.verifiedRemovableTokens)}</strong><small>{number(report.plan.offline.descriptionEstimates.skillsInstructions.verifiedRemovableCount)} {t('benefit.entries')}</small></div><div><span>{t('benefit.skillDescriptionPotential')}</span><strong>{number(report.plan.offline.descriptionEstimates.skillsInstructions.unverifiedPotentialTokens)}</strong><small>{number(report.plan.offline.descriptionEstimates.skillsInstructions.unverifiedPotentialCount)} {t('benefit.entries')}</small></div><div><span>{t('benefit.pluginDescriptionDefinite')}</span><strong>{number(report.plan.offline.descriptionEstimates.recommendedPlugins.verifiedRemovableTokens)}</strong><small>{number(report.plan.offline.descriptionEstimates.recommendedPlugins.verifiedRemovableCount)} {t('benefit.entries')}</small></div><div><span>{t('benefit.pluginDescriptionPotential')}</span><strong>{number(report.plan.offline.descriptionEstimates.recommendedPlugins.unverifiedPotentialTokens)}</strong><small>{number(report.plan.offline.descriptionEstimates.recommendedPlugins.unverifiedPotentialCount)} {t('benefit.entries')}</small></div></div>
      </section>}
      <section className="panel">
        <div className="panel-heading"><div><h3>{t('benefit.resultTitle')}</h3><p>{t('benefit.resultDetail', { status: report.savings.status, sessions: report.selection.selectedSessions, files: report.selection.associatedFileCount })}</p></div><div className="benefit-actions"><button className="button secondary compact" onClick={() => void copySummary()}><Clipboard size={14} />{copied ? t('benefit.copied') : t('benefit.copy')}</button><button className="button secondary compact" onClick={() => download('json')}><Download size={14} />JSON</button><button className="button secondary compact" onClick={() => download('html')}><Download size={14} />HTML</button><button className="button secondary compact" onClick={() => download('csv')}><Download size={14} />CSV</button></div></div>
        <div className="benefit-comparison"><div><span>{t('benefit.baseline')}</span><strong>{number(report.baseline.inputTokens)}</strong><small>{number(report.baseline.totalTokens)} total</small></div><div><span>{t('benefit.projected')}</span><strong>{number(report.projected.inputTokens)}</strong><small>{number(report.projected.totalTokens)} total</small></div></div>
        {report.scenarios.length > 0 && <><div className="benefit-simulation-guide"><strong>{t('benefit.simulationGuideTitle')}</strong><span>{t('benefit.simulationGuideDetail')}</span></div><div className="segmented benefit-scenarios" aria-label={t('benefit.simulationChoice')}><span className="benefit-choice-label">{t('benefit.simulationChoice')}</span>{report.scenarios.map((item) => <button key={item.id} className={scenario?.id === item.id ? 'active' : ''} onClick={() => setScenarioId(item.id)}>{item.label}</button>)}</div>{scenario && <div className="benefit-assumption"><strong>{t('benefit.cost')}</strong><span>{cost(scenario.baseline)} → {cost(scenario.projected)}</span><small>{scenario.assumption}</small>{costDetail(scenario.baseline) && <small>{costDetail(scenario.baseline)}</small>}</div>}</>}
      </section>
      <section className="panel benefit-evidence"><div className="panel-heading"><div><h3>{t('benefit.evidenceTitle')}</h3><p>{t('benefit.evidenceDetail')}</p><small className="muted">{t('benefit.inventoryStatus', { status: report.planCoverage.inventoryStatus })}</small></div><StatusPill kind={(report.planCoverage.status === 'matched' && report.planCoverage.inventoryStatus !== 'mismatch' && report.planCoverage.inventoryStatus !== 'unknown') || report.planCoverage.status === 'static_only' ? 'success' : 'warning'}>{report.planCoverage.status}</StatusPill></div><div className="benefit-evidence-grid"><div><span>{t('benefit.snapshotEvidence')}</span><strong>{report.planCoverage.historicalSnapshotCount}</strong></div><div><span>{t('benefit.resourceEvidence')}</span><strong>{report.planCoverage.matchedResourceCount}/{report.planCoverage.resources.length}</strong></div><div><span>{t('benefit.textEvidence')}</span><strong>{report.evidence.textReconstructedResponseCount}</strong></div><div><span>{t('benefit.alreadyOptimized')}</span><strong>{report.planCoverage.alreadyOptimizedResponseCount}</strong></div><div><span>{t('benefit.tokenizer')}</span><strong>{report.evidence.tokenizer.encoding ?? report.evidence.tokenizer.mode}</strong></div></div>{report.planCoverage.resources.length > 0 && <div className="group-list">{report.planCoverage.resources.map((item) => <div className="group-row" key={`${item.id ?? item.name ?? item.sourcePath ?? item.resource}-${item.status}`}><span>{item.name ?? item.id ?? item.resource ?? 'resource'}</span><div>{item.status}</div><small>{item.reason}</small></div>)}</div>}{report.resourceContributions.length > 0 && <div className="group-list benefit-contributions"><h4>{t('benefit.contributionTitle')}</h4>{report.resourceContributions.map((item) => <div className="group-row" key={item.resourceId}><span>{item.resourceId}</span><div>{number(item.inputSavings)} {t('benefit.savings')}</div><small>{t('benefit.contributionDetail', { responses: item.responseCount, interaction: number(item.interactionTokens) })}</small></div>)}</div>}</section>
      <section className="panel benefit-details"><div className="panel-heading"><div><h3>{t('benefit.detailsTitle')}</h3><p>{t('benefit.detailsDetail')}</p></div><div className="benefit-detail-filters"><select aria-label={t('benefit.responseModel')} value={responseModel} onChange={(event) => { setResponseModel(event.target.value); setResponsePage(0); }}><option value="all">{t('benefit.allModels')}</option>{responseModels.map((model) => <option key={model} value={model}>{model}</option>)}</select><select aria-label={t('benefit.responseSession')} value={responseSession} onChange={(event) => { setResponseSession(event.target.value); setResponsePage(0); }}><option value="all">{t('benefit.allSessions')}</option>{responseSessions.map((session) => <option key={session} value={session}>{session}</option>)}</select><select aria-label={t('benefit.responseTurn')} value={responseTurn} onChange={(event) => { setResponseTurn(event.target.value); setResponsePage(0); }}><option value="all">{t('benefit.allTurns')}</option>{responseTurns.map((turn) => <option key={turn} value={turn}>{turn}</option>)}</select></div></div><div className="benefit-response-table-wrap"><table className="benefit-response-table"><thead><tr><th>{t('benefit.response')}</th><th>{t('benefit.model')}</th><th>{t('benefit.turn')}</th><th>{t('benefit.evidence')}</th><th>{t('benefit.status')}</th><th>{t('benefit.input')}</th><th>{t('benefit.savings')}</th></tr></thead><tbody>{responseRows.map((item) => <tr key={`${item.sessionId}:${item.responseId}`}><td><details><summary>{item.responseId}</summary><small>{t('benefit.traceDetail', { line: item.line })}</small>{item.resourceMatches && item.resourceMatches.length > 0 && <ul className="benefit-match-list">{item.resourceMatches.map((match) => <li key={`${match.id ?? match.name ?? match.sourcePath ?? match.resource}-${match.status}`}>{match.name ?? match.id ?? match.resource ?? 'resource'}: {match.status}</li>)}</ul>}</details></td><td>{item.model ?? 'unknown'}</td><td>{item.turnId ?? 'unknown'}</td><td>{item.evidence ?? 'unknown'}</td><td>{item.status}</td><td>{number(item.before.inputTokens)}</td><td>{number(item.estimatedInputSavings)}</td></tr>)}{responseRows.length === 0 && <tr><td colSpan={7}>{t('benefit.noResponses')}</td></tr>}</tbody></table></div><div className="benefit-pagination"><button className="button secondary compact" disabled={boundedResponsePage === 0} onClick={() => setResponsePage(Math.max(0, boundedResponsePage - 1))}>{t('benefit.previous')}</button><span>{t('benefit.pageInfo', { page: boundedResponsePage + 1, pages: responsePageCount, count: filteredResponseRows.length })}</span><button className="button secondary compact" disabled={boundedResponsePage >= responsePageCount - 1} onClick={() => setResponsePage(Math.min(responsePageCount - 1, boundedResponsePage + 1))}>{t('benefit.next')}</button></div></section>
      <section className="panel">
        <div className="panel-heading"><div><h3>{t('benefit.modelTitle')}</h3><p>{t('benefit.modelDetail')}</p></div></div>
        <div className="group-list">{(scenario?.modelCosts ?? report.modelCosts).map((item) => <div className="group-row" key={item.model}><span>{item.model}</span><div>{item.pricedResponseCount}/{item.responseCount} {t('benefit.priced')}</div><strong>{cost(item.baseline)}{item.projected?.amount !== undefined ? ` → ${cost(item.projected)}` : ''}</strong>{costDetail(item.baseline) && <small>{costDetail(item.baseline)}</small>}</div>)}{!report.modelCosts.length && <EmptyRows icon={Gauge} title={t('benefit.noModelCosts')} />}</div>
      </section>
      <p className="benefit-disclaimer">{t('benefit.disclaimer')}</p>
    </>}

    {agentOpen && <div className="history-drawer-overlay benefit-agent-overlay" onMouseDown={(event) => { if (event.target === event.currentTarget) closeAgent(); }}><aside className="history-control-drawer benefit-agent-panel" role="dialog" aria-modal="true" aria-labelledby="benefit-agent-title" ref={agentPanelRef}><header className="history-drawer-heading"><div><span className="history-benefit-kicker">{t('benefit.agentAssist')}</span><h2 id="benefit-agent-title">{t('benefit.agentAssistTitle')}</h2></div><button className="icon-button" data-benefit-autofocus aria-label={t('benefit.controlClosePanel')} onClick={closeAgent}><X size={17} /></button></header><div className="history-drawer-body"><p>{t('benefit.agentAssistIntro')}</p><ol className="benefit-agent-steps"><li>{t('benefit.agentStepCopy')}</li><li>{t('benefit.agentStepRun')}</li><li>{t('benefit.agentStepConfirm')}</li></ol><label className="benefit-agent-prompt"><span>{t('benefit.agentPromptLabel')}</span><textarea readOnly value={t('benefit.controlAgentPrompt', { project: projectDir })} rows={12} /></label><p className="history-control-note">{t('benefit.agentNoExecution')}</p></div><footer className="history-drawer-footer"><button className="button primary" onClick={async () => { try { await navigator.clipboard.writeText(t('benefit.controlAgentPrompt', { project: projectDir })); } catch { /* Keep the prompt selectable when clipboard access is unavailable. */ } }}>{t('benefit.controlCopy')}</button><button className="button secondary" onClick={closeAgent}>{t('benefit.controlCancel')}</button></footer></aside></div>}
  </section>;
}
