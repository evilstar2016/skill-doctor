import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  Activity, AlertTriangle, ArrowRight, BarChart3, Boxes, Check, ChevronDown, CircleHelp, Clipboard,
  Download, FileCode2, Filter, FolderCog, FolderOpen, GitCompareArrows, Info, LayoutDashboard, LoaderCircle, Menu, Moon,
  PackagePlus, Plus, RefreshCw, RotateCcw, Save, Search, Settings2, ShieldCheck, Sparkles, Stethoscope, Sun, Trash2, X,
} from 'lucide-react';
import type { BootstrapPayload, DoctorSnapshot, ResourceDetailPayload, UiIssue, UiResource } from '../../src/application/types';
import type { DetectedAgent } from '../../src/discovery/detectAgents';
import type { ContextCostItem } from '../../src/types/context';
import type { DiffResult } from '../../src/diff/types';
import type { Platform, Scope } from '../../src/types/skill';
import type { AgentScanSourcesUserConfig, ScanSourceResource } from '../../src/config/loadUserConfig';
import type { EffectiveScanSource } from '../../src/config/scanSources';
import {
  cancelScan, cleanupDuplicate, compareResources, detectAgents, getBootstrap, getResourceDetail, installSkill,
  getScanSources, pickProjectDirectory, resetScanSources, saveScanSources, startScan, streamScan, toggleContextResource, uninstallSkill, validateScanSources,
  type ScanRequest,
} from './api';
import { OverviewPage as OverviewPageView } from './pages/OverviewPage';
import { IssuesPage as IssuesPageView } from './pages/IssuesPage';
import { ContextPage as ContextPageView } from './pages/ContextPage';
import { ResourcesPage as ResourcesPageView } from './pages/ResourcesPage';
import { ManagePage as ManagePageView } from './pages/ManagePage';
import { ScanPathsPage as ScanPathsPageView } from './pages/ScanPathsPage';
import { Detail, EmptyRows, FilterBar, HelpTip, InlineNotice, IssueCard, LaunchScreen, LoadingLine, PageHeading, PlatformIcon, ResourceStatus, ScanningEmpty, SettingSwitch, SeverityBadge, StatCard, StatusPill, activationLabel, copyText, kindLabel, platformLabel, resourceKindLabel, scopeLabel, severityLabel, shortPath, translateResultText } from './components/ui';
import { I18nProvider, useTranslation } from './i18n';

type Route = 'overview' | 'issues' | 'context' | 'resources' | 'scan-paths' | 'manage';
type Theme = 'light' | 'dark';
type AnalysisMode = 'standard' | 'deep' | 'custom';
type ScanStatus = 'preparing' | 'complete' | 'partial' | 'failed' | 'cancelled';
type ScanState = { id?: string; running: boolean; message: string; progress: number; status?: ScanStatus };

const DEFAULT_SCAN: ScanRequest = {
  projectDir: '', scope: 'all', platform: 'all', includeContext: true, includeDisabled: true, includeCache: true,
  discoverMcpTools: true, useAiAudit: false, conflictStrategy: 'token', analyzeConflicts: false,
  budgetTokens: 2000, tokenizer: 'openai', tokenizerModel: 'gpt-4o',
};

const ROUTES: Array<{ id: Route; labelKey: 'nav.overview' | 'nav.issues' | 'nav.context' | 'nav.resources' | 'nav.scanPaths' | 'nav.manage'; icon: typeof LayoutDashboard }> = [
  { id: 'overview', labelKey: 'nav.overview', icon: LayoutDashboard },
  { id: 'issues', labelKey: 'nav.issues', icon: Activity },
  { id: 'context', labelKey: 'nav.context', icon: BarChart3 },
  { id: 'resources', labelKey: 'nav.resources', icon: Boxes },
  { id: 'scan-paths', labelKey: 'nav.scanPaths', icon: FolderCog },
  { id: 'manage', labelKey: 'nav.manage', icon: PackagePlus },
];

export default function App() {
  return <I18nProvider><AppContent /></I18nProvider>;
}

