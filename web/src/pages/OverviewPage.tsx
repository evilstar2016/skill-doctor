import { ArrowRight, ShieldCheck } from 'lucide-react';
import type { DoctorSnapshot, UiIssue } from '../../../src/application/types';
import { IssueCard, PageHeading, PlatformIcon, ScanningEmpty, StatCard, StatusPill, platformLabel } from '../components/ui';

export function OverviewPage({ snapshot, scan, openIssue, navigateToResources }: { snapshot: DoctorSnapshot | null; scan: { running: boolean }; openIssue: (issue: UiIssue) => void; navigateToResources: () => void }) {
  if (!snapshot) return <ScanningEmpty running={scan.running} />;
  const priority = snapshot.issues.slice(0, 3);
  return <section>
    <PageHeading title={snapshot.summary.issues ? `先处理这 ${Math.min(3, snapshot.summary.issues)} 件事` : '配置状态良好'} subtitle={snapshot.summary.issues ? '已按风险和影响排序，逐项处理后重新体检。' : '没有发现高风险、安全冲突或重复安装。'}>
      <StatusPill kind={snapshot.summary.high ? 'danger' : snapshot.summary.issues ? 'warning' : 'success'}>{snapshot.summary.issues ? `${snapshot.summary.issues} 项待处理` : '未发现问题'}</StatusPill>
    </PageHeading>
    {priority.length > 0 ? <div className="priority-list">{priority.map((issue) => <IssueCard key={issue.id} issue={issue} open={() => openIssue(issue)} />)}</div>
      : <div className="clean-state"><span><ShieldCheck size={30} /></span><div><h3>当前扫描范围内未发现明显问题</h3><p>仍建议在新增 skill、MCP 或 Agent 配置后重新体检。</p></div></div>}
    <div className="stat-grid">
      <StatCard label="发现资源" value={snapshot.summary.resources} detail={`${Object.keys(snapshot.summary.platforms).length} 个平台`} />
      <StatCard label="安全提示" value={snapshot.summary.security} detail={snapshot.summary.high ? `${snapshot.summary.high} 个高优先级问题` : '无高风险'} />
      <StatCard label="固定成本" value={snapshot.summary.fixedTokens} detail="tokens / 轮" />
      <StatCard label="按需激活" value={snapshot.summary.activationTokens} detail="tokens" />
    </div>
    <div className="overview-grid">
      <section className="panel"><div className="panel-heading"><div><h3>平台覆盖</h3><p>当前范围内实际发现的资源</p></div><button className="text-button" onClick={navigateToResources}>查看全部<ArrowRight size={15} /></button></div>
        <div className="platform-list">{Object.entries(snapshot.summary.platforms).map(([platform, count]) => <div key={platform} className="platform-row"><PlatformIcon platform={platform} /><span>{platformLabel(platform)}</span><div className="mini-bar"><span style={{ width: `${Math.max(8, Number(count) / snapshot.summary.resources * 100)}%` }} /></div><strong>{count}</strong></div>)}</div>
      </section>
      <section className="panel"><div className="panel-heading"><div><h3>资源分组</h3><p>按用途聚合相似配置</p></div></div>
        <div className="group-list">{snapshot.groups?.groups.slice(0, 4).map((group) => <div className="group-row" key={group.label}><span>{group.label || '相关资源'}</span><div>{group.skills.slice(0, 3).map((skill) => <code key={skill.sourcePath}>{skill.name}</code>)}</div><strong>{group.skills.length}</strong></div>)}
          {!snapshot.groups?.groups.length && <p className="muted empty-copy">没有需要聚合的相似资源。</p>}</div>
      </section>
    </div>
  </section>;
}
