import { ArrowRight, Search } from 'lucide-react';
import { useMemo, useState } from 'react';
import type { DoctorSnapshot, UiResource } from '../../../src/application/types';
import { EmptyRows, FilterBar, PageHeading, ResourceStatus, platformLabel, resourceKindLabel, scopeLabel, shortPath } from '../components/ui';

export function ResourcesPage({ snapshot, openResource }: { snapshot: DoctorSnapshot | null; openResource: (resource: UiResource) => void }) {
  const [query, setQuery] = useState(''); const [kind, setKind] = useState('all'); const [platform, setPlatform] = useState('all'); const [scope, setScope] = useState('all');
  const resources = useMemo(() => (snapshot?.resources ?? []).filter((resource) => {
    const text = `${resource.name} ${resource.sourcePath} ${resource.description ?? ''} ${resource.triggers.join(' ')}`.toLowerCase();
    return (!query || text.includes(query.toLowerCase())) && (kind === 'all' || resource.kind === kind) && (platform === 'all' || resource.consumers.some((consumer) => consumer.platform === platform)) && (scope === 'all' || resource.consumers.some((consumer) => consumer.scope === scope));
  }), [snapshot, query, kind, platform, scope]);
  const platforms = Object.keys(snapshot?.summary.platforms ?? {});
  return <section><PageHeading title="资源清单" subtitle="统一查看 skills、rules、instructions、MCP、plugins 与 memories。"><span className="result-count">{resources.length} 个资源</span></PageHeading>
    <FilterBar query={query} setQuery={setQuery} placeholder="查找资源、路径或触发词">
      <select value={kind} onChange={(event) => setKind(event.target.value)}><option value="all">全部类型</option>{['skill', 'instruction', 'rule', 'prompt', 'agents', 'mcp', 'plugin', 'memory'].map((value) => <option key={value} value={value}>{resourceKindLabel(value)}</option>)}</select>
      <select value={platform} onChange={(event) => setPlatform(event.target.value)}><option value="all">全部平台</option>{platforms.map((value) => <option key={value}>{value}</option>)}</select>
      <select value={scope} onChange={(event) => setScope(event.target.value)}><option value="all">全部范围</option><option value="project">项目</option><option value="global">全局</option></select>
    </FilterBar>
    <div className="resource-table"><div className="table-head resources"><span>名称</span><span>类型</span><span>平台</span><span>范围</span><span>状态</span><span /></div>
      {resources.map((resource) => <button className="table-row resources" key={resource.id} onClick={() => openResource(resource)}><span><span className="resource-name"><code>{resource.name}</code>{resource.shared && <span className="shared-badge">共享 · {resource.consumers.length} Agent</span>}</span><small>{shortPath(resource.sourcePath)}</small></span><span>{resource.kindLabel}</span><span>{[...new Set(resource.consumers.map((consumer) => platformLabel(consumer.platform)))].join('、')}</span><span>{[...new Set(resource.consumers.map((consumer) => scopeLabel(consumer.scope)))].join('、')}</span><span><ResourceStatus status={resource.status} count={resource.issueIds.length} /></span><ArrowRight size={16} /></button>)}
      {!resources.length && <EmptyRows icon={Search} title="没有匹配的资源" />}
    </div>
  </section>;
}
