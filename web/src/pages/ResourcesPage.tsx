import { ArrowRight, Search } from 'lucide-react';
import { useMemo, useState } from 'react';
import type { DoctorSnapshot, UiResource } from '../../../src/application/types';
import { EmptyRows, FilterBar, PageHeading, ResourceStatus, platformLabel, resourceKindLabel, scopeLabel, shortPath } from '../components/ui';
import { useTranslation } from '../i18n';

export function ResourcesPage({ snapshot, openResource }: { snapshot: DoctorSnapshot | null; openResource: (resource: UiResource) => void }) {
  const { t } = useTranslation();
  const [query, setQuery] = useState(''); const [kind, setKind] = useState('all'); const [platform, setPlatform] = useState('all'); const [scope, setScope] = useState('all');
  const resources = useMemo(() => (snapshot?.resources ?? []).filter((resource) => {
    const text = `${resource.name} ${resource.sourcePath} ${resource.description ?? ''} ${resource.triggers.join(' ')}`.toLowerCase();
    return (!query || text.includes(query.toLowerCase())) && (kind === 'all' || resource.kind === kind) && (platform === 'all' || resource.consumers.some((consumer) => consumer.platform === platform)) && (scope === 'all' || resource.consumers.some((consumer) => consumer.scope === scope));
  }), [snapshot, query, kind, platform, scope]);
  const platforms = Object.keys(snapshot?.summary.platforms ?? {});
  return <section><PageHeading title={t('resources.title')} subtitle={t('resources.subtitle')}><span className="result-count">{t('resources.count', { count: resources.length })}</span></PageHeading>
    <FilterBar query={query} setQuery={setQuery} placeholder={t('resources.search')}>
      <select value={kind} onChange={(event) => setKind(event.target.value)}><option value="all">{t('resources.allTypes')}</option>{['skill', 'instruction', 'rule', 'prompt', 'agents', 'mcp', 'plugin', 'memory'].map((value) => <option key={value} value={value}>{resourceKindLabel(value)}</option>)}</select>
      <select value={platform} onChange={(event) => setPlatform(event.target.value)}><option value="all">{t('resources.allPlatforms')}</option>{platforms.map((value) => <option key={value}>{value}</option>)}</select>
      <select value={scope} onChange={(event) => setScope(event.target.value)}><option value="all">{t('resources.allScopes')}</option><option value="project">{t('label.project')}</option><option value="global">{t('label.global')}</option></select>
    </FilterBar>
    <div className="resource-table"><div className="table-head resources"><span>{t('resources.name')}</span><span>{t('resources.type')}</span><span>{t('resources.platform')}</span><span>{t('resources.scope')}</span><span>{t('resources.status')}</span><span /></div>
      {resources.map((resource) => <button className="table-row resources" key={resource.id} onClick={() => openResource(resource)}><span><span className="resource-name"><code>{resource.name}</code>{resource.shared && <span className="shared-badge">{t('resources.shared', { count: resource.consumers.length })}</span>}</span><small>{shortPath(resource.sourcePath)}</small></span><span>{resource.kindLabel}</span><span>{[...new Set(resource.consumers.map((consumer) => platformLabel(consumer.platform)))].join('、')}</span><span>{[...new Set(resource.consumers.map((consumer) => scopeLabel(consumer.scope, t)))].join('、')}</span><span><ResourceStatus status={resource.status} count={resource.issueIds.length} /></span><ArrowRight size={16} /></button>)}
      {!resources.length && <EmptyRows icon={Search} title={t('resources.empty')} />}
    </div>
  </section>;
}