function AppContent() {
  const { locale, setLocale, t } = useTranslation();
  const [route, setRoute] = useState<Route>(() => routeFromHash());
  const [theme, setTheme] = useState<Theme>(() => (localStorage.getItem('skill-doctor-theme') as Theme) || 'light');
  const [bootstrap, setBootstrap] = useState<BootstrapPayload | null>(null);
  const [snapshot, setSnapshot] = useState<DoctorSnapshot | null>(null);
  const [scanOptions, setScanOptions] = useState<ScanRequest>(() => loadScanOptions());
  const [scan, setScan] = useState<ScanState>({ running: false, message: '', progress: 0 });
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [onboardingOpen, setOnboardingOpen] = useState(false);
  const [detectedAgents, setDetectedAgents] = useState<DetectedAgent[]>([]);
  const [analysisMode, setAnalysisMode] = useState<AnalysisMode>(() => loadAnalysisMode());
  const [selectedIssue, setSelectedIssue] = useState<UiIssue | null>(null);
  const [selectedResource, setSelectedResource] = useState<UiResource | null>(null);
  const [resourceDetail, setResourceDetail] = useState<ResourceDetailPayload | null>(null);
  const [compare, setCompare] = useState<{ leftId: string; rightId: string; result?: DiffResult; loading?: boolean } | null>(null);
  const cleanupStream = useRef<null | (() => void)>(null);
  const activeScanId = useRef<string | undefined>(undefined);
  const scanVersion = useRef(0);
  const startedAutomatically = useRef(false);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem('skill-doctor-theme', theme);
  }, [theme]);

  useEffect(() => {
    const update = () => setRoute(routeFromHash());
    window.addEventListener('hashchange', update);
    return () => window.removeEventListener('hashchange', update);
  }, []);

  const runScan = useCallback(async (options: ScanRequest) => {
    const version = ++scanVersion.current;
    const previousScanId = activeScanId.current;
    cleanupStream.current?.();
    cleanupStream.current = null;
    activeScanId.current = undefined;
    if (previousScanId) void cancelScan(previousScanId);
    setError(null);
    setScan({ running: true, message: t('status.preparing'), progress: 3, status: 'preparing' });
    saveProjectPreference(options);
    try {
      const id = await startScan(options);
      if (version !== scanVersion.current) { void cancelScan(id); return; }
      activeScanId.current = id;
      setScan((current) => ({ ...current, id }));
      cleanupStream.current = streamScan(id, {
        progress(event) {
          if (version !== scanVersion.current) return;
          setScan({ id, running: true, message: translateResultText(event.message, t), progress: Math.round((event.completed / event.total) * 100), status: 'preparing' });
        },
        complete(nextSnapshot) {
          if (version !== scanVersion.current || nextSnapshot.target.platform !== (options.platform === 'all' ? null : options.platform)) return;
          activeScanId.current = undefined;
          setSnapshot(nextSnapshot);
          setScan({ running: false, message: nextSnapshot.status === 'partial' ? t('status.partial') : t('status.complete'), progress: 100, status: nextSnapshot.status === 'partial' ? 'partial' : 'complete' });
          setToast(t('toast.updated'));
        },
        error(nextError) {
          if (version !== scanVersion.current) return;
          activeScanId.current = undefined;
          setError(localizeRuntimeMessage(nextError.message, t));
          setScan({ running: false, message: t('status.failed'), progress: 0, status: 'failed' });
        },
        cancelled() {
          if (version !== scanVersion.current) return;
          activeScanId.current = undefined;
          setScan({ running: false, message: t('status.cancelled'), progress: 0, status: 'cancelled' });
        },
      });
    } catch (nextError) {
      if (version !== scanVersion.current) return;
      setError(localizeRuntimeMessage(nextError instanceof Error ? nextError.message : String(nextError), t));
      setScan({ running: false, message: t('status.failed'), progress: 0, status: 'failed' });
    }
  }, [t]);

  useEffect(() => {
    let alive = true;
    void getBootstrap().then((payload) => {
      if (!alive) return;
      setBootstrap(payload);
      setDetectedAgents(payload.detectedAgents);
      const configured = initialScanOptions(payload);
      setScanOptions(configured);
      const needsAgentChoice = configured.platform === 'all' && payload.detectedAgents.filter((agent) => agent.recommended).length > 1;
      const snapshotMatches = payload.snapshot?.target.platform === (configured.platform === 'all' ? null : configured.platform);
      setSnapshot(snapshotMatches ? payload.snapshot : null);
      if (needsAgentChoice) {
        setOnboardingOpen(true);
      } else if ((!snapshotMatches || !payload.snapshot) && !startedAutomatically.current) {
        startedAutomatically.current = true;
        void runScan(configured);
      }
    }).catch((nextError) => setError(nextError instanceof Error ? nextError.message : String(nextError)));
    return () => { alive = false; cleanupStream.current?.(); };
  }, [runScan]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 2800);
    return () => window.clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    const closeTopmost = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      if (compare) setCompare(null);
      else if (selectedResource) { setSelectedResource(null); setResourceDetail(null); }
      else if (selectedIssue) setSelectedIssue(null);
      else if (settingsOpen) setSettingsOpen(false);
    };
    window.addEventListener('keydown', closeTopmost);
    return () => window.removeEventListener('keydown', closeTopmost);
  }, [compare, selectedResource, selectedIssue, settingsOpen]);

  const navigate = (next: Route) => { window.location.hash = `/${next}`; setRoute(next); };
  const openResource = async (resource: UiResource) => {
    setSelectedResource(resource); setResourceDetail(null);
    try { setResourceDetail(await getResourceDetail(resource.id)); }
    catch (nextError) { setError(nextError instanceof Error ? nextError.message : String(nextError)); }
  };
  const refresh = () => void runScan(scanOptions);
  const chooseAnalysisMode = (mode: AnalysisMode) => {
    setAnalysisMode(mode);
    localStorage.setItem('skill-doctor-analysis-mode', mode);
    if (mode === 'custom') { setSettingsOpen(true); return; }
    setScanOptions((current) => optionsForAnalysisMode(current, mode, bootstrap?.capabilities));
  };

  if (!bootstrap && !error) return <LaunchScreen />;

  return (
    <div className="app-shell">
      <Sidebar route={route} navigate={navigate} snapshot={snapshot} />
      <main className="main-area">
        <Topbar
          bootstrap={bootstrap}
          scan={scan}
          scanOptions={scanOptions}
          setScanOptions={setScanOptions}
          selectAgent={(platform) => {
            const next = { ...scanOptions, platform };
            setScanOptions(next);
            setSnapshot(null);
            void runScan(next);
          }}
          runScan={refresh}
          cancel={() => {
            ++scanVersion.current;
            cleanupStream.current?.();
            cleanupStream.current = null;
            const id = activeScanId.current;
            activeScanId.current = undefined;
            if (id) void cancelScan(id);
            setScan({ running: false, message: t('status.cancelled'), progress: 0, status: 'cancelled' });
          }}
          openSettings={() => setSettingsOpen(true)}
          detectedAgents={detectedAgents}
          analysisMode={analysisMode}
          setAnalysisMode={chooseAnalysisMode}
          theme={theme}
          toggleTheme={() => setTheme(theme === 'light' ? 'dark' : 'light')}
          locale={locale}
          toggleLocale={() => setLocale(locale === 'zh-CN' ? 'en-US' : 'zh-CN')}
        />
        {error && <InlineNotice kind="danger" title={t('notice.incomplete')} onClose={() => setError(null)}>{error}</InlineNotice>}
        {snapshot?.target.platform === null && <InlineNotice kind="info" title={t('notice.crossAgent')}>{t('notice.crossAgentDetail')}</InlineNotice>}
        {snapshot?.warnings.map((warning) => <InlineNotice key={warning.id} kind="warning" title={warning.phase}>{translateResultText(warning.message, t)}</InlineNotice>)}
        <div className="page-container">
          {route === 'overview' && <OverviewPageView snapshot={snapshot} scan={scan} openIssue={setSelectedIssue} navigateToResources={() => navigate('resources')} />}
          {route === 'issues' && <IssuesPageView snapshot={snapshot} openIssue={setSelectedIssue} />}
          {route === 'context' && <ContextPageView snapshot={snapshot} openResource={openResource} onToggle={async (item) => {
            if (!item.id) return;
            const enabling = item.enabled === false;
            if (!window.confirm(t('context.toggleConfirm', { action: t(enabling ? 'context.enable' : 'context.disable'), name: item.name }))) return;
            const result = await toggleContextResource(item.id, enabling);
            setToast(result.requiresNewSession ? t('context.updatedNewSession') : result.message);
            refresh();
          }} />}
          {route === 'resources' && <ResourcesPageView snapshot={snapshot} openResource={openResource} />}
          {route === 'scan-paths' && <ScanPathsPageView
            platforms={bootstrap?.supportedPlatforms ?? []}
            setToast={setToast}
            onSaved={async (rescan) => {
              const payload = await getBootstrap();
              setBootstrap(payload);
              setDetectedAgents(payload.detectedAgents);
              if (rescan) refresh();
            }}
          />}
          {route === 'manage' && <ManagePageView bootstrap={bootstrap} snapshot={snapshot} onChanged={() => { void getBootstrap().then(setBootstrap); refresh(); }} setToast={setToast} />}
        </div>
      </main>

      {settingsOpen && <SettingsDrawer
        options={scanOptions}
        setOptions={setScanOptions}
        capabilities={bootstrap?.capabilities}
        close={() => setSettingsOpen(false)}
        apply={() => { setSettingsOpen(false); refresh(); }}
      />}
      {onboardingOpen && bootstrap && <OnboardingDialog
        bootstrap={bootstrap}
        options={scanOptions}
        agents={detectedAgents}
        analysisMode={analysisMode}
        setAnalysisMode={(mode) => {
          setAnalysisMode(mode);
          localStorage.setItem('skill-doctor-analysis-mode', mode);
          if (mode !== 'custom') setScanOptions((current) => optionsForAnalysisMode(current, mode, bootstrap.capabilities));
        }}
        setOptions={setScanOptions}
        detect={async (projectDir) => {
          const result = await detectAgents(projectDir);
          setDetectedAgents(result.agents);
          return result.agents;
        }}
        start={(options) => {
          setOnboardingOpen(false);
          setScanOptions(options);
          void runScan(options);
        }}
      />}
      {selectedIssue && <IssueDrawer
        issue={selectedIssue}
        snapshot={snapshot}
        close={() => setSelectedIssue(null)}
        openResource={(id) => {
          const resource = snapshot?.resources.find((entry) => entry.id === id);
          if (resource) { setSelectedIssue(null); void openResource(resource); }
        }}
        compare={(leftId, rightId) => setCompare({ leftId, rightId })}
        cleaned={() => { setSelectedIssue(null); refresh(); }}
        setToast={setToast}
      />}
      {selectedResource && <ResourceDrawer
        resource={selectedResource}
        detail={resourceDetail}
        close={() => { setSelectedResource(null); setResourceDetail(null); }}
        openIssue={(issue) => { setSelectedResource(null); setSelectedIssue(issue); }}
      />}
      {compare && <CompareDialog state={compare} snapshot={snapshot} setState={setCompare} close={() => setCompare(null)} />}
      {toast && <div className="toast"><Check size={17} />{toast}</div>}
    </div>
  );
}

