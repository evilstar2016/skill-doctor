import { Clipboard, Download, Gauge, RefreshCw } from 'lucide-react';
import { useRef, useState } from 'react';

import type { BenefitCostMetrics, BenefitReport } from '../../../src/benefit/types';
import { cancelBenefitJob, startBenefitJob, streamBenefitJob, type BenefitProgressEvent } from '../api';
import { EmptyRows, InlineNotice, PageHeading, StatCard, StatusPill } from '../components/ui';
import { useTranslation } from '../i18n';
import { renderBenefitHtml, redactBenefitReport } from '../../../src/render/renderBenefit';

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

export function BenefitPage({ projectDir, tokenizer, tokenizerModel }: { projectDir: string; tokenizer: 'openai' | 'approx'; tokenizerModel: string }) {
  const { t } = useTranslation();
  const [sinceHours, setSinceHours] = useState('24');
  const [limit, setLimit] = useState('20');
  const [plan, setPlan] = useState('');
  const [includeArchived, setIncludeArchived] = useState(false);
  const [report, setReport] = useState<BenefitReport | null>(null);
  const [scenarioId, setScenarioId] = useState<BenefitReport['scenarios'][number]['id']>('historical-cache');
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState<BenefitProgressEvent>({ phase: 'reading', message: '', completed: 0, total: 4 });
  const [error, setError] = useState<string | null>(null);
  const [responseModel, setResponseModel] = useState('all');
  const [responseSession, setResponseSession] = useState('all');
  const [responseTurn, setResponseTurn] = useState('all');
  const [responsePage, setResponsePage] = useState(0);
  const [copied, setCopied] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const jobRef = useRef<string | null>(null);

  const run = async () => {
    setLoading(true);
    setError(null);
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      const input = {
        projectDir,
        sinceHours: Math.max(0.01, Number(sinceHours) || 24),
        limit: Math.max(1, Math.floor(Number(limit) || 20)),
        ...(plan.trim() ? { plan: plan.trim() } : {}),
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
  const filteredResponseRows = report?.responses.filter((item) => (responseModel === 'all' || (item.model ?? 'unknown') === responseModel) && (responseSession === 'all' || item.sessionId === responseSession) && (responseTurn === 'all' || (item.turnId ?? 'unknown') === responseTurn)).slice(0, 200) ?? [];
  const responsePageSize = 50;
  const responsePageCount = Math.max(1, Math.ceil(filteredResponseRows.length / responsePageSize));
  const boundedResponsePage = Math.min(responsePage, responsePageCount - 1);
  const responseRows = filteredResponseRows.slice(boundedResponsePage * responsePageSize, (boundedResponsePage + 1) * responsePageSize);
  const download = (format: 'json' | 'html') => {
    if (!report) return;
    const content = format === 'html' ? renderBenefitHtml(report) : JSON.stringify(redactBenefitReport(report), null, 2);
    const blob = new Blob([content], { type: format === 'html' ? 'text/html;charset=utf-8' : 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `skill-doctor-benefit.${format}`;
    anchor.click();
    URL.revokeObjectURL(url);
  };
  const copySummary = async () => {
    if (!report) return;
    if (!navigator.clipboard?.writeText) return;
    const scenarioSummary = scenario ? ` ${scenario.label}: ${scenario.assumption}` : '';
    await navigator.clipboard.writeText(`${t('benefit.title')}: ${report.savings.status}; input ${number(report.savings.inputTokens)} (${percent(report.savings.inputTokenPercent)}); total ${number(report.savings.totalTokens)} (${percent(report.savings.totalTokenPercent)}); coverage ${percent(report.coverage.responsePercent)}.${scenarioSummary} ${t('benefit.disclaimer')}`);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  };
  return <section>
    <PageHeading title={t('benefit.title')} subtitle={t('benefit.subtitle')}>
      <StatusPill kind="warning">{t('benefit.estimatedBadge')}</StatusPill>
    </PageHeading>
    <section className="panel benefit-controls">
      <div className="panel-heading"><div><h3>{t('benefit.controlsTitle')}</h3><p>{t('benefit.controlsDetail')}</p></div></div>
      <div className="benefit-form">
        <label className="field"><span>{t('benefit.window')}</span><input type="number" min="0.01" step="1" value={sinceHours} onChange={(event) => setSinceHours(event.target.value)} /></label>
        <label className="field"><span>{t('benefit.limit')}</span><input type="number" min="1" step="1" value={limit} onChange={(event) => setLimit(event.target.value)} /></label>
        <label className="field"><span>{t('benefit.plan')}</span><input value={plan} onChange={(event) => setPlan(event.target.value)} placeholder={t('benefit.planPlaceholder')} /></label>
        <label className="check-row"><input type="checkbox" checked={includeArchived} onChange={(event) => setIncludeArchived(event.target.checked)} />{t('benefit.archived')}</label>
        <button className="button primary" onClick={() => void (loading ? cancel() : run())}><RefreshCw size={15} className={loading ? 'spin' : ''} />{loading ? t('benefit.cancel') : t('benefit.analyze')}</button>
      </div>
      <div className="benefit-guide"><strong>{t('benefit.planGuideTitle')}</strong><ol><li>{t('benefit.planGuideStep1')}</li><li>{t('benefit.planGuideStep2')}</li><li>{t('benefit.planGuideStep3')}</li></ol></div>
    </section>
    {error && <InlineNotice kind="danger" title={t('notice.incomplete')} onClose={() => setError(null)}>{error}</InlineNotice>}
    {!report && !loading && <div className="clean-state benefit-empty"><span><Gauge size={22} /></span><div><h3>{t('benefit.empty')}</h3><p>{t('benefit.emptyDetail')}</p></div></div>}
    {loading && <div className="benefit-progress"><div className="benefit-progress-heading"><strong>{t('benefit.loading')}</strong><span>{progress.completed}/{progress.total}</span></div><div className="benefit-progress-track"><span style={{ width: `${Math.max(0, Math.min(100, progress.completed / Math.max(1, progress.total) * 100))}%` }} /></div><small>{progress.message || t('benefit.loading')}</small></div>}
    {report && <>
      <div className="stat-grid">
        <StatCard label={t('benefit.inputSavings')} value={report.savings.inputTokens ?? 0} detail={report.savings.inputTokenPercent === undefined ? t('benefit.notAvailable') : percent(report.savings.inputTokenPercent)} />
        <StatCard label={t('benefit.totalSavings')} value={report.savings.totalTokens ?? 0} detail={report.savings.totalTokenPercent === undefined ? t('benefit.notAvailable') : percent(report.savings.totalTokenPercent)} />
        <StatCard label={t('benefit.responses')} value={report.selection.selectedResponseCount} detail={`${report.coverage.responsePercent.toFixed(2)}% ${t('benefit.covered')}`} />
        <StatCard label={t('benefit.priceCoverage')} value={report.costCoverage.pricedResponseCount} detail={`${percent(report.costCoverage.responsePercent)} ${t('benefit.priced')}`} />
      </div>
      <section className="panel">
        <div className="panel-heading"><div><h3>{t('benefit.resultTitle')}</h3><p>{t('benefit.resultDetail', { status: report.savings.status, sessions: report.selection.selectedSessions, files: report.selection.associatedFileCount })}</p></div><div className="benefit-actions"><button className="button secondary compact" onClick={() => void copySummary()}><Clipboard size={14} />{copied ? t('benefit.copied') : t('benefit.copy')}</button><button className="button secondary compact" onClick={() => download('json')}><Download size={14} />JSON</button><button className="button secondary compact" onClick={() => download('html')}><Download size={14} />HTML</button></div></div>
        <div className="benefit-comparison"><div><span>{t('benefit.baseline')}</span><strong>{number(report.baseline.inputTokens)}</strong><small>{number(report.baseline.totalTokens)} total</small></div><div><span>{t('benefit.projected')}</span><strong>{number(report.projected.inputTokens)}</strong><small>{number(report.projected.totalTokens)} total</small></div></div>
        {report.scenarios.length > 0 && <>
          <div className="benefit-simulation-guide"><strong>{t('benefit.simulationGuideTitle')}</strong><span>{t('benefit.simulationGuideDetail')}</span></div>
          <div className="segmented benefit-scenarios" aria-label={t('benefit.simulationChoice')}><span className="benefit-choice-label">{t('benefit.simulationChoice')}</span>{report.scenarios.map((item) => <button key={item.id} className={scenario?.id === item.id ? 'active' : ''} onClick={() => setScenarioId(item.id)}>{item.label}</button>)}</div>
          {scenario && <div className="benefit-assumption"><strong>{t('benefit.cost')}</strong><span>{cost(scenario.baseline)} → {cost(scenario.projected)}</span><small>{scenario.assumption}</small>{costDetail(scenario.baseline) && <small>{costDetail(scenario.baseline)}</small>}</div>}
        </>}
      </section>
      <section className="panel benefit-evidence">
        <div className="panel-heading"><div><h3>{t('benefit.evidenceTitle')}</h3><p>{t('benefit.evidenceDetail')}</p><small className="muted">{t('benefit.inventoryStatus', { status: report.planCoverage.inventoryStatus })}</small></div><StatusPill kind={(report.planCoverage.status === 'matched' && report.planCoverage.inventoryStatus !== 'mismatch' && report.planCoverage.inventoryStatus !== 'unknown') || report.planCoverage.status === 'static_only' ? 'success' : 'warning'}>{report.planCoverage.status}</StatusPill></div>
        <div className="benefit-evidence-grid"><div><span>{t('benefit.snapshotEvidence')}</span><strong>{report.planCoverage.historicalSnapshotCount}</strong></div><div><span>{t('benefit.resourceEvidence')}</span><strong>{report.planCoverage.matchedResourceCount}/{report.planCoverage.resources.length}</strong></div><div><span>{t('benefit.textEvidence')}</span><strong>{report.evidence.textReconstructedResponseCount}</strong></div><div><span>{t('benefit.alreadyOptimized')}</span><strong>{report.planCoverage.alreadyOptimizedResponseCount}</strong></div><div><span>{t('benefit.tokenizer')}</span><strong>{report.evidence.tokenizer.encoding ?? report.evidence.tokenizer.mode}</strong></div></div>
        {report.planCoverage.resources.length > 0 && <div className="group-list">{report.planCoverage.resources.map((item) => <div className="group-row" key={`${item.id ?? item.name ?? item.sourcePath ?? item.resource}-${item.status}`}><span>{item.name ?? item.id ?? item.resource ?? 'resource'}</span><div>{item.status}</div><small>{item.reason}</small></div>)}</div>}
        {report.resourceContributions.length > 0 && <div className="group-list benefit-contributions"><h4>{t('benefit.contributionTitle')}</h4>{report.resourceContributions.map((item) => <div className="group-row" key={item.resourceId}><span>{item.resourceId}</span><div>{number(item.inputSavings)} {t('benefit.savings')}</div><small>{t('benefit.contributionDetail', { responses: item.responseCount, interaction: number(item.interactionTokens) })}</small></div>)}</div>}
      </section>
      <section className="panel benefit-details">
        <div className="panel-heading"><div><h3>{t('benefit.detailsTitle')}</h3><p>{t('benefit.detailsDetail')}</p></div><div className="benefit-detail-filters"><select value={responseModel} onChange={(event) => { setResponseModel(event.target.value); setResponsePage(0); }}><option value="all">{t('benefit.allModels')}</option>{responseModels.map((model) => <option key={model} value={model}>{model}</option>)}</select><select value={responseSession} onChange={(event) => { setResponseSession(event.target.value); setResponsePage(0); }}><option value="all">{t('benefit.allSessions')}</option>{responseSessions.map((session) => <option key={session} value={session}>{session}</option>)}</select><select value={responseTurn} onChange={(event) => { setResponseTurn(event.target.value); setResponsePage(0); }}><option value="all">{t('benefit.allTurns')}</option>{responseTurns.map((turn) => <option key={turn} value={turn}>{turn}</option>)}</select></div></div>
        <div className="benefit-response-table-wrap"><table className="benefit-response-table"><thead><tr><th>{t('benefit.response')}</th><th>{t('benefit.model')}</th><th>{t('benefit.turn')}</th><th>{t('benefit.evidence')}</th><th>{t('benefit.status')}</th><th>{t('benefit.input')}</th><th>{t('benefit.savings')}</th></tr></thead><tbody>{responseRows.map((item) => <tr key={`${item.sessionId}:${item.responseId}`}><td><details><summary>{item.responseId}</summary><small>{t('benefit.traceDetail', { line: item.line })}</small>{item.resourceMatches && item.resourceMatches.length > 0 && <ul className="benefit-match-list">{item.resourceMatches.map((match) => <li key={`${match.id ?? match.name ?? match.sourcePath ?? match.resource}-${match.status}`}>{match.name ?? match.id ?? match.resource ?? 'resource'}: {match.status}</li>)}</ul>}</details></td><td>{item.model ?? 'unknown'}</td><td>{item.turnId ?? 'unknown'}</td><td>{item.evidence ?? 'unknown'}</td><td>{item.status}</td><td>{number(item.before.inputTokens)}</td><td>{number(item.estimatedInputSavings)}</td></tr>)}{responseRows.length === 0 && <tr><td colSpan={7}>{t('benefit.noResponses')}</td></tr>}</tbody></table></div><div className="benefit-pagination"><button className="button secondary compact" disabled={boundedResponsePage === 0} onClick={() => setResponsePage(Math.max(0, boundedResponsePage - 1))}>{t('benefit.previous')}</button><span>{t('benefit.pageInfo', { page: boundedResponsePage + 1, pages: responsePageCount, count: filteredResponseRows.length })}</span><button className="button secondary compact" disabled={boundedResponsePage >= responsePageCount - 1} onClick={() => setResponsePage(Math.min(responsePageCount - 1, boundedResponsePage + 1))}>{t('benefit.next')}</button></div>
      </section>
      <section className="panel">
        <div className="panel-heading"><div><h3>{t('benefit.modelTitle')}</h3><p>{t('benefit.modelDetail')}</p></div></div>
        <div className="group-list">{report.modelCosts.map((item) => <div className="group-row" key={item.model}><span>{item.model}</span><div>{item.pricedResponseCount}/{item.responseCount} {t('benefit.priced')}</div><strong>{cost(item.baseline)}{item.projected?.amount !== undefined ? ` → ${cost(item.projected)}` : ''}</strong>{costDetail(item.baseline) && <small>{costDetail(item.baseline)}</small>}</div>)}{!report.modelCosts.length && <EmptyRows icon={Gauge} title={t('benefit.noModelCosts')} />}</div>
      </section>
      <p className="benefit-disclaimer">{t('benefit.disclaimer')}</p>
    </>}
  </section>;
}
