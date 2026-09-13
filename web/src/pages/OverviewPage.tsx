import { Activity, AlertTriangle, ArrowRight, BarChart3, Database, FileCode2, Play, ShieldCheck, Sparkles } from 'lucide-react';
import type { DoctorSnapshot, UiIssue } from '../../../src/application/types';
import { IssueCard, PageHeading, PlatformIcon, StatusPill, platformLabel } from '../components/ui';
import { useTranslation } from '../i18n';
import './overviewPage.css';

type OverviewStatus = 'success' | 'warning' | 'danger';

function fmtTokens(value: number | undefined): string {
  if (value === undefined) return '—';
  if (value >= 1000) return `${(value / 1000).toFixed(value >= 10000 ? 0 : 1)}k`;
  return String(value);
}

function hasKnownContextEstimate(snapshot: DoctorSnapshot): boolean {
  return Boolean(snapshot.context?.items.some((item) => item.estimateStatus !== 'unknown' && item.estimateStatus !== 'unsupported'));
}

function EmptyOverview({ running, runScan }: { running: boolean; runScan: () => void }) {
  const { t } = useTranslation();
  const previewRows = [
    { key: 'health', icon: ShieldCheck, label: t('overview.preview.health'), metric: t('overview.preview.healthMetric') },
    { key: 'skills', icon: Database, label: t('overview.preview.skills'), metric: t('overview.preview.skillsMetric') },
    { key: 'resources', icon: FileCode2, label: t('overview.preview.resources'), metric: t('overview.preview.resourcesMetric') },
    { key: 'context', icon: BarChart3, label: t('overview.preview.context'), metric: t('overview.preview.contextMetric') },
    { key: 'issues', icon: AlertTriangle, label: t('overview.preview.issues'), metric: t('overview.preview.issuesMetric') },
  ];

  return <section className="overview-empty-page">
    <PageHeading title={t('overview.emptyTitle')} subtitle={t('overview.emptySubtitle')} />
    <section className={`overview-empty-card ${running ? 'is-running' : ''}`} aria-labelledby="overview-empty-title">
      <div className="overview-empty-main">
        <span className="overview-empty-icon"><Activity size={30} strokeWidth={1.7} /></span>
        <div className="overview-empty-copy">
          <h2 id="overview-empty-title">{running ? t('common.scanning') : t('common.noScan')}</h2>
          <p>{running ? t('common.scanningDetail') : t('overview.emptyDetail')}</p>
        </div>
        <button className="button primary overview-empty-action" onClick={runScan} disabled={running}>
          <Play size={16} fill="currentColor" />{running ? t('common.scanning') : t('overview.startScan')}
        </button>
      </div>
      <div className="overview-empty-notes">
        <span>{t('overview.emptyLocal')}</span>
        <span>{t('overview.emptyCache')}</span>
        <span>{t('overview.emptyRescan')}</span>
      </div>
    </section>
    <section className="overview-preview" aria-labelledby="overview-preview-title">
      <div className="overview-preview-heading">
        <div><h2 id="overview-preview-title">{t('overview.previewTitle')}</h2><p>{t('overview.previewDetail')}</p></div>
        <span>{t('overview.previewPending')}</span>
      </div>
      <div className="overview-preview-table" role="table" aria-label={t('overview.previewTitle')}>
        <div className="overview-preview-head" role="row">
          <span>{t('overview.previewCategory')}</span><span>{t('overview.previewStatus')}</span><span>{t('overview.previewMetric')}</span><span>{t('overview.previewIssues')}</span><span>{t('overview.previewLastScan')}</span>
        </div>
        {previewRows.map(({ key, icon: Icon, label, metric }) => <div className="overview-preview-row" role="row" key={key}>
          <span><Icon size={17} strokeWidth={1.7} />{label}</span><span><i>—</i></span><span>{metric}</span><span>—</span><span>{t('overview.previewPending')}</span>
        </div>)}
      </div>
    </section>
  </section>;
}

