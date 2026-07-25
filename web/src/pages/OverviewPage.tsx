import { Activity, AlertTriangle, ArrowRight, BarChart3, Coins, Copy, Database, FileCode2, GitMerge, Play, ShieldAlert, ShieldCheck } from 'lucide-react';
import type { DoctorSnapshot, UiIssue } from '../../../src/application/types';
import { IssueCard, PageHeading, PlatformIcon, StatCard, StatusPill, platformLabel } from '../components/ui';
import { useTranslation } from '../i18n';

type HealthStatus = 'success' | 'warning' | 'danger';

function healthScore(snapshot: DoctorSnapshot): number {
  const s = snapshot.summary;
  const penalty = s.high * 25 + s.medium * 10 + s.low * 4;
  const incompletePenalty = snapshot.status === 'partial' ? 10 : 0;
  const warningPenalty = Math.min(15, snapshot.warnings.length * 3);
  return Math.max(0, Math.min(100, 100 - penalty - incompletePenalty - warningPenalty));
}
function healthStatus(snapshot: DoctorSnapshot, score: number): HealthStatus {
  if (score < 50) return 'danger';
  if (snapshot.status === 'partial' || snapshot.warnings.length > 0) return 'warning';
  if (score >= 80) return 'success';
  return 'warning';
}
function fmtTokens(n: number): string {
  if (n >= 1000) return (n / 1000).toFixed(n >= 10000 ? 0 : 1) + 'k';
  return String(n);
}
function fmtTime(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleString();
}