function Sidebar({ route, navigate, snapshot }: { route: Route; navigate: (route: Route) => void; snapshot: DoctorSnapshot | null }) {
  const { t } = useTranslation();
  return <aside className="sidebar">
    <div className="brand"><span className="brand-mark"><Stethoscope size={21} /></span><span>Skill Doctor</span></div>
    <nav className="nav-list" aria-label={t('nav.overview')}>
      {ROUTES.map(({ id, labelKey, icon: Icon }) => <button key={id} className={`nav-item ${route === id ? 'active' : ''}`} onClick={() => navigate(id)}>
        <Icon size={18} /><span>{t(labelKey)}</span>
        {id === 'issues' && snapshot && snapshot.summary.issues > 0 && <span className="nav-count">{snapshot.summary.issues}</span>}
      </button>)}
    </nav>
    <div className="sidebar-foot"><ShieldCheck size={16} /><div><strong>{t('sidebar.local')}</strong><span>{t('sidebar.private')}</span></div></div>
  </aside>;
}

function Topbar(props: {
  bootstrap: BootstrapPayload | null; scan: ScanState;
  scanOptions: ScanRequest; setScanOptions: (value: ScanRequest) => void; runScan: () => void; cancel: () => void;
  selectAgent: (platform: ScanRequest['platform']) => void; detectedAgents: DetectedAgent[];
  analysisMode: AnalysisMode; setAnalysisMode: (mode: AnalysisMode) => void;
  openSettings: () => void; theme: Theme; toggleTheme: () => void; locale: 'zh-CN' | 'en-US'; toggleLocale: () => void;
}) {
  const { t } = useTranslation();
  const { bootstrap, scan, scanOptions, setScanOptions } = props;
  const deepAvailable = Boolean(bootstrap?.capabilities.aiAuditConfigured || bootstrap?.capabilities.embeddingConfigured);
  return <><header className="topbar">
    <div className="target-block">
      <span className="eyebrow">{t('topbar.target')}</span>
      <div className="target-row">
        <select value={scanOptions.scope} onChange={(event) => setScanOptions({ ...scanOptions, scope: event.target.value as ScanRequest['scope'] })} aria-label={t('topbar.scope')}>
          <option value="all">{t('topbar.scope.all')}</option><option value="project">{t('topbar.scope.project')}</option><option value="global">{t('topbar.scope.global')}</option>
        </select>
        <span className="project-path" title={scanOptions.projectDir}>{shortPath(scanOptions.projectDir)}</span>
      </div>
      {scan.running && <div className="scan-progress"><span style={{ width: `${scan.progress}%` }} /></div>}
      <span className="scan-message">{scan.running ? scan.message : scanStatusMessage(scan.status, t)}</span>
    </div>
    <div className="top-actions">
      <label className="analysis-mode"><span>{t('topbar.analysis')}</span><select value={props.analysisMode} onChange={(event) => props.setAnalysisMode(event.target.value as AnalysisMode)}><option value="standard">{t('topbar.standard')}</option><option value="deep" disabled={!deepAvailable}>{deepAvailable ? t('topbar.deep') : t('topbar.deepUnavailable')}</option><option value="custom">{t('topbar.custom')}</option></select></label>
      <button className="icon-button" onClick={props.toggleLocale} aria-label={props.locale === 'zh-CN' ? t('language.switchToEnglish') : t('language.switchToChinese')}>{props.locale === 'zh-CN' ? 'EN' : 'ZH'}</button>
      <button className="icon-button" onClick={props.toggleTheme} aria-label={props.theme === 'light' ? t('topbar.theme.dark') : t('topbar.theme.light')}>{props.theme === 'light' ? <Moon size={18} /> : <Sun size={18} />}</button>
      <button className="icon-button" onClick={props.openSettings} aria-label={t('topbar.settings')}><Settings2 size={18} /></button>
      {scan.running
        ? <button className="button secondary" onClick={props.cancel}><X size={17} />{t('topbar.cancel')}</button>
        : <button className="button primary" onClick={props.runScan}><RefreshCw size={17} />{t('topbar.rescan')}</button>}
    </div>
  </header><div className="agent-bar" aria-label={t('topbar.agents')}><span>{t('topbar.agent')}</span><div className="agent-tabs">{[...props.detectedAgents].sort((left, right) => Number(right.projectDetected) - Number(left.projectDetected)).map((agent) => <button key={agent.platform} className={scanOptions.platform === agent.platform ? 'active' : ''} onClick={() => props.selectAgent(agent.platform)}>{agent.displayName}{agent.projectDetected && <small>{t('topbar.project')}</small>}</button>)}<button className={`agent-overview ${scanOptions.platform === 'all' ? 'active' : ''}`} onClick={() => props.selectAgent('all')}>{t('topbar.overview')}</button></div></div></>;
}



