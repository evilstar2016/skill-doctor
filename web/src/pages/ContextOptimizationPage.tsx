import type { DoctorSnapshot, UiResource } from '../../../src/application/types';
import type { ContextCostItem } from '../../../src/types/context';
import type { Platform } from '../../../src/types/skill';
import { BenefitPage, type BenefitView } from './BenefitPage';
import { ContextPage } from './ContextPage';
import { OptimizationWizard } from './OptimizationWizard';
import { useTranslation } from '../i18n';
import './contextOptimizationPage.css';

export type ContextOptimizationView = 'current' | 'recommendations' | 'evidence';

export function ContextOptimizationPage({
  active,
  view,
  setView,
  snapshot,
  projectDir,
  platform,
  snapshotId,
  tokenizer,
  tokenizerModel,
  openResource,
  onToggle,
}: {
  active: boolean;
  view: ContextOptimizationView;
  setView: (view: ContextOptimizationView) => void;
  snapshot: DoctorSnapshot | null;
  projectDir: string;
  platform: Platform | 'all';
  snapshotId?: string;
  tokenizer: 'openai' | 'approx';
  tokenizerModel: string;
  openResource: (resource: UiResource) => void;
  onToggle: (item: ContextCostItem) => Promise<void>;
}) {
  const { t } = useTranslation();
  const tabs: Array<{ id: ContextOptimizationView; label: string; detail: string }> = [
    { id: 'current', label: t('context.view.current'), detail: t('context.view.currentDetail') },
    { id: 'recommendations', label: t('context.view.recommendations'), detail: t('context.view.recommendationsDetail') },
    { id: 'evidence', label: t('context.view.evidence'), detail: t('context.view.evidenceDetail') },
  ];
  const benefitView: BenefitView = view === 'evidence' ? 'evidence' : 'recommendations';

  if (platform === 'codex') return active ? <section>
    {view === 'current'
      ? <><button className="button secondary" onClick={() => setView('recommendations')}>{t('opt.backSuggestions')}</button><ContextPage snapshot={snapshot} openResource={openResource} onToggle={onToggle} /></>
      : <OptimizationWizard key={projectDir} projectDir={projectDir} />}
    {view !== 'current' && <button className="button ghost compact" onClick={() => setView('current')}>{t('opt.staticResources')}</button>}
  </section> : null;

  return <section className="context-optimization-page" hidden={!active} aria-label={t('context.optimizationLabel')}>
    <nav className="context-optimization-tabs" role="tablist" aria-label={t('context.views')}>
      {tabs.map((tab) => <button
        key={tab.id}
        type="button"
        role="tab"
        aria-selected={view === tab.id}
        aria-controls={tab.id === 'current' ? 'context-optimization-panel-current' : 'context-optimization-panel-benefit'}
        className={view === tab.id ? 'active' : ''}
        onClick={() => setView(tab.id)}
      ><span>{tab.label}</span><small>{tab.detail}</small></button>)}
    </nav>
    <div id="context-optimization-panel-current" role="tabpanel" hidden={view !== 'current'}>
      <ContextPage active={active && view === 'current'} snapshot={snapshot} openResource={openResource} onToggle={onToggle} />
    </div>
    <div id="context-optimization-panel-benefit" role="tabpanel" hidden={view === 'current'}>
      <BenefitPage
        active={active && view !== 'current'}
        projectDir={projectDir}
        platform={platform}
        snapshotId={snapshotId}
        tokenizer={tokenizer}
        tokenizerModel={tokenizerModel}
        view={benefitView}
        showViewTabs={false}
        onViewChange={(nextView) => setView(nextView === 'evidence' ? 'evidence' : 'recommendations')}
      />
    </div>
  </section>;
}
