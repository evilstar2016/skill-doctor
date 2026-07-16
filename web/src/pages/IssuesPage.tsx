import { ArrowRight, Check } from 'lucide-react';
import { useMemo, useState } from 'react';
import type { DoctorSnapshot, UiIssue } from '../../../src/application/types';
import { EmptyRows, FilterBar, PageHeading, SeverityBadge, kindLabel, translateResultText } from '../components/ui';
import { useTranslation } from '../i18n';

export function IssuesPage({ snapshot, openIssue }: { snapshot: DoctorSnapshot | null; openIssue: (issue: UiIssue) => void }) {
  const { t } = useTranslation();
  const [query, setQuery] = useState(''); const [kind, setKind] = useState('all'); const [severity, setSeverity] = useState('all');
  const issues = useMemo(() => (snapshot?.issues ?? []).filter((issue) => {
    const haystack = `${issue.title} ${issue.summary} ${issue.resourceNames.join(' ')}`.toLowerCase();
    return (!query || haystack.includes(query.toLowerCase())) && (kind === 'all' || issue.kind === kind) && (severity === 'all' || issue.severity === severity);
  }), [snapshot, query, kind, severity]);
  return <section><PageHeading title={t('issues.title')} subtitle={t('issues.subtitle')}><span className="result-count">{t('issues.count', { count: issues.length })}</span></PageHeading>
    <FilterBar query={query} setQuery={setQuery} placeholder={t('issues.search')}>
      <select value={kind} onChange={(event) => setKind(event.target.value)}><option value="all">{t('issues.allTypes')}</option><option value="security">{t('label.security')}</option><option value="conflict">{t('label.conflict')}</option><option value="duplicate">{t('label.duplicate')}</option><option value="context">{t('label.context')}</option></select>
      <select value={severity} onChange={(event) => setSeverity(event.target.value)}><option value="all">{t('issues.allLevels')}</option><option value="high">{t('label.high')}</option><option value="med">{t('label.medium')}</option><option value="low">{t('label.low')}</option><option value="info">{t('label.info')}</option></select>
    </FilterBar>
    <div className="issue-table"><div className="table-head issues"><span>{t('issues.problem')}</span><span>{t('issues.type')}</span><span>{t('issues.level')}</span><span>{t('issues.resource')}</span><span /></div>
      {issues.map((issue) => <button className="table-row issues" key={issue.id} onClick={() => openIssue(issue)}><span><strong>{translateResultText(issue.title, t)}</strong><small>{translateResultText(issue.summary, t)}</small></span><span>{kindLabel(issue.kind, t)}</span><span><SeverityBadge severity={issue.severity} /></span><span>{issue.resourceNames.slice(0, 2).join('、')}</span><ArrowRight size={16} /></button>)}
      {issues.length === 0 && <EmptyRows icon={Check} title={t('issues.empty')} />}
    </div>
  </section>;
}