function OnboardingDialog({ bootstrap, options, agents, analysisMode, setAnalysisMode, setOptions, detect, start }: {
  bootstrap: BootstrapPayload;
  options: ScanRequest;
  agents: DetectedAgent[];
  analysisMode: AnalysisMode;
  setAnalysisMode: (mode: AnalysisMode) => void;
  setOptions: React.Dispatch<React.SetStateAction<ScanRequest>>;
  detect: (projectDir: string) => Promise<DetectedAgent[]>;
  start: (options: ScanRequest) => void;
}) {
  const { t } = useTranslation();
  const [projectDir, setProjectDir] = useState(options.projectDir || bootstrap.projectDir);
  const [busy, setBusy] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const [agentChosen, setAgentChosen] = useState(options.platform !== 'all');
  const recommend = (nextAgents: DetectedAgent[]) => {
    const projectAgents = nextAgents.filter((agent) => agent.recommended);
    const platform = projectAgents.length === 1 ? projectAgents[0].platform : 'all';
    setAgentChosen(projectAgents.length === 1);
    setOptions((current) => ({ ...current, projectDir, platform }));
  };
  useEffect(() => { recommend(agents); }, []);
  const redetect = async () => {
    setBusy(true); setLocalError(null);
    try { const nextAgents = await detect(projectDir); recommend(nextAgents); }
    catch (error) { setLocalError(error instanceof Error ? error.message : String(error)); }
    finally { setBusy(false); }
  };
  const chooseProjectDirectory = async () => {
    setBusy(true); setLocalError(null);
    try {
      const result = await pickProjectDirectory();
      if (!('cancelled' in result)) setProjectDir(result.projectDir);
    } catch (error) { setLocalError(error instanceof Error ? error.message : String(error)); }
    finally { setBusy(false); }
  };
  const submit = async () => {
    setBusy(true); setLocalError(null);
    try {
      const nextAgents = await detect(projectDir);
      const available = new Set(nextAgents.map((agent) => agent.platform));
      const projectAgents = nextAgents.filter((agent) => agent.recommended);
      if (projectAgents.length > 1 && !agentChosen) { setLocalError(t('onboarding.agentRequired')); setBusy(false); return; }
      const platform = options.platform !== 'all' && available.has(options.platform)
        ? options.platform
        : projectAgents.length === 1 ? projectAgents[0].platform : 'all';
      start({ ...options, projectDir, platform });
    } catch (error) { setLocalError(error instanceof Error ? error.message : String(error)); setBusy(false); }
  };
  return <div className="onboarding-backdrop"><section className="onboarding-card" aria-modal="true" role="dialog" aria-labelledby="onboarding-title">
    <header><span className="brand-mark"><Stethoscope size={22} /></span><div><span className="eyebrow">{t('onboarding.eyebrow')}</span><h1 id="onboarding-title">{t('onboarding.title')}</h1><p>{t('onboarding.subtitle')}</p></div></header>
    <div className="onboarding-section"><div className="section-title"><div><strong>{t('onboarding.projectDirectory')}</strong><span>{t('onboarding.projectDirectoryDetail')}</span></div></div><div className="path-input-row"><input value={projectDir} onChange={(event) => setProjectDir(event.target.value)} aria-label={t('onboarding.projectDirectory')} /><button className="button secondary compact" onClick={() => void chooseProjectDirectory()} disabled={busy}><FolderOpen size={16} />{t('onboarding.chooseDirectory')}</button><button className="button secondary" onClick={() => void redetect()} disabled={busy}>{busy ? <LoaderCircle className="spin" size={16} /> : <Search size={16} />}{t('onboarding.detectAgents')}</button></div><p className="scope-help">{t('onboarding.scopeHelp', { project: t('onboarding.projectConfig'), global: t('onboarding.globalConfig') })}</p></div>
    <div className="onboarding-section"><div className="section-title"><div><strong>{t('onboarding.agentTitle')}</strong><span>{t('onboarding.agentDetail')}</span></div></div><div className="agent-choice-grid">{[...agents].sort((left, right) => Number(right.projectDetected) - Number(left.projectDetected)).map((agent) => <button key={agent.platform} className={agentChosen && options.platform === agent.platform ? 'active' : ''} onClick={() => { setAgentChosen(true); setOptions((current) => ({ ...current, platform: agent.platform })); }}><PlatformIcon platform={agent.platform} /><strong>{agent.displayName}</strong><small>{agent.projectDetected ? t('onboarding.recommended') : t('onboarding.globalOnly')}</small></button>)}<button className={`agent-overview ${agentChosen && options.platform === 'all' ? 'active' : ''}`} onClick={() => { setAgentChosen(true); setOptions((current) => ({ ...current, platform: 'all' })); }}><Boxes size={18} /><strong>{t('onboarding.overview')}</strong><small>{t('onboarding.overviewDetail')}</small></button></div>{agents.length === 0 && <p className="muted">{t('onboarding.noAgents')}</p>}</div>
    <div className="onboarding-section"><div className="section-title"><div><strong>{t('onboarding.analysisTitle')}</strong><span>{t('onboarding.analysisDetail')}</span></div></div><div className="analysis-choice"><button className={analysisMode === 'standard' ? 'active' : ''} onClick={() => setAnalysisMode('standard')}><ShieldCheck size={19} /><span><strong>{t('onboarding.standard')}</strong><small>{t('onboarding.standardDetail')}</small></span></button><button className={analysisMode === 'deep' ? 'active' : ''} disabled={!bootstrap.capabilities.aiAuditConfigured && !bootstrap.capabilities.embeddingConfigured} onClick={() => setAnalysisMode('deep')}><Sparkles size={19} /><span><strong>{t('onboarding.deep')}</strong><small>{bootstrap.capabilities.aiAuditConfigured || bootstrap.capabilities.embeddingConfigured ? t('onboarding.deepAvailable') : t('onboarding.deepUnavailable')}</small></span></button></div></div>
    {localError && <p className="form-error onboarding-error">{localError}</p>}
    <footer><div><ShieldCheck size={16} /><span>{t('onboarding.private')}</span></div><button className="button primary" onClick={() => void submit()} disabled={busy || !projectDir.trim()}>{busy ? <LoaderCircle className="spin" size={17} /> : <Stethoscope size={17} />}{t('onboarding.start')}</button></footer>
  </section></div>;
}

