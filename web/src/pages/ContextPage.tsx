import { BarChart3 } from 'lucide-react';
import { useState } from 'react';
import type { DoctorSnapshot, UiResource } from '../../../src/application/types';
import type { ContextCostItem } from '../../../src/types/context';
import { EmptyRows, PageHeading, StatCard, StatusPill, activationLabel } from '../components/ui';
import { useTranslation } from '../i18n';

export function ContextPage({ snapshot, openResource, onToggle }: { snapshot: DoctorSnapshot | null; openResource: (resource: UiResource) => void; onToggle: (item: ContextCostItem) => Promise<void> }) {
  const { t } = useTranslation();
  const [showDisabled, setShowDisabled] = useState(false);
  const context = snapshot?.context;
  const items = showDisabled ? [...(context?.items ?? []), ...(context?.disabledItems ?? [])] : context?.items ?? [];
  const max = Math.max(1, ...items.map((item) => Math.max(item.estimatedTokens, item.activationEstimatedTokens)));
  return <section><PageHeading title={t('context.title')} subtitle={t('context.subtitle')}><StatusPill kind={context?.summary.overBudget ? 'danger' : 'success'}>{context?.summary.overBudget ? t('context.overBudget') : t('context.withinBudget')}</StatusPill></PageHeading>
    <div className="stat-grid context-stats"><StatCard label={t('context.fixed')} value={snapshot?.summary.fixedTokens ?? 0} detail="tokens" /><StatCard label={t('context.activation')} value={snapshot?.summary.activationTokens ?? 0} detail="tokens" /><StatCard label={t('context.budget')} value={context?.summary.budgetTokens ?? 2000} detail={t('context.grade', { grade: context?.summary.grade ?? '—' })} /></div>
    <div className="section-toolbar"><div><strong>{t('context.details')}</strong><span>{context?.summary.tokenizer.model ?? context?.summary.tokenizer.mode ?? 'openai'}</span></div><label className="switch-label"><input type="checkbox" checked={showDisabled} onChange={(event) => setShowDisabled(event.target.checked)} /><span />{t('context.showDisabled')}</label></div>
    <div className="cost-list">{items.map((item) => {
      const resource = snapshot?.resources.find((entry) => entry.sourcePath === item.sourcePath && entry.name === item.name) ?? snapshot?.resources.find((entry) => entry.id === item.id);
      const cost = item.budgetScope === 'activation' ? item.activationEstimatedTokens : item.estimatedTokens;
      return <div className={`cost-row ${item.enabled === false ? 'disabled' : ''}`} key={`${item.id ?? item.sourcePath}:${item.enabled}`}>
        <button className="resource-link" onClick={() => resource && openResource(resource)}><code>{item.name}</code><small>{item.platform} · {activationLabel(item.activation)}</small></button>
        <div className="cost-bar"><span style={{ width: `${Math.max(2, cost / max * 100)}%` }} /></div><strong>{cost}</strong><span className="cost-unit">tokens</span>
        {item.controllable ? <button className="button compact" onClick={() => void onToggle(item)}>{item.enabled === false ? t('context.enable') : t('context.disable')}</button> : <span className="muted">{item.estimateStatus === 'unknown' ? t('context.unknown') : t('context.readonly')}</span>}
      </div>;
    })}{!items.length && <EmptyRows icon={BarChart3} title={t('context.empty')} />}</div>
  </section>;
}
