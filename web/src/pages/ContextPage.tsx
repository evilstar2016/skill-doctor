import { BarChart3 } from 'lucide-react';
import { useState } from 'react';
import type { DoctorSnapshot, UiResource } from '../../../src/application/types';
import type { ContextCostItem } from '../../../src/types/context';
import { EmptyRows, PageHeading, StatCard, StatusPill, activationLabel } from '../components/ui';
import { useTranslation } from '../i18n';

function hasKnownEstimate(item: ContextCostItem): boolean {
  return item.estimateStatus !== 'unknown' && item.estimateStatus !== 'unsupported';
}

function controlStatusLabel(item: ContextCostItem, t: ReturnType<typeof useTranslation>['t']): string | undefined {
  switch (item.controlStatus) {
    case 'configured': return t('context.controlConfigured');
    case 'runtime-verified': return t('context.controlVerified');
    case 'host-overridden': return t('context.controlOverridden');
    case 'not-controllable': return t('context.controlNotControllable');
    default: return undefined;
  }
}

export function ContextPage({ snapshot, openResource, onToggle, active = true }: { snapshot: DoctorSnapshot | null; openResource: (resource: UiResource) => void; onToggle: (item: ContextCostItem) => Promise<void>; active?: boolean }) {
  const { t } = useTranslation();
  const [showDisabled, setShowDisabled] = useState(false);
  const context = snapshot?.context;
  const items = showDisabled ? [...(context?.items ?? []), ...(context?.disabledItems ?? [])] : context?.items ?? [];
  const knownItems = items.filter(hasKnownEstimate);
  const max = Math.max(1, ...knownItems.map((item) => Math.max(item.estimatedTokens, item.activationEstimatedTokens)));
  const unknownCount = context ? items.filter((item) => !hasKnownEstimate(item)).length : undefined;
  const contextHasUnknown = unknownCount !== undefined && unknownCount > 0;
  if (!active) return null;
  return <section className="context-page"><PageHeading title={t('context.title')} subtitle={t('context.subtitle')}><StatusPill kind={!context ? 'warning' : context.summary.overBudget ? 'danger' : contextHasUnknown ? 'warning' : 'success'}>{!context ? t('context.unavailable') : context.summary.overBudget ? t('context.overBudget') : contextHasUnknown ? t('context.partial') : t('context.withinBudget')}</StatusPill></PageHeading>
    <div className="stat-grid context-stats"><StatCard label={t('context.fixed')} value={context && knownItems.length ? snapshot?.summary.fixedTokens ?? '—' : '—'} detail={t('context.tokensPerTurn')} /><StatCard label={t('context.activation')} value={context && knownItems.length ? snapshot?.summary.activationTokens ?? '—' : '—'} detail={t('context.activationDetail')} /><StatCard label={t('context.budget')} value={context?.summary.budgetTokens ?? '—'} detail={t('context.grade', { grade: context?.summary.grade ?? '—' })} /><StatCard label={t('context.notIncluded')} value={unknownCount ?? '—'} detail={t('context.notIncludedDetail')} /></div>
    <div className="section-toolbar"><div><strong>{t('context.details')}</strong><span>{context?.summary.tokenizer.model ?? context?.summary.tokenizer.mode ?? 'openai'}</span><small>{t('context.sourceDetail')}</small></div><label className="switch-label"><input aria-label={t('context.showDisabled')} type="checkbox" checked={showDisabled} onChange={(event) => setShowDisabled(event.target.checked)} /><span />{t('context.showDisabled')}</label></div>
    <div className="cost-list">{items.map((item) => {
      const resource = snapshot?.resources.find((entry) => entry.sourcePath === item.sourcePath && entry.name === item.name) ?? snapshot?.resources.find((entry) => entry.id === item.id);
      const cost = item.budgetScope === 'activation' ? item.activationEstimatedTokens : item.estimatedTokens;
      const known = hasKnownEstimate(item);
      const canToggle = item.controllable === true && Boolean(item.id) && !item.sourcePaths?.length && !(item.platform === 'codex' && item.controlMethod === 'skills.config');
      return <div className={`cost-row ${item.enabled === false ? 'disabled' : ''}`} key={`${item.id ?? item.sourcePath}:${item.enabled}`}>
        <div className="cost-resource-cell"><button className="resource-link" aria-label={t('context.openResource', { name: item.name })} onClick={() => resource && openResource(resource)}><code>{item.name}</code><small>{item.platform} · {activationLabel(item.activation, t)}{item.sourcePaths?.length ? ` · ${t('context.aggregate', { count: item.sourcePaths.length })}` : ''}</small></button>{item.sourcePaths?.length ? <details className="cost-children"><summary>{t('context.showSources', { count: item.sourcePaths.length })}</summary><ul>{item.sourcePaths.map((path) => <li key={path}><code>{path}</code></li>)}</ul></details> : null}</div>
        <div className="cost-bar" aria-hidden={!known}><span style={{ width: `${known ? Math.max(2, cost / max * 100) : 0}%` }} /></div><strong>{known ? cost : '—'}</strong><span className="cost-unit">{known ? t('context.tokens') : t('context.notIncludedShort')}</span>
        {controlStatusLabel(item, t) && <span className="muted">{controlStatusLabel(item, t)}</span>}{canToggle ? <button className="button compact" aria-label={t('context.reviewAdjustFor', { name: item.name })} onClick={() => void onToggle(item)}>{t('context.reviewAdjust')}</button> : <span className="muted">{known ? t('context.readonly') : t('context.unknown')}</span>}
      </div>;
    })}{!items.length && <EmptyRows icon={BarChart3} title={t('context.empty')} />}</div>
  </section>;
}