function SettingsDrawer({ options, setOptions, capabilities, close, apply }: { options: ScanRequest; setOptions: (value: ScanRequest) => void; capabilities?: BootstrapPayload['capabilities']; close: () => void; apply: () => void }) {
  const { t } = useTranslation();
  return <Drawer title={t('settings.title')} subtitle={t('settings.subtitle')} close={close}><div className="drawer-section"><h4>{t('settings.platformScope')}</h4><label className="field"><span>{t('settings.platform')}</span><select value={options.platform} onChange={(event) => setOptions({ ...options, platform: event.target.value as ScanRequest['platform'] })}><option value="all">{t('settings.allPlatforms')}</option>{['claude','cursor','copilot','codex','gemini','windsurf','trae','opencode','kiro','openclaw','hermes'].map((value) => <option key={value}>{value}</option>)}</select></label></div>
    <div className="drawer-section"><h4>{t('settings.capabilities')}</h4><SettingSwitch label={t('settings.context')} description={t('settings.contextDetail')} checked={options.includeContext} onChange={(checked) => setOptions({ ...options, includeContext: checked })} /><SettingSwitch label={t('settings.disabled')} description={t('settings.disabledDetail')} checked={options.includeDisabled} onChange={(checked) => setOptions({ ...options, includeDisabled: checked })} /><SettingSwitch label={t('settings.cache')} description={t('settings.cacheDetail')} checked={options.includeCache} onChange={(checked) => setOptions({ ...options, includeCache: checked })} /><SettingSwitch label={t('settings.mcp')} description={t('settings.mcpDetail')} checked={options.discoverMcpTools} onChange={(checked) => setOptions({ ...options, discoverMcpTools: checked })} /></div>
    <div className="drawer-section"><h4>{t('settings.deep')}</h4><label className="field"><span>{t('settings.conflicts')} <HelpTip label={t('settings.conflicts')} text={t('settings.conflictsHelp')} /></span><select value={options.conflictStrategy} onChange={(event) => setOptions({ ...options, conflictStrategy: event.target.value as ScanRequest['conflictStrategy'] })}><option value="token">{t('settings.token')}</option><option value="embedding" disabled={!capabilities?.embeddingConfigured}>{t('settings.embedding')}{!capabilities?.embeddingConfigured ? t('settings.unconfigured') : ''}</option></select></label><SettingSwitch label={t('settings.aiAudit')} description={capabilities?.aiAuditConfigured ? t('settings.aiConfigured') : t('settings.aiUnavailable')} checked={options.useAiAudit} disabled={!capabilities?.aiAuditConfigured} onChange={(checked) => setOptions({ ...options, useAiAudit: checked })} /><SettingSwitch label={t('settings.aiConflict')} description={t('settings.aiConflictDetail')} checked={options.analyzeConflicts} disabled={!capabilities?.aiAuditConfigured} onChange={(checked) => setOptions({ ...options, analyzeConflicts: checked })} /></div>
    <div className="drawer-section"><h4>{t('settings.budget')}</h4><label className="field"><span>{t('settings.budgetPerTurn')} <HelpTip label={t('settings.budgetPerTurn')} text={t('settings.budgetHelp')} /></span><input type="number" min="100" value={options.budgetTokens} onChange={(event) => setOptions({ ...options, budgetTokens: Number(event.target.value) || 2000 })} /></label><label className="field"><span>Tokenizer <HelpTip label="Tokenizer" text={t('settings.tokenizerHelp')} /></span><select value={options.tokenizer} onChange={(event) => setOptions({ ...options, tokenizer: event.target.value as ScanRequest['tokenizer'] })}><option value="openai">OpenAI tokenizer</option><option value="approx">{t('settings.approx')}</option></select></label></div>
    <div className="drawer-actions"><button className="button secondary" onClick={close}>{t('settings.cancel')}</button><button className="button primary" onClick={apply}>{t('settings.saveRescan')}</button></div>
  </Drawer>;
}

