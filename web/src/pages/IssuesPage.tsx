import { ArrowRight, Check } from 'lucide-react';
import { useMemo, useState } from 'react';
import type { DoctorSnapshot, UiIssue } from '../../../src/application/types';
import { EmptyRows, FilterBar, PageHeading, SeverityBadge, kindLabel } from '../components/ui';

export function IssuesPage({ snapshot, openIssue }: { snapshot: DoctorSnapshot | null; openIssue: (issue: UiIssue) => void }) {
  const [query, setQuery] = useState(''); const [kind, setKind] = useState('all'); const [severity, setSeverity] = useState('all');
  const issues = useMemo(() => (snapshot?.issues ?? []).filter((issue) => {
    const haystack = `${issue.title} ${issue.summary} ${issue.resourceNames.join(' ')}`.toLowerCase();
    return (!query || haystack.includes(query.toLowerCase())) && (kind === 'all' || issue.kind === kind) && (severity === 'all' || issue.severity === severity);
  }), [snapshot, query, kind, severity]);
  return <section><PageHeading title="待处理" subtitle="安全、冲突、重复和成本问题统一排序。"><span className="result-count">{issues.length} 项</span></PageHeading>
    <FilterBar query={query} setQuery={setQuery} placeholder="搜索问题或资源">
      <select value={kind} onChange={(event) => setKind(event.target.value)}><option value="all">全部类型</option><option value="security">安全</option><option value="conflict">冲突</option><option value="duplicate">重复</option><option value="context">成本</option></select>
      <select value={severity} onChange={(event) => setSeverity(event.target.value)}><option value="all">全部等级</option><option value="high">高风险</option><option value="med">中风险</option><option value="low">低风险</option><option value="info">提示</option></select>
    </FilterBar>
    <div className="issue-table"><div className="table-head issues"><span>问题</span><span>类型</span><span>等级</span><span>资源</span><span /></div>
      {issues.map((issue) => <button className="table-row issues" key={issue.id} onClick={() => openIssue(issue)}><span><strong>{issue.title}</strong><small>{issue.summary}</small></span><span>{kindLabel(issue.kind)}</span><span><SeverityBadge severity={issue.severity} /></span><span>{issue.resourceNames.slice(0, 2).join('、')}</span><ArrowRight size={16} /></button>)}
      {issues.length === 0 && <EmptyRows icon={Check} title="没有匹配的问题" />}
    </div>
  </section>;
}
