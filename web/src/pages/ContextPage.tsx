import { BarChart3 } from 'lucide-react';
import { useState } from 'react';
import type { DoctorSnapshot, UiResource } from '../../../src/application/types';
import type { ContextCostItem } from '../../../src/types/context';
import { EmptyRows, PageHeading, StatCard, StatusPill, activationLabel } from '../components/ui';

export function ContextPage({ snapshot, openResource, onToggle }: { snapshot: DoctorSnapshot | null; openResource: (resource: UiResource) => void; onToggle: (item: ContextCostItem) => Promise<void> }) {
  const [showDisabled, setShowDisabled] = useState(false);
  const context = snapshot?.context;
  const items = showDisabled ? [...(context?.items ?? []), ...(context?.disabledItems ?? [])] : context?.items ?? [];
  const max = Math.max(1, ...items.map((item) => Math.max(item.estimatedTokens, item.activationEstimatedTokens)));
  return <section><PageHeading title="上下文成本" subtitle="固定成本与按需激活成本分开计算，避免误判。"><StatusPill kind={context?.summary.overBudget ? 'danger' : 'success'}>{context?.summary.overBudget ? '超过预算' : '预算内'}</StatusPill></PageHeading>
    <div className="stat-grid context-stats"><StatCard label="每轮固定成本" value={snapshot?.summary.fixedTokens ?? 0} detail="tokens" /><StatCard label="按需激活成本" value={snapshot?.summary.activationTokens ?? 0} detail="tokens" /><StatCard label="预算" value={context?.summary.budgetTokens ?? 2000} detail={`评级 ${context?.summary.grade ?? '—'}`} /></div>
    <div className="section-toolbar"><div><strong>资源成本明细</strong><span>{context?.summary.tokenizer.model ?? context?.summary.tokenizer.mode ?? 'openai'}</span></div><label className="switch-label"><input type="checkbox" checked={showDisabled} onChange={(event) => setShowDisabled(event.target.checked)} /><span />显示已禁用</label></div>
    <div className="cost-list">{items.map((item) => {
      const resource = snapshot?.resources.find((entry) => entry.sourcePath === item.sourcePath && entry.name === item.name) ?? snapshot?.resources.find((entry) => entry.id === item.id);
      const cost = item.budgetScope === 'activation' ? item.activationEstimatedTokens : item.estimatedTokens;
      return <div className={`cost-row ${item.enabled === false ? 'disabled' : ''}`} key={`${item.id ?? item.sourcePath}:${item.enabled}`}>
        <button className="resource-link" onClick={() => resource && openResource(resource)}><code>{item.name}</code><small>{item.platform} · {activationLabel(item.activation)}</small></button>
        <div className="cost-bar"><span style={{ width: `${Math.max(2, cost / max * 100)}%` }} /></div><strong>{cost}</strong><span className="cost-unit">tokens</span>
        {item.controllable ? <button className="button compact" onClick={() => void onToggle(item)}>{item.enabled === false ? '启用' : '禁用'}</button> : <span className="muted">{item.estimateStatus === 'unknown' ? '未知' : '只读'}</span>}
      </div>;
    })}{!items.length && <EmptyRows icon={BarChart3} title="没有可计算的上下文资源" />}</div>
  </section>;
}