function IssueDrawer({ issue, snapshot, close, openResource, compare, cleaned, setToast }: { issue: UiIssue; snapshot: DoctorSnapshot | null; close: () => void; openResource: (id: string) => void; compare: (a: string, b: string) => void; cleaned: () => void; setToast: (message: string) => void }) {
  const { t } = useTranslation();
  const [removePath, setRemovePath] = useState(issue.cleanup?.removePath ?? issue.evidence.find((entry) => entry.path)?.path ?? ''); const [confirmation, setConfirmation] = useState(''); const [busy, setBusy] = useState(false);
  return <Drawer title={translateResultText(issue.title, t)} subtitle={`${kindLabel(issue.kind, t)} · ${severityLabel(issue.severity, t)}`} close={close}><div className="issue-hero"><SeverityBadge severity={issue.severity} /><p>{translateResultText(issue.summary, t)}</p></div>
    <div className="drawer-section"><h4>{t('drawer.affected')}</h4><div className="linked-resources">{issue.resourceIds.map((id, index) => <button key={id} onClick={() => openResource(id)}><code>{issue.resourceNames[index] ?? id}</code><ArrowRight size={15} /></button>)}</div></div>
    <div className="drawer-section"><h4>{t('drawer.evidence')}</h4><div className="evidence-list">{issue.evidence.map((evidence, index) => <div key={`${evidence.label}:${index}`}><span>{translateResultText(evidence.label, t)}</span><code>{evidence.value || '—'}</code>{evidence.path && <button className="copy-button" onClick={() => void copyText(evidence.path!, setToast, t)}><Clipboard size={14} />{t('drawer.copyPath')}</button>}</div>)}</div></div>
    {issue.recommendation && <div className="recommendation"><Sparkles size={18} /><div><strong>{t('drawer.recommendation')}</strong><p>{translateResultText(issue.recommendation, t)}</p></div></div>}
    {issue.kind === 'conflict' && issue.resourceIds.length === 2 && <button className="button secondary full" onClick={() => compare(issue.resourceIds[0], issue.resourceIds[1])}><GitCompareArrows size={16} />{t('drawer.compare')}</button>}
    {issue.kind === 'duplicate' && <div className="drawer-section destructive-zone"><h4>{t('drawer.deleteDuplicate')}</h4><p>{t('drawer.deleteWarning')}</p><label className="field"><span>{t('drawer.deletePath')}</span><select value={removePath} onChange={(event) => { setRemovePath(event.target.value); setConfirmation(''); }}>{issue.evidence.filter((entry) => entry.path).map((entry) => <option key={entry.path} value={entry.path}>{entry.path}</option>)}</select></label><label className="field"><span>{t('drawer.confirmPath')}</span><input value={confirmation} onChange={(event) => setConfirmation(event.target.value)} placeholder={removePath} /></label><button className="button danger full" disabled={busy || confirmation !== removePath} onClick={async () => { setBusy(true); try { await cleanupDuplicate(issue.id, removePath, confirmation); setToast(t('drawer.deleted')); cleaned(); } catch (error) { setToast(error instanceof Error ? error.message : String(error)); } finally { setBusy(false); } }}><Trash2 size={16} />{t('drawer.deleteRescan')}</button></div>}
  </Drawer>;
}