export function OverviewPage({ snapshot, scan, runScan, openIssue, navigateToResources, navigateToIssues, navigateToContext, navigateToOptimization }: {
  snapshot: DoctorSnapshot | null;
  scan: { running: boolean };
  runScan: () => void;
  openIssue: (issue: UiIssue) => void;
  navigateToResources: () => void;
  navigateToIssues: () => void;
  navigateToContext: () => void;
  navigateToOptimization: () => void;
}) {
  const { t } = useTranslation();
  if (!snapshot) return <EmptyOverview running={scan.running} runScan={runScan} />;

  const summary = snapshot.summary;
  const incomplete = snapshot.status === 'partial' || snapshot.warnings.length > 0;
  const actionableIssues = snapshot.issues.filter((issue) => issue.severity !== 'info');
  const contextEstimateAvailable = hasKnownContextEstimate(snapshot);
  const fixedTokens = contextEstimateAvailable ? summary.fixedTokens : undefined;
  const activationTokens = contextEstimateAvailable ? summary.activationTokens : undefined;
  const unknownCount = snapshot.context ? snapshot.context.items.filter((item) => item.estimateStatus === 'unknown' || item.estimateStatus === 'unsupported').length : undefined;
  const coverageGap = unknownCount !== undefined && unknownCount > 0;
  const controllableItems = snapshot.context?.items.filter((item) => item.enabled !== false && item.controllable === true && Boolean(item.id) && !item.sourcePaths?.length && item.estimateStatus !== 'unknown' && item.estimateStatus !== 'unsupported') ?? [];
  const optimizationCount = controllableItems.length > 0 ? controllableItems.length : undefined;
  const status: OverviewStatus = summary.high > 0 ? 'danger' : incomplete || coverageGap || actionableIssues.length > 0 ? 'warning' : 'success';
  const nextAction = actionableIssues.length > 0
    ? { label: t('overview.nextIssues'), detail: t('overview.nextIssuesDetail', { count: actionableIssues.length }), onClick: navigateToIssues }
    : coverageGap || optimizationCount === undefined
      ? { label: t('overview.nextContext'), detail: t('overview.nextContextDetail'), onClick: navigateToContext }
      : optimizationCount > 0
        ? { label: t('overview.nextOptimization'), detail: t('overview.nextOptimizationDetail', { count: optimizationCount }), onClick: navigateToOptimization }
        : { label: t('overview.nextResources'), detail: t('overview.nextResourcesDetail'), onClick: navigateToResources };

  return <section>
    <PageHeading title={incomplete ? t('overview.incomplete') : t('overview.title')} subtitle={incomplete ? t('overview.incompleteDetail', { count: snapshot.warnings.length }) : coverageGap ? t('overview.coverageDetail', { count: unknownCount ?? 0 }) : actionableIssues.length ? t('overview.issuesDetail', { count: actionableIssues.length }) : t('overview.goodDetail')}>
      <StatusPill kind={status}>{t(`overview.${status}`)}</StatusPill>
    </PageHeading>

    <section className={`overview-next-action overview-next-action--${status}`} aria-labelledby="overview-next-action-title">
      <div><span className="overview-section-kicker">{t('overview.nextKicker')}</span><h2 id="overview-next-action-title">{t('overview.nextTitle')}</h2><p>{nextAction.detail}</p></div>
      <button className="button primary" onClick={nextAction.onClick}>{nextAction.label}<ArrowRight size={15} /></button>
    </section>

    <div className="overview-action-grid">
      <button className="overview-action-card overview-action-card--issues" onClick={navigateToIssues}>
        <span className="overview-action-icon"><AlertTriangle size={18} /></span><span><strong>{t('overview.actionable')}</strong><small>{summary.high ? t('overview.high', { count: summary.high }) : t('overview.actionableDetail')}</small></span><b>{actionableIssues.length}</b><ArrowRight size={15} />
      </button>
      <button className="overview-action-card overview-action-card--context" onClick={navigateToContext}>
        <span className="overview-action-icon"><BarChart3 size={18} /></span><span><strong>{t('overview.fixedContext')}</strong><small>{fixedTokens === undefined ? t('overview.contextUnavailable') : t('overview.fixedDetail', { activation: fmtTokens(activationTokens), unknown: unknownCount ?? 0 })}</small></span><b>{fmtTokens(fixedTokens)}</b><ArrowRight size={15} />
      </button>
      <button className="overview-action-card overview-action-card--optimization" onClick={navigateToOptimization}>
        <span className="overview-action-icon"><Sparkles size={18} /></span><span><strong>{t('overview.optimization')}</strong><small>{optimizationCount === undefined ? t('overview.optimizationUnavailable') : t('overview.optimizationDetail')}</small></span><b>{optimizationCount === undefined ? '—' : optimizationCount}</b><ArrowRight size={15} />
      </button>
    </div>

    {actionableIssues.length > 0
      ? <section className="panel overview-priority"><div className="panel-heading"><div><h3>{t('overview.priorityTitle')}</h3><p>{t('overview.priorityDetail')}</p></div><button className="text-button" onClick={navigateToIssues}>{t('overview.viewAll')}<ArrowRight size={15} /></button></div><div className="priority-list">{actionableIssues.slice(0, 3).map((issue) => <IssueCard key={issue.id} issue={issue} open={() => openIssue(issue)} />)}</div></section>
      : <div className="clean-state"><span><ShieldCheck size={30} /></span><div><h3>{t('overview.cleanTitle')}</h3><p>{t('overview.cleanDetail')}</p></div></div>}

    <div className="overview-grid">
      <section className="panel">
        <div className="panel-heading">
          <div><h3>{t('overview.platformCoverage')}</h3><p>{t('overview.platformDetail')}</p></div>
          <button className="text-button" onClick={navigateToResources}>{t('overview.viewAll')}<ArrowRight size={15} /></button>
        </div>
        <div className="platform-list">
          {Object.entries(summary.platforms).map(([platform, count]) => <div key={platform} className="platform-row">
            <PlatformIcon platform={platform} /><span>{platformLabel(platform)}</span><div className="mini-bar"><span style={{ width: `${summary.resources ? Math.max(8, Number(count) / summary.resources * 100) : 0}%` }} /></div><strong>{count}</strong>
          </div>)}
        </div>
      </section>
      <section className="panel">
        <div className="panel-heading"><div><h3>{t('overview.groups')}</h3><p>{t('overview.groupsDetail')}</p></div></div>
        <div className="group-list">
          {snapshot.groups?.groups.slice(0, 4).map((group) => <div className="group-row" key={group.label}>
            <span>{group.label || t('overview.related')}</span><div>{group.skills.slice(0, 3).map((skill) => <code key={skill.sourcePath}>{skill.name}</code>)}</div><strong>{group.skills.length}</strong>
          </div>)}
          {!snapshot.groups?.groups.length && <p className="muted empty-copy">{t('overview.noGroups')}</p>}
        </div>
      </section>
    </div>
  </section>;
}
