import { ArrowRight, ShieldCheck } from 'lucide-react';
import type { DoctorSnapshot, UiIssue } from '../../../src/application/types';
import { IssueCard, PageHeading, PlatformIcon, ScanningEmpty, StatCard, StatusPill, platformLabel } from '../components/ui';
import { useTranslation } from '../i18n';

export function OverviewPage({ snapshot, scan, openIssue, navigateToResources }: { snapshot: DoctorSnapshot | null; scan: { running: boolean }; openIssue: (issue: UiIssue) => void; navigateToResources: () => void }) {
  const { t } = useTranslation();
  if (!snapshot) return <ScanningEmpty running={scan.running} />;
  const priority = snapshot.issues.slice(0, 3);
  return <section>
    <PageHeading title={snapshot.summary.issues ? t('overview.priority', { count: Math.min(3, snapshot.summary.issues) }) : t('overview.good')} subtitle={snapshot.summary.issues ? t('overview.priorityDetail') : t('overview.goodDetail')}>
      <StatusPill kind={snapshot.summary.high ? 'danger' : snapshot.summary.issues ? 'warning' : 'success'}>{snapshot.summary.issues ? t('overview.pending', { count: snapshot.summary.issues }) : t('overview.noIssues')}</StatusPill>
    </PageHeading>
    {priority.length > 0 ? <div className="priority-list">{priority.map((issue) => <IssueCard key={issue.id} issue={issue} open={() => openIssue(issue)} />)}</div>
      : <div className="clean-state"><span><ShieldCheck size={30} /></span><div><h3>{t('overview.cleanTitle')}</h3><p>{t('overview.cleanDetail')}</p></div></div>}
    <div className="stat-grid">
      <StatCard label={t('overview.resources')} value={snapshot.summary.resources} detail={t('overview.platforms', { count: Object.keys(snapshot.summary.platforms).length })} />
      <StatCard label={t('overview.security')} value={snapshot.summary.security} detail={snapshot.summary.high ? t('overview.high', { count: snapshot.summary.high }) : t('overview.noHigh')} />
      <StatCard label={t('overview.fixed')} value={snapshot.summary.fixedTokens} detail={t('overview.perTurn')} />
      <StatCard label={t('overview.activation')} value={snapshot.summary.activationTokens} detail="tokens" />
    </div>
    <div className="overview-grid">
      <section className="panel"><div className="panel-heading"><div><h3>{t('overview.platformCoverage')}</h3><p>{t('overview.platformDetail')}</p></div><button className="text-button" onClick={navigateToResources}>{t('overview.viewAll')}<ArrowRight size={15} /></button></div>
        <div className="platform-list">{Object.entries(snapshot.summary.platforms).map(([platform, count]) => <div key={platform} className="platform-row"><PlatformIcon platform={platform} /><span>{platformLabel(platform)}</span><div className="mini-bar"><span style={{ width: `${Math.max(8, Number(count) / snapshot.summary.resources * 100)}%` }} /></div><strong>{count}</strong></div>)}</div>
      </section>
      <section className="panel"><div className="panel-heading"><div><h3>{t('overview.groups')}</h3><p>{t('overview.groupsDetail')}</p></div></div>
        <div className="group-list">{snapshot.groups?.groups.slice(0, 4).map((group) => <div className="group-row" key={group.label}><span>{group.label || t('overview.related')}</span><div>{group.skills.slice(0, 3).map((skill) => <code key={skill.sourcePath}>{skill.name}</code>)}</div><strong>{group.skills.length}</strong></div>)}
          {!snapshot.groups?.groups.length && <p className="muted empty-copy">{t('overview.noGroups')}</p>}</div>
      </section>
    </div>
  </section>;
}