function ResourceDrawer({ resource, detail, close, openIssue }: { resource: UiResource; detail: ResourceDetailPayload | null; close: () => void; openIssue: (issue: UiIssue) => void }) {
  const { t } = useTranslation();
  return <Drawer title={resource.name} subtitle={`${resource.kindLabel} · ${resource.shared ? t('drawer.sharedSubtitle', { count: resource.consumers.length }) : platformLabel(resource.platform)} · ${scopeLabel(resource.scope, t)}`} close={close}>
    <div className="resource-hero"><div><ResourceStatus status={resource.status} count={resource.issueIds.length} />{resource.shared && <span className="shared-badge">{t('drawer.shared')}</span>}</div><p>{translateResultText(resource.description || resource.recommendation || t('drawer.noDescription'), t)}</p></div>
    <div className="detail-grid"><Detail label={t('drawer.activation')} value={activationLabel(resource.activation, t)} /><Detail label={t('drawer.fixed')} value={`${resource.fixedTokens} tokens`} /><Detail label={t('drawer.onDemand')} value={`${resource.activationTokens} tokens`} /><Detail label={t('drawer.controllable')} value={resource.controllable ? t('drawer.supported') : t('drawer.readonly')} /></div>
    {resource.shared && <div className="drawer-section"><h4>{t('drawer.consumers')}</h4><p className="shared-impact">{t('drawer.consumerImpact', { count: resource.consumers.length })}</p><div className="consumer-list">{resource.consumers.map((consumer) => <div key={`${consumer.platform}:${consumer.scope}`}><PlatformIcon platform={consumer.platform} /><span><strong>{platformLabel(consumer.platform)}</strong><small>{scopeLabel(consumer.scope, t)} · {activationLabel(consumer.activation, t)}{consumer.enabled === false ? ` · ${t('drawer.disabled')}` : ''}</small></span><code>{consumer.fixedTokens === undefined || consumer.activationTokens === undefined ? t('drawer.notCalculated') : `${consumer.fixedTokens + consumer.activationTokens} tokens`}</code></div>)}</div></div>}
    <div className="drawer-section"><h4>{resource.sourcePaths?.length ? t('drawer.sources', { count: resource.sourcePaths.length }) : t('drawer.source')}</h4>{(resource.sourcePaths ?? [resource.sourcePath]).map((path) => <div className="path-box" key={path}><code>{path}</code><button onClick={() => void navigator.clipboard.writeText(path)}><Clipboard size={14} /></button></div>)}{resource.installSource && <Detail label={t('drawer.installSource')} value={resource.installSource} />}{resource.repository && <Detail label={t('drawer.repository')} value={resource.repository} />}{resource.author && <Detail label={t('drawer.author')} value={resource.author} />}</div>
    <div className="drawer-section"><h4>{t('drawer.triggers')}</h4><div className="tag-list">{resource.triggers.length ? resource.triggers.map((trigger) => <span key={trigger}>{trigger}</span>) : <span className="muted">{t('drawer.noTriggers')}</span>}</div></div>
    <div className="drawer-section"><h4>{t('drawer.issues')}</h4>{detail ? <div className="linked-issues">{detail.issues.map((issue) => <button key={issue.id} onClick={() => openIssue(issue)}><SeverityBadge severity={issue.severity} /><span>{translateResultText(issue.title, t)}</span><ArrowRight size={15} /></button>)}{!detail.issues.length && <p className="muted">{t('drawer.noIssues')}</p>}</div> : <LoadingLine />}</div>
    {detail?.skill?.relatedSkills?.length ? <div className="drawer-section"><h4>{t('drawer.related')}</h4><div className="related-list">{detail.skill.relatedSkills.map((related) => <div key={related.name}><code>{related.name}</code><span>{t('drawer.similar', { percent: Math.round(related.similarity * 100) })}</span></div>)}</div></div> : null}
  </Drawer>;
}