function HealthRing({ score, status }: { score: number; status: HealthStatus }) {
  const r = 52;
  const c = 2 * Math.PI * r;
  const offset = c * (1 - score / 100);
  return (
    <svg className={`mc-ring mc-ring--${status}`} viewBox="0 0 120 120" width="148" height="148" role="img" aria-label={`health score ${score} of 100`}>
      <circle className="mc-ring-track" cx="60" cy="60" r={r} fill="none" strokeWidth="11" />
      <circle className="mc-ring-fill" cx="60" cy="60" r={r} fill="none" strokeWidth="11" strokeLinecap="round"
        strokeDasharray={c} strokeDashoffset={offset} transform="rotate(-90 60 60)" />
      <text className="mc-ring-score" x="60" y="58" textAnchor="middle">{score}</text>
      <text className="mc-ring-max" x="60" y="78" textAnchor="middle">/ 100</text>
    </svg>
  );
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

export function OverviewPage({ snapshot, scan, runScan, openIssue, navigateToResources, navigateToIssues, navigateToContext }: {
  snapshot: DoctorSnapshot | null;
  scan: { running: boolean };
  runScan: () => void;
  openIssue: (issue: UiIssue) => void;
  navigateToResources: () => void;
  navigateToIssues: () => void;
  navigateToContext: () => void;
}) {
  const { t } = useTranslation();
  if (!snapshot) return <EmptyOverview running={scan.running} runScan={runScan} />;

  const s = snapshot.summary;
  const score = healthScore(snapshot);
  const status = healthStatus(snapshot, score);
  const incomplete = snapshot.status === 'partial' || snapshot.warnings.length > 0;
  const priority = snapshot.issues.slice(0, 3);
  const contextTokens = (s.fixedTokens || 0) + (s.activationTokens || 0);
  const totalIssues = Math.max(1, s.issues);

  const quadrants = [
    {
      key: 'security', icon: ShieldAlert, label: t('overview.quadrant.security'), count: s.security,
      detail: t('overview.quadrant.detail.security', { count: s.security }),
      status: (s.security ? (s.high ? 'danger' : 'warning') : 'success') as HealthStatus, pct: s.security / totalIssues,
      onClick: navigateToIssues, isCost: false,
    },
    {
      key: 'conflicts', icon: GitMerge, label: t('overview.quadrant.conflicts'), count: s.conflicts,
      detail: t('overview.quadrant.detail.conflicts', { count: s.conflicts }),
      status: (s.conflicts ? 'warning' : 'success') as HealthStatus, pct: s.conflicts / totalIssues,
      onClick: navigateToIssues, isCost: false,
    },
    {
      key: 'duplicates', icon: Copy, label: t('overview.quadrant.duplicates'), count: s.duplicates,
      detail: t('overview.quadrant.detail.duplicates', { count: s.duplicates }),
      status: (s.duplicates ? 'warning' : 'success') as HealthStatus, pct: s.duplicates / totalIssues,
      onClick: navigateToIssues, isCost: false,
    },
    {
      key: 'context', icon: Coins, label: t('overview.quadrant.context'), count: contextTokens,
      detail: t('overview.quadrant.detail.context'),
      status: 'info' as HealthStatus, pct: 1, onClick: navigateToContext, isCost: true,
    },
  ];

  return <section>
    <PageHeading title={snapshot.summary.issues ? t('overview.priority', { count: Math.min(3, snapshot.summary.issues) }) : incomplete ? t('overview.incomplete') : t('overview.good')}
      subtitle={snapshot.summary.issues ? t('overview.priorityDetail') : incomplete ? t('overview.incompleteDetail', { count: snapshot.warnings.length }) : t('overview.goodDetail')}>
      <StatusPill kind={status}>{t(`overview.${status}`)}</StatusPill>
    </PageHeading>

    <div className="mc-hero">
      <div className={`mc-health mc-health--${status}`}>
        <HealthRing score={score} status={status} />
        <div className="mc-health-meta">
          <span className="mc-health-label">{t('overview.health')}</span>
          <strong className={`mc-health-status mc-status--${status}`}>{t(`overview.${status}`)}</strong>
          <span className="mc-health-time">{t('overview.lastScan')} {fmtTime(snapshot.generatedAt)}</span>
        </div>
      </div>
      <div className="mc-metrics">
        <StatCard label={t('overview.resources')} value={s.resources} detail={t('overview.platforms', { count: Object.keys(s.platforms).length })} />
        <StatCard label={t('overview.security')} value={s.security} detail={s.high ? t('overview.high', { count: s.high }) : t('overview.noHigh')} />
        <StatCard label={t('overview.conflicts')} value={s.conflicts} detail={t('overview.ofTotal', { count: Math.round(s.conflicts / totalIssues * 100) })} />
        <StatCard label={t('overview.duplicates')} value={s.duplicates} detail={t('overview.ofTotal', { count: Math.round(s.duplicates / totalIssues * 100) })} />
      </div>
    </div>

    <div className="mc-quadrants">
      {quadrants.map((q) => {
        const Icon = q.icon;
        return <button key={q.key} className={`mc-quadrant mc-quadrant--${q.status}`} onClick={q.onClick}>
          <div className="mc-quadrant-top">
            <span className="mc-quadrant-icon"><Icon size={18} /></span>
            <span className="mc-quadrant-label">{q.label}</span>
            <ArrowRight size={15} className="mc-quadrant-arrow" />
          </div>
          <strong className="mc-quadrant-count">{q.isCost ? fmtTokens(q.count) : q.count}</strong>
          <span className="mc-quadrant-detail">{q.detail}</span>
          {!q.isCost && <div className="mc-quadrant-bar"><span style={{ width: `${Math.min(100, q.pct * 100)}%` }} /></div>}
        </button>;
      })}
    </div>

    <div className="mc-bottom">
      <section className="panel">
        <div className="panel-heading">
          <div><h3>{t('overview.platformCoverage')}</h3><p>{t('overview.platformDetail')}</p></div>
          <button className="text-button" onClick={navigateToResources}>{t('overview.viewAll')}<ArrowRight size={15} /></button>
        </div>
        <div className="platform-list">
          {Object.entries(snapshot.summary.platforms).map(([platform, count]) =>
            <div key={platform} className="platform-row">
              <PlatformIcon platform={platform} /><span>{platformLabel(platform)}</span>
              <div className="mini-bar"><span style={{ width: `${Math.max(8, Number(count) / snapshot.summary.resources * 100)}%` }} /></div>
              <strong>{count}</strong>
            </div>)}
        </div>
      </section>
      <section className="panel">
        <div className="panel-heading"><div><h3>{t('overview.groups')}</h3><p>{t('overview.groupsDetail')}</p></div></div>
        <div className="group-list">
          {snapshot.groups?.groups.slice(0, 4).map((group) =>
            <div className="group-row" key={group.label}>
              <span>{group.label || t('overview.related')}</span>
              <div>{group.skills.slice(0, 3).map((skill) => <code key={skill.sourcePath}>{skill.name}</code>)}</div>
              <strong>{group.skills.length}</strong>
            </div>)}
          {!snapshot.groups?.groups.length && <p className="muted empty-copy">{t('overview.noGroups')}</p>}
        </div>
      </section>
    </div>

    {priority.length > 0
      ? <div className="priority-list">{priority.map((issue) => <IssueCard key={issue.id} issue={issue} open={() => openIssue(issue)} />)}</div>
      : <div className="clean-state"><span><ShieldCheck size={30} /></span><div><h3>{t('overview.cleanTitle')}</h3><p>{t('overview.cleanDetail')}</p></div></div>}
  </section>;
}