function CompareDialog({ state, snapshot, setState, close }: { state: { leftId: string; rightId: string; result?: DiffResult; loading?: boolean }; snapshot: DoctorSnapshot | null; setState: (value: typeof state) => void; close: () => void }) {
  const { t } = useTranslation();
  useEffect(() => { if (state.result || state.loading) return; setState({ ...state, loading: true }); void compareResources(state.leftId, state.rightId).then((result) => setState({ ...state, result, loading: false })).catch(() => setState({ ...state, loading: false })); }, [state, setState]);
  const left = snapshot?.resources.find((entry) => entry.id === state.leftId); const right = snapshot?.resources.find((entry) => entry.id === state.rightId);
  return <div className="modal-backdrop" role="presentation"><section className="compare-dialog" role="dialog" aria-modal="true"><header><div><span className="eyebrow">{t('compare.title')}</span><h2>{left?.name} <span>vs</span> {right?.name}</h2></div><button className="icon-button" onClick={close}><X size={19} /></button></header>{state.loading && <div className="dialog-loading"><LoaderCircle className="spin" />{t('compare.loading')}</div>}{state.result && <div className="compare-grid"><CompareColumn title={state.result.skillA.name} profile={state.result.skillA} /><CompareColumn title={state.result.skillB.name} profile={state.result.skillB} /></div>}</section></div>;
}

function CompareColumn({ title, profile }: { title: string; profile: DiffResult['skillA'] }) { const { t } = useTranslation(); return <article><h3>{title}</h3><p>{profile.description}</p><h4>{t('compare.when')}</h4><p>{profile.whenToUse || t('compare.undeclared')}</p><h4>{t('compare.triggers')}</h4><div className="tag-list">{profile.triggers.map((trigger) => <span key={trigger}>{trigger}</span>)}</div><h4>{t('compare.checklist')}</h4><ul>{profile.checklistItems.map((item) => <li key={item}>{item}</li>)}{!profile.checklistItems.length && <li className="muted">{t('compare.empty')}</li>}</ul></article>; }

function Drawer({ title, subtitle, close, children }: { title: string; subtitle?: string; close: () => void; children: ReactNode }) { const { t } = useTranslation(); return <div className="drawer-backdrop" onMouseDown={(event) => event.target === event.currentTarget && close()}><aside className="drawer" role="dialog" aria-modal="true"><header><div><span className="eyebrow">{subtitle}</span><h2>{title}</h2></div><button className="icon-button" onClick={close} aria-label={t('common.close')}><X size={19} /></button></header><div className="drawer-body">{children}</div></aside></div>; }

function scanStatusMessage(status: ScanState['status'], t: ReturnType<typeof useTranslation>['t']): string {
  if (!status) return t('topbar.waiting');
  const key = { preparing: 'status.preparing', complete: 'status.complete', partial: 'status.partial', failed: 'status.failed', cancelled: 'status.cancelled' } as const;
  return t(key[status]);
}
function routeFromHash(): Route { const value = window.location.hash.replace(/^#\//, '') as Route; return ROUTES.some((route) => route.id === value) ? value : 'overview'; }
function initialScanOptions(payload: BootstrapPayload): ScanRequest {
  const preference = loadProjectPreference(payload.projectDir);
  const available = new Set(payload.detectedAgents.map((agent) => agent.platform));
  const preferredPlatform = preference.platform && preference.platform !== 'all' && available.has(preference.platform) ? preference.platform : undefined;
  const snapshotPlatform = payload.snapshot?.target.platform;
  const snapshotSelection = snapshotPlatform && available.has(snapshotPlatform) ? snapshotPlatform : undefined;
  const projectAgents = payload.detectedAgents.filter((agent) => agent.recommended);
  const platform = preferredPlatform ?? snapshotSelection ?? (projectAgents.length === 1 ? projectAgents[0].platform : 'all');
  return { ...DEFAULT_SCAN, ...preference, projectDir: payload.projectDir, platform };
}

function loadScanOptions(): ScanRequest { return DEFAULT_SCAN; }
function localizeRuntimeMessage(message: string, t: ReturnType<typeof useTranslation>['t']): string { return message === 'scan_connection_closed' ? t('runtime.scanConnectionClosed') : message; }
function loadProjectPreference(projectDir: string): Partial<ScanRequest> { try { return JSON.parse(localStorage.getItem('skill-doctor-project-preferences') ?? '{}')[projectDir] ?? {}; } catch { return {}; } }
function saveProjectPreference(options: ScanRequest): void {
  try {
    const preferences = JSON.parse(localStorage.getItem('skill-doctor-project-preferences') ?? '{}');
    const existing = preferences[options.projectDir] ?? {};
    const { platform, ...rest } = options;
    preferences[options.projectDir] = {
      ...existing,
      ...rest,
      ...(platform === 'all' ? existing.platform && existing.platform !== 'all' ? { platform: existing.platform } : {} : { platform }),
    };
    localStorage.setItem('skill-doctor-project-preferences', JSON.stringify(preferences));
  } catch { /* ignore unavailable storage */ }
}
function loadAnalysisMode(): AnalysisMode { const value = localStorage.getItem('skill-doctor-analysis-mode'); return value === 'deep' || value === 'custom' ? value : 'standard'; }
function optionsForAnalysisMode(options: ScanRequest, mode: Exclude<AnalysisMode, 'custom'>, capabilities?: BootstrapPayload['capabilities']): ScanRequest {
  if (mode === 'standard') return { ...options, includeContext: true, discoverMcpTools: true, useAiAudit: false, conflictStrategy: 'token', analyzeConflicts: false };
  return { ...options, includeContext: true, discoverMcpTools: true, useAiAudit: capabilities?.aiAuditConfigured === true, conflictStrategy: capabilities?.embeddingConfigured ? 'embedding' : 'token', analyzeConflicts: capabilities?.aiAuditConfigured === true };
}
