import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  Activity, AlertTriangle, ArrowRight, BarChart3, Boxes, Check, ChevronDown, CircleHelp, Clipboard,
  Download, FileCode2, Filter, FolderCog, GitCompareArrows, Info, LayoutDashboard, LoaderCircle, Menu, Moon,
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
  getScanSources, resetScanSources, saveScanSources, startScan, streamScan, toggleContextResource, uninstallSkill, validateScanSources,
  type ScanRequest,
} from './api';

type Route = 'overview' | 'issues' | 'context' | 'resources' | 'scan-paths' | 'manage';
type Theme = 'light' | 'dark';
type AnalysisMode = 'standard' | 'deep' | 'custom';

const DEFAULT_SCAN: ScanRequest = {
  projectDir: '', scope: 'all', platform: 'all', includeContext: true, includeDisabled: true, includeCache: true,
  discoverMcpTools: false, useAiAudit: false, conflictStrategy: 'token', analyzeConflicts: false,
  budgetTokens: 2000, tokenizer: 'openai', tokenizerModel: 'gpt-4o',
};

const ROUTES: Array<{ id: Route; label: string; icon: typeof LayoutDashboard }> = [
  { id: 'overview', label: '总览', icon: LayoutDashboard },
  { id: 'issues', label: '待处理', icon: Activity },
  { id: 'context', label: '上下文成本', icon: BarChart3 },
  { id: 'resources', label: '资源清单', icon: Boxes },
  { id: 'scan-paths', label: '扫描路径', icon: FolderCog },
  { id: 'manage', label: '管理与导出', icon: PackagePlus },
];

export default function App() {
  const [route, setRoute] = useState<Route>(() => routeFromHash());
  const [theme, setTheme] = useState<Theme>(() => (localStorage.getItem('skill-doctor-theme') as Theme) || 'light');
  const [bootstrap, setBootstrap] = useState<BootstrapPayload | null>(null);
  const [snapshot, setSnapshot] = useState<DoctorSnapshot | null>(null);
  const [scanOptions, setScanOptions] = useState<ScanRequest>(() => loadScanOptions());
  const [scan, setScan] = useState<{ id?: string; running: boolean; message: string; progress: number }>({ running: false, message: '', progress: 0 });
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
    cleanupStream.current?.();
    setError(null);
    setScan({ running: true, message: '准备体检', progress: 3 });
    saveProjectPreference(options);
    try {
      const id = await startScan(options);
      setScan((current) => ({ ...current, id }));
      cleanupStream.current = streamScan(id, {
        progress(event) {
          setScan({ id, running: true, message: event.message, progress: Math.round((event.completed / event.total) * 100) });
        },
        complete(nextSnapshot) {
          setSnapshot(nextSnapshot);
          setScan({ running: false, message: nextSnapshot.status === 'partial' ? '体检完成，部分项目需要关注' : '体检完成', progress: 100 });
          setToast('体检结果已更新');
        },
        error(nextError) {
          setError(nextError.message);
          setScan({ running: false, message: '体检失败', progress: 0 });
        },
        cancelled() {
          setScan({ running: false, message: '已取消', progress: 0 });
        },
      });
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : String(nextError));
      setScan({ running: false, message: '体检失败', progress: 0 });
    }
  }, []);

  useEffect(() => {
    let alive = true;
    void getBootstrap().then((payload) => {
      if (!alive) return;
      setBootstrap(payload);
      setSnapshot(payload.snapshot);
      setDetectedAgents(payload.detectedAgents);
      const configured = { ...DEFAULT_SCAN, ...loadProjectPreference(payload.projectDir), projectDir: payload.projectDir };
      setScanOptions(configured);
      const onboardingComplete = isOnboardingComplete(payload.projectDir);
      if (!payload.snapshot && !onboardingComplete) {
        setOnboardingOpen(true);
      } else if (!payload.snapshot && !startedAutomatically.current) {
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
            void runScan(next);
          }}
          runScan={refresh}
          cancel={() => scan.id && void cancelScan(scan.id)}
          openSettings={() => setSettingsOpen(true)}
          detectedAgents={detectedAgents}
          analysisMode={analysisMode}
          setAnalysisMode={chooseAnalysisMode}
          theme={theme}
          toggleTheme={() => setTheme(theme === 'light' ? 'dark' : 'light')}
        />
        {error && <InlineNotice kind="danger" title="操作未完成" onClose={() => setError(null)}>{error}</InlineNotice>}
        {snapshot?.warnings.map((warning) => <InlineNotice key={warning.id} kind="warning" title={warning.phase}>{warning.message}</InlineNotice>)}
        <div className="page-container">
          {route === 'overview' && <OverviewPage snapshot={snapshot} scan={scan} openIssue={setSelectedIssue} navigate={navigate} />}
          {route === 'issues' && <IssuesPage snapshot={snapshot} openIssue={setSelectedIssue} />}
          {route === 'context' && <ContextPage snapshot={snapshot} openResource={openResource} onToggle={async (item) => {
            if (!item.id) return;
            const enabling = item.enabled === false;
            if (!window.confirm(`${enabling ? '启用' : '禁用'} ${item.name}？该修改将在新 Codex 会话中生效。`)) return;
            const result = await toggleContextResource(item.id, enabling);
            setToast(result.requiresNewSession ? '配置已更新，新会话后生效' : result.message);
            refresh();
          }} />}
          {route === 'resources' && <ResourcesPage snapshot={snapshot} openResource={openResource} />}
          {route === 'scan-paths' && <ScanPathsPage
            platforms={bootstrap?.supportedPlatforms ?? []}
            setToast={setToast}
            onSaved={async (rescan) => {
              const payload = await getBootstrap();
              setBootstrap(payload);
              setDetectedAgents(payload.detectedAgents);
              if (rescan) refresh();
            }}
          />}
          {route === 'manage' && <ManagePage bootstrap={bootstrap} snapshot={snapshot} onChanged={() => { void getBootstrap().then(setBootstrap); refresh(); }} setToast={setToast} />}
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
          markOnboardingComplete(options.projectDir);
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
  return <aside className="sidebar">
    <div className="brand"><span className="brand-mark"><Stethoscope size={21} /></span><span>Skill Doctor</span></div>
    <nav className="nav-list" aria-label="主导航">
      {ROUTES.map(({ id, label, icon: Icon }) => <button key={id} className={`nav-item ${route === id ? 'active' : ''}`} onClick={() => navigate(id)}>
        <Icon size={18} /><span>{label}</span>
        {id === 'issues' && snapshot && snapshot.summary.issues > 0 && <span className="nav-count">{snapshot.summary.issues}</span>}
      </button>)}
    </nav>
    <div className="sidebar-foot"><ShieldCheck size={16} /><div><strong>分析在本机完成</strong><span>配置内容不会上传</span></div></div>
  </aside>;
}

function Topbar(props: {
  bootstrap: BootstrapPayload | null; scan: { id?: string; running: boolean; message: string; progress: number };
  scanOptions: ScanRequest; setScanOptions: (value: ScanRequest) => void; runScan: () => void; cancel: () => void;
  selectAgent: (platform: ScanRequest['platform']) => void; detectedAgents: DetectedAgent[];
  analysisMode: AnalysisMode; setAnalysisMode: (mode: AnalysisMode) => void;
  openSettings: () => void; theme: Theme; toggleTheme: () => void;
}) {
  const { bootstrap, scan, scanOptions, setScanOptions } = props;
  const deepAvailable = Boolean(bootstrap?.capabilities.aiAuditConfigured || bootstrap?.capabilities.embeddingConfigured);
  return <><header className="topbar">
    <div className="target-block">
      <span className="eyebrow">检查目标</span>
      <div className="target-row">
        <select value={scanOptions.scope} onChange={(event) => setScanOptions({ ...scanOptions, scope: event.target.value as ScanRequest['scope'] })} aria-label="检查范围">
          <option value="all">当前项目与全局配置</option><option value="project">仅当前项目</option><option value="global">仅全局配置</option>
        </select>
        <span className="project-path" title={bootstrap?.projectDir}>{shortPath(bootstrap?.projectDir ?? '')}</span>
      </div>
      {scan.running && <div className="scan-progress"><span style={{ width: `${scan.progress}%` }} /></div>}
      <span className="scan-message">{scan.message || '等待首次体检'}</span>
    </div>
    <div className="top-actions">
      <label className="analysis-mode" title="标准体检只使用本地静态能力；深度体检使用已配置的语义或 AI 分析服务。"><span>分析模式</span><select value={props.analysisMode} onChange={(event) => props.setAnalysisMode(event.target.value as AnalysisMode)}><option value="standard">标准体检</option><option value="deep" disabled={!deepAvailable}>深度体检{deepAvailable ? '' : '（未配置）'}</option><option value="custom">自定义…</option></select></label>
      <button className="icon-button" onClick={props.toggleTheme} aria-label={props.theme === 'light' ? '切换深色主题' : '切换浅色主题'}>{props.theme === 'light' ? <Moon size={18} /> : <Sun size={18} />}</button>
      <button className="icon-button" onClick={props.openSettings} aria-label="扫描设置"><Settings2 size={18} /></button>
      {scan.running
        ? <button className="button secondary" onClick={props.cancel}><X size={17} />取消</button>
        : <button className="button primary" onClick={props.runScan}><RefreshCw size={17} />重新体检</button>}
    </div>
  </header><div className="agent-bar" aria-label="选择要体检的 Agent"><span>Agent</span><div className="agent-tabs"><button className={scanOptions.platform === 'all' ? 'active' : ''} onClick={() => props.selectAgent('all')}>全部</button>{props.detectedAgents.map((agent) => <button key={agent.platform} className={scanOptions.platform === agent.platform ? 'active' : ''} onClick={() => props.selectAgent(agent.platform)} title={agent.projectDetected ? '当前项目已使用' : '仅发现全局配置'}>{agent.displayName}{agent.projectDetected && <small>项目</small>}</button>)}</div></div></>;
}

function OverviewPage({ snapshot, scan, openIssue, navigate }: { snapshot: DoctorSnapshot | null; scan: { running: boolean }; openIssue: (issue: UiIssue) => void; navigate: (route: Route) => void }) {
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
      <section className="panel"><div className="panel-heading"><div><h3>平台覆盖</h3><p>当前范围内实际发现的资源</p></div><button className="text-button" onClick={() => navigate('resources')}>查看全部<ArrowRight size={15} /></button></div>
        <div className="platform-list">{Object.entries(snapshot.summary.platforms).map(([platform, count]) => <div key={platform} className="platform-row"><PlatformIcon platform={platform} /><span>{platformLabel(platform)}</span><div className="mini-bar"><span style={{ width: `${Math.max(8, Number(count) / snapshot.summary.resources * 100)}%` }} /></div><strong>{count}</strong></div>)}</div>
      </section>
      <section className="panel"><div className="panel-heading"><div><h3>资源分组</h3><p>按用途聚合相似配置</p></div></div>
        <div className="group-list">{snapshot.groups?.groups.slice(0, 4).map((group) => <div className="group-row" key={group.label}><span>{group.label || '相关资源'}</span><div>{group.skills.slice(0, 3).map((skill) => <code key={skill.sourcePath}>{skill.name}</code>)}</div><strong>{group.skills.length}</strong></div>)}
          {!snapshot.groups?.groups.length && <p className="muted empty-copy">没有需要聚合的相似资源。</p>}</div>
      </section>
    </div>
  </section>;
}

function IssuesPage({ snapshot, openIssue }: { snapshot: DoctorSnapshot | null; openIssue: (issue: UiIssue) => void }) {
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

function ContextPage({ snapshot, openResource, onToggle }: { snapshot: DoctorSnapshot | null; openResource: (resource: UiResource) => void; onToggle: (item: ContextCostItem) => Promise<void> }) {
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

function ResourcesPage({ snapshot, openResource }: { snapshot: DoctorSnapshot | null; openResource: (resource: UiResource) => void }) {
  const [query, setQuery] = useState(''); const [kind, setKind] = useState('all'); const [platform, setPlatform] = useState('all'); const [scope, setScope] = useState('all');
  const resources = useMemo(() => (snapshot?.resources ?? []).filter((resource) => {
    const text = `${resource.name} ${resource.sourcePath} ${resource.description ?? ''} ${resource.triggers.join(' ')}`.toLowerCase();
    return (!query || text.includes(query.toLowerCase())) && (kind === 'all' || resource.kind === kind) && (platform === 'all' || resource.consumers.some((consumer) => consumer.platform === platform)) && (scope === 'all' || resource.consumers.some((consumer) => consumer.scope === scope));
  }), [snapshot, query, kind, platform, scope]);
  const platforms = Object.keys(snapshot?.summary.platforms ?? {});
  return <section><PageHeading title="资源清单" subtitle="统一查看 skills、rules、instructions、MCP、plugins 与 memories。"><span className="result-count">{resources.length} 个资源</span></PageHeading>
    <FilterBar query={query} setQuery={setQuery} placeholder="查找资源、路径或触发词">
      <select value={kind} onChange={(event) => setKind(event.target.value)}><option value="all">全部类型</option>{['skill','instruction','rule','prompt','agents','mcp','plugin','memory'].map((value) => <option key={value} value={value}>{resourceKindLabel(value)}</option>)}</select>
      <select value={platform} onChange={(event) => setPlatform(event.target.value)}><option value="all">全部平台</option>{platforms.map((value) => <option key={value}>{value}</option>)}</select>
      <select value={scope} onChange={(event) => setScope(event.target.value)}><option value="all">全部范围</option><option value="project">项目</option><option value="global">全局</option></select>
    </FilterBar>
    <div className="resource-table"><div className="table-head resources"><span>名称</span><span>类型</span><span>平台</span><span>范围</span><span>状态</span><span /></div>
      {resources.map((resource) => <button className="table-row resources" key={resource.id} onClick={() => openResource(resource)}><span><span className="resource-name"><code>{resource.name}</code>{resource.shared && <span className="shared-badge">共享 · {resource.consumers.length} Agent</span>}</span><small>{shortPath(resource.sourcePath)}</small></span><span>{resource.kindLabel}</span><span>{[...new Set(resource.consumers.map((consumer) => platformLabel(consumer.platform)))].join('、')}</span><span>{[...new Set(resource.consumers.map((consumer) => scopeLabel(consumer.scope)))].join('、')}</span><span><ResourceStatus status={resource.status} count={resource.issueIds.length} /></span><ArrowRight size={16} /></button>)}
      {!resources.length && <EmptyRows icon={Search} title="没有匹配的资源" />}
    </div>
  </section>;
}

function ScanPathsPage({ platforms, setToast, onSaved }: {
  platforms: Platform[];
  setToast: (message: string) => void;
  onSaved: (rescan: boolean) => Promise<void>;
}) {
  const available = platforms.filter((platform) => platform !== 'unknown');
  const [active, setActive] = useState<Platform>(available[0] ?? 'codex');
  const [sources, setSources] = useState<EffectiveScanSource[]>([]);
  const [configPath, setConfigPath] = useState('');
  const [busy, setBusy] = useState(true);
  const [localError, setLocalError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    setBusy(true);
    void getScanSources().then((payload) => {
      if (!alive) return;
      setSources(payload.sources);
      setConfigPath(payload.configPath);
      if (!payload.sources.some((entry) => entry.platform === active)) {
        setActive(payload.sources[0]?.platform ?? available[0] ?? 'codex');
      }
    }).catch((error) => setLocalError(error instanceof Error ? error.message : String(error)))
      .finally(() => { if (alive) setBusy(false); });
    return () => { alive = false; };
  }, []);

  const update = (source: EffectiveScanSource, patch: Partial<EffectiveScanSource>) => {
    setSources((current) => current.map((entry) => entry.platform === source.platform && entry.resource === source.resource && entry.id === source.id
      ? { ...entry, ...patch, origin: entry.origin === 'builtin' ? 'override' : entry.origin }
      : entry));
  };
  const add = (resource: ScanSourceResource) => {
    const id = `user-${resource}-${Date.now()}`;
    setSources((current) => [...current, {
      id, platform: active, resource, scope: 'global', path: '', resolvedPath: '', enabled: true,
      origin: 'user', status: 'missing',
      ...(resource === 'skill' ? { mode: 'recursive-dir', layout: 'skill-dirs' } : {}),
      ...(resource === 'mcp' ? { format: active === 'codex' ? 'toml' : 'json' } : {}),
    }]);
  };
  const remove = (source: EffectiveScanSource) => {
    setSources((current) => current.filter((entry) => !(entry.platform === source.platform && entry.resource === source.resource && entry.id === source.id)));
  };
  const userConfig = () => {
    const result: Record<string, AgentScanSourcesUserConfig> = {};
    for (const source of sources.filter((entry) => entry.origin !== 'builtin')) {
      const agent = result[source.platform] ?? {};
      const key = source.resource === 'skill' ? 'skills' : source.resource === 'mcp' ? 'mcp' : 'plugins';
      const { id, scope, path, enabled, format, mode, layout, skillsField, defaultSkillsDir, costOnly } = source;
      const entry = { id, scope, path, enabled, format, mode, layout, skillsField, defaultSkillsDir, costOnly };
      agent[key] = [...(agent[key] ?? []), entry];
      result[source.platform] = agent;
    }
    return result;
  };
  const save = async (rescan: boolean) => {
    setBusy(true); setLocalError(null);
    try {
      const config = userConfig();
      await validateScanSources(config);
      const result = await saveScanSources(config);
      setSources(result.sources);
      await onSaved(rescan);
      setToast(rescan ? '扫描路径已保存，正在重新体检' : '扫描路径已保存');
    } catch (error) { setLocalError(error instanceof Error ? error.message : String(error)); }
    finally { setBusy(false); }
  };
  const reset = async () => {
    if (!window.confirm(`恢复 ${platformLabel(active)} 的默认扫描路径？`)) return;
    setBusy(true); setLocalError(null);
    try {
      const result = await resetScanSources(active);
      setSources(result.sources);
      setToast(`${platformLabel(active)} 已恢复默认`);
      await onSaved(false);
    } catch (error) { setLocalError(error instanceof Error ? error.message : String(error)); }
    finally { setBusy(false); }
  };

  return <section className="scan-paths-page"><PageHeading title="扫描路径" subtitle="按 Agent 管理 Skill、MCP 与 Plugin 的扫描来源。"><code className="config-path">{shortPath(configPath)}</code></PageHeading>
    <div className="source-agent-tabs" aria-label="选择要配置的 Agent">{available.map((platform) => <button key={platform} className={active === platform ? 'active' : ''} onClick={() => setActive(platform)}><PlatformIcon platform={platform} />{platformLabel(platform)}</button>)}</div>
    <div className="scan-source-help"><Info size={17} /><span>系统默认路径即使当前不存在也会展示。项目路径相对于当前项目解析，用户路径支持 <code>~</code>。</span></div>
    {localError && <InlineNotice kind="danger" title="配置未保存" onClose={() => setLocalError(null)}>{localError}</InlineNotice>}
    {busy && sources.length === 0 ? <div className="loading-line"><LoaderCircle className="spin" size={18} />正在读取扫描路径</div> : <div className="source-groups">
      {(['skill', 'mcp', 'plugin'] as ScanSourceResource[]).map((resource) => {
        const entries = sources.filter((entry) => entry.platform === active && entry.resource === resource);
        return <section className="panel source-group" key={resource}><div className="panel-heading"><div><h3>{scanSourceLabel(resource)}</h3><p>{scanSourceDescription(resource)}</p></div><button className="button secondary compact" onClick={() => add(resource)}><Plus size={15} />添加路径</button></div>
          <div className="source-list">{entries.map((source) => <div className={`source-row ${resource} ${!source.enabled ? 'disabled' : ''}`} key={`${source.resource}:${source.id}`}>
            <label className="source-path-field"><span>路径</span><input aria-label={`${platformLabel(active)} ${scanSourceLabel(resource)}路径`} value={source.path} onChange={(event) => update(source, { path: event.target.value })} placeholder={resource === 'plugin' ? '/path/to/plugins/*/plugin.json' : '/path/to/config'} /></label>
            <label><span>范围</span><select value={source.scope} onChange={(event) => update(source, { scope: event.target.value as Scope })}><option value="global">全局</option><option value="project">项目</option></select></label>
            {resource === 'mcp' && <label><span>格式</span><select value={source.format ?? 'json'} onChange={(event) => update(source, { format: event.target.value as 'json' | 'toml' })}><option value="json">JSON</option><option value="toml">TOML</option></select></label>}
            <div className="source-meta"><StatusPill kind={sourceStatusKind(source.status)}>{sourceStatusLabel(source.status)}</StatusPill><span className={`origin-badge ${source.origin}`}>{sourceOriginLabel(source.origin)}</span></div>
            <label className="switch-label source-switch"><input type="checkbox" checked={source.enabled} onChange={(event) => update(source, { enabled: event.target.checked })} /><span />启用</label>
            {source.origin === 'user' ? <button className="icon-button danger-text" aria-label={`删除 ${source.path || '新路径'}`} onClick={() => remove(source)}><Trash2 size={16} /></button> : <span className="source-locked">{source.origin === 'builtin' ? '只读' : '已覆盖'}</span>}
            {source.resolvedPath && <code className="resolved-path" title={source.resolvedPath}>{source.resolvedPath}</code>}
          </div>)}{entries.length === 0 && <div className="empty-source"><span>该 Agent 暂无内置 {scanSourceLabel(resource)} 配置。</span><button onClick={() => add(resource)}>添加第一个路径</button></div>}</div>
        </section>;
      })}
    </div>}
    <div className="scan-path-actions"><button className="button secondary" onClick={() => void reset()} disabled={busy}><RotateCcw size={16} />恢复当前 Agent 默认</button><span /><button className="button secondary" onClick={() => void save(false)} disabled={busy}><Save size={16} />保存</button><button className="button primary" onClick={() => void save(true)} disabled={busy}>{busy ? <LoaderCircle className="spin" size={16} /> : <RefreshCw size={16} />}保存并重新体检</button></div>
  </section>;
}

function scanSourceLabel(resource: ScanSourceResource): string {
  return resource === 'skill' ? 'Skill 路径' : resource === 'mcp' ? 'MCP 配置文件' : 'Plugin 路径';
}
function scanSourceDescription(resource: ScanSourceResource): string {
  return resource === 'skill' ? 'Skill 目录、规则或指令文件' : resource === 'mcp' ? '包含 MCP server 定义的 JSON 或 TOML 文件' : 'Plugin manifest 路径，支持 * 通配符';
}
function sourceStatusLabel(status: EffectiveScanSource['status']): string {
  return status === 'exists' ? '存在' : status === 'missing' ? '不存在' : status === 'unreadable' ? '无权限' : '类型错误';
}
function sourceStatusKind(status: EffectiveScanSource['status']): 'success' | 'warning' | 'danger' {
  return status === 'exists' ? 'success' : status === 'missing' ? 'warning' : 'danger';
}
function sourceOriginLabel(origin: EffectiveScanSource['origin']): string {
  return origin === 'builtin' ? '系统默认' : origin === 'override' ? '用户覆盖' : '用户添加';
}

function ManagePage({ bootstrap, snapshot, onChanged, setToast }: { bootstrap: BootstrapPayload | null; snapshot: DoctorSnapshot | null; onChanged: () => void; setToast: (message: string) => void }) {
  const [sourceType, setSourceType] = useState<'local' | 'marketplace'>('local'); const [source, setSource] = useState(''); const [target, setTarget] = useState('claude'); const [link, setLink] = useState(false); const [busy, setBusy] = useState(false); const [localError, setLocalError] = useState<string | null>(null);
  const submit = async () => { setBusy(true); setLocalError(null); try { const result = await installSkill({ source, sourceType, target, link }); setToast(`已安装 ${result.name}`); setSource(''); onChanged(); } catch (error) { setLocalError(error instanceof Error ? error.message : String(error)); } finally { setBusy(false); } };
  return <section><PageHeading title="管理与导出" subtitle="安装受信任的 skill、管理已登记资源并导出报告。"><a className="button secondary" href="/api/export/dashboard" download><Download size={16} />导出报告</a></PageHeading>
    <div className="manage-grid"><section className="panel install-panel"><div className="panel-heading"><div><h3>安装 Skill</h3><p>支持本地路径或 skills.sh slug</p></div><PackagePlus size={20} /></div>
      <div className="segmented"><button className={sourceType === 'local' ? 'active' : ''} onClick={() => setSourceType('local')}>本地文件</button><button className={sourceType === 'marketplace' ? 'active' : ''} onClick={() => setSourceType('marketplace')}>Marketplace</button></div>
      <label className="field"><span>{sourceType === 'local' ? 'SKILL.md 或目录路径' : 'Skill slug'}</span><input value={source} onChange={(event) => setSource(event.target.value)} placeholder={sourceType === 'local' ? '/path/to/my-skill' : 'owner/skill-name'} /></label>
      <label className="field"><span>安装到</span><select value={target} onChange={(event) => setTarget(event.target.value)}>{bootstrap?.supportedPlatforms.filter((value) => value !== 'unknown').map((value) => <option key={value}>{value}</option>)}</select></label>
      {sourceType === 'local' && <label className="check-row"><input type="checkbox" checked={link} onChange={(event) => setLink(event.target.checked)} />使用符号链接，便于同步本地修改</label>}
      {localError && <p className="form-error">{localError}</p>}
      <button className="button primary full" disabled={!source.trim() || busy} onClick={() => void submit()}>{busy ? <LoaderCircle className="spin" size={17} /> : <PackagePlus size={17} />}安装</button>
    </section>
    <section className="panel"><div className="panel-heading"><div><h3>扫描与报告</h3><p>保留本地诊断结果用于分享</p></div><FileCode2 size={20} /></div><div className="action-list"><div><span>静态 HTML 报告</span><small>包含资源、冲突、安全和清理建议</small></div><a className="button secondary" href="/api/export/dashboard" download>下载</a><div><span>当前快照</span><small>{snapshot ? `${snapshot.summary.resources} 个资源 · ${snapshot.summary.issues} 个问题` : '尚未扫描'}</small></div><span className="muted">{snapshot ? new Date(snapshot.generatedAt).toLocaleString() : '—'}</span></div></section></div>
    <section className="panel registry-panel"><div className="panel-heading"><div><h3>已登记安装</h3><p>通过 Skill Doctor 安装的全局 skills</p></div><span className="result-count">{bootstrap?.registry.length ?? 0}</span></div>
      <div className="registry-list">{bootstrap?.registry.map((entry) => <div className="registry-row" key={`${entry.platform}:${entry.name}`}><div><code>{entry.name}</code><small>{entry.platform} · {entry.source} · {shortPath(entry.installedPath)}</small></div><button className="button danger compact" onClick={async () => { if (!window.confirm(`确认卸载 ${entry.name}？`)) return; try { await uninstallSkill({ name: entry.name, platform: entry.platform, force: false }); setToast(`已卸载 ${entry.name}`); onChanged(); } catch (error) { if (window.confirm(`${error instanceof Error ? error.message : error}\n是否强制卸载？`)) { await uninstallSkill({ name: entry.name, platform: entry.platform, force: true }); setToast(`已强制卸载 ${entry.name}`); onChanged(); } } }}><Trash2 size={15} />卸载</button></div>)}
        {!bootstrap?.registry.length && <p className="muted empty-copy">还没有通过 Skill Doctor 安装的资源。</p>}</div>
    </section>
  </section>;
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
  const [projectDir, setProjectDir] = useState(options.projectDir || bootstrap.projectDir);
  const [busy, setBusy] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const recommend = (nextAgents: DetectedAgent[]) => {
    const projectAgents = nextAgents.filter((agent) => agent.recommended);
    const platform = projectAgents.length === 1 ? projectAgents[0].platform : 'all';
    setOptions((current) => ({ ...current, projectDir, platform }));
  };
  useEffect(() => { recommend(agents); }, []);
  const redetect = async () => {
    setBusy(true); setLocalError(null);
    try { const nextAgents = await detect(projectDir); recommend(nextAgents); }
    catch (error) { setLocalError(error instanceof Error ? error.message : String(error)); }
    finally { setBusy(false); }
  };
  const submit = async () => {
    setBusy(true); setLocalError(null);
    try {
      const nextAgents = await detect(projectDir);
      const available = new Set(nextAgents.map((agent) => agent.platform));
      const projectAgents = nextAgents.filter((agent) => agent.recommended);
      const platform = options.platform !== 'all' && available.has(options.platform)
        ? options.platform
        : projectAgents.length === 1 ? projectAgents[0].platform : 'all';
      start({ ...options, projectDir, platform });
    } catch (error) { setLocalError(error instanceof Error ? error.message : String(error)); setBusy(false); }
  };
  return <div className="onboarding-backdrop"><section className="onboarding-card" aria-modal="true" role="dialog" aria-labelledby="onboarding-title">
    <header><span className="brand-mark"><Stethoscope size={22} /></span><div><span className="eyebrow">第一次体检</span><h1 id="onboarding-title">确认检查目标</h1><p>分析默认在本机完成；先确认项目与 Agent，再开始扫描。</p></div></header>
    <div className="onboarding-section"><div className="section-title"><div><strong>项目目录</strong><span>用于发现这个项目中的 AGENTS.md、skills、MCP 和其他 Agent 配置。</span></div></div><div className="path-input-row"><input value={projectDir} onChange={(event) => setProjectDir(event.target.value)} aria-label="项目目录" /><button className="button secondary" onClick={() => void redetect()} disabled={busy}>{busy ? <LoaderCircle className="spin" size={16} /> : <Search size={16} />}检测 Agent</button></div><p className="scope-help"><strong>项目配置</strong>位于该目录内；<strong>全局配置</strong>位于你的用户目录，会影响多个项目。</p></div>
    <div className="onboarding-section"><div className="section-title"><div><strong>要体检的 Agent</strong><span>优先推荐当前项目已经使用的 Agent，也可检查全部。</span></div></div><div className="agent-choice-grid"><button className={options.platform === 'all' ? 'active' : ''} onClick={() => setOptions((current) => ({ ...current, platform: 'all' }))}><Boxes size={18} /><strong>全部 Agent</strong><small>检查所有已发现配置</small></button>{agents.map((agent) => <button key={agent.platform} className={options.platform === agent.platform ? 'active' : ''} onClick={() => setOptions((current) => ({ ...current, platform: agent.platform }))}><PlatformIcon platform={agent.platform} /><strong>{agent.displayName}</strong><small>{agent.projectDetected ? '当前项目已使用 · 推荐' : '仅发现全局配置'}</small></button>)}</div>{agents.length === 0 && <p className="muted">当前目录尚未发现已知 Agent 配置；仍可选择“全部”进行完整检查。</p>}</div>
    <div className="onboarding-section"><div className="section-title"><div><strong>分析模式</strong><span>标准体检不连接外部分析服务，也不会启动本地 MCP server。</span></div></div><div className="analysis-choice"><button className={analysisMode === 'standard' ? 'active' : ''} onClick={() => setAnalysisMode('standard')}><ShieldCheck size={19} /><span><strong>标准体检</strong><small>静态安全、关键词冲突、上下文成本</small></span></button><button className={analysisMode === 'deep' ? 'active' : ''} disabled={!bootstrap.capabilities.aiAuditConfigured && !bootstrap.capabilities.embeddingConfigured} onClick={() => setAnalysisMode('deep')}><Sparkles size={19} /><span><strong>深度体检</strong><small>{bootstrap.capabilities.aiAuditConfigured || bootstrap.capabilities.embeddingConfigured ? '使用已配置的语义或 AI 分析能力' : '尚未配置分析服务'}</small></span></button></div></div>
    {localError && <p className="form-error onboarding-error">{localError}</p>}
    <footer><div><ShieldCheck size={16} /><span>Skill 内容默认不会上传；深度体检仅使用你配置的服务。</span></div><button className="button primary" onClick={() => void submit()} disabled={busy || !projectDir.trim()}>{busy ? <LoaderCircle className="spin" size={17} /> : <Stethoscope size={17} />}开始体检</button></footer>
  </section></div>;
}

function SettingsDrawer({ options, setOptions, capabilities, close, apply }: { options: ScanRequest; setOptions: (value: ScanRequest) => void; capabilities?: BootstrapPayload['capabilities']; close: () => void; apply: () => void }) {
  return <Drawer title="体检设置" subtitle="控制分析深度、范围和成本预算" close={close}><div className="drawer-section"><h4>平台与范围</h4><label className="field"><span>平台</span><select value={options.platform} onChange={(event) => setOptions({ ...options, platform: event.target.value as ScanRequest['platform'] })}><option value="all">全部平台</option>{['claude','cursor','copilot','codex','gemini','windsurf','trae','opencode','kiro','openclaw','hermes'].map((value) => <option key={value}>{value}</option>)}</select></label></div>
    <div className="drawer-section"><h4>分析能力</h4><SettingSwitch label="上下文成本" description="计算固定与按需 token 成本" checked={options.includeContext} onChange={(checked) => setOptions({ ...options, includeContext: checked })} /><SettingSwitch label="显示已禁用资源" description="不计入总成本，单独展示" checked={options.includeDisabled} onChange={(checked) => setOptions({ ...options, includeDisabled: checked })} /><SettingSwitch label="盘点 Codex 插件缓存" description="仅展示 UI 可见条目，不计入上下文" checked={options.includeCache} onChange={(checked) => setOptions({ ...options, includeCache: checked })} /><SettingSwitch label="连接 MCP 获取工具列表" description="可能启动本地 stdio server，仅对可信配置开启" checked={options.discoverMcpTools} onChange={(checked) => setOptions({ ...options, discoverMcpTools: checked })} /></div>
    <div className="drawer-section"><h4>深度分析</h4><label className="field"><span>冲突检测 <HelpTip label="冲突检测" text="关键词分析完全在本机完成；语义向量分析会调用你配置的 embedding 服务，通常更慢但能发现措辞不同的相似能力。" /></span><select value={options.conflictStrategy} onChange={(event) => setOptions({ ...options, conflictStrategy: event.target.value as ScanRequest['conflictStrategy'] })}><option value="token">快速关键词分析</option><option value="embedding" disabled={!capabilities?.embeddingConfigured}>语义向量分析{!capabilities?.embeddingConfigured ? '（未配置）' : ''}</option></select></label><SettingSwitch label="AI 安全审计" description={capabilities?.aiAuditConfigured ? '使用已配置的 analysis 服务' : '未配置 analysis 服务'} checked={options.useAiAudit} disabled={!capabilities?.aiAuditConfigured} onChange={(checked) => setOptions({ ...options, useAiAudit: checked })} /><SettingSwitch label="AI 分析冲突边界" description="为冲突生成重叠区域和边界解释" checked={options.analyzeConflicts} disabled={!capabilities?.aiAuditConfigured} onChange={(checked) => setOptions({ ...options, analyzeConflicts: checked })} /></div>
    <div className="drawer-section"><h4>成本预算</h4><label className="field"><span>每轮预算（tokens） <HelpTip label="每轮预算" text="用于判断固定上下文是否过高，不会限制 Agent 实际可用的上下文窗口。" /></span><input type="number" min="100" value={options.budgetTokens} onChange={(event) => setOptions({ ...options, budgetTokens: Number(event.target.value) || 2000 })} /></label><label className="field"><span>Tokenizer <HelpTip label="Tokenizer" text="OpenAI tokenizer 提供更准确的估算；近似估算使用字符数推算，适合快速比较但误差更大。" /></span><select value={options.tokenizer} onChange={(event) => setOptions({ ...options, tokenizer: event.target.value as ScanRequest['tokenizer'] })}><option value="openai">OpenAI tokenizer</option><option value="approx">近似估算</option></select></label></div>
    <div className="drawer-actions"><button className="button secondary" onClick={close}>取消</button><button className="button primary" onClick={apply}>保存并重新体检</button></div>
  </Drawer>;
}

function IssueDrawer({ issue, snapshot, close, openResource, compare, cleaned, setToast }: { issue: UiIssue; snapshot: DoctorSnapshot | null; close: () => void; openResource: (id: string) => void; compare: (a: string, b: string) => void; cleaned: () => void; setToast: (message: string) => void }) {
  const [removePath, setRemovePath] = useState(issue.cleanup?.removePath ?? issue.evidence.find((entry) => entry.path)?.path ?? ''); const [confirmation, setConfirmation] = useState(''); const [busy, setBusy] = useState(false);
  return <Drawer title={issue.title} subtitle={`${kindLabel(issue.kind)} · ${severityLabel(issue.severity)}`} close={close}><div className="issue-hero"><SeverityBadge severity={issue.severity} /><p>{issue.summary}</p></div>
    <div className="drawer-section"><h4>受影响资源</h4><div className="linked-resources">{issue.resourceIds.map((id, index) => <button key={id} onClick={() => openResource(id)}><code>{issue.resourceNames[index] ?? id}</code><ArrowRight size={15} /></button>)}</div></div>
    <div className="drawer-section"><h4>证据</h4><div className="evidence-list">{issue.evidence.map((evidence, index) => <div key={`${evidence.label}:${index}`}><span>{evidence.label}</span><code>{evidence.value || '—'}</code>{evidence.path && <button className="copy-button" onClick={() => void copyText(evidence.path!, setToast)}><Clipboard size={14} />复制路径</button>}</div>)}</div></div>
    {issue.recommendation && <div className="recommendation"><Sparkles size={18} /><div><strong>处理建议</strong><p>{issue.recommendation}</p></div></div>}
    {issue.kind === 'conflict' && issue.resourceIds.length === 2 && <button className="button secondary full" onClick={() => compare(issue.resourceIds[0], issue.resourceIds[1])}><GitCompareArrows size={16} />并排对比两个资源</button>}
    {issue.kind === 'duplicate' && <div className="drawer-section destructive-zone"><h4>删除重复副本</h4><p>此操作会删除所选 skill 目录或文件，无法在 Skill Doctor 中撤销。</p><label className="field"><span>删除路径</span><select value={removePath} onChange={(event) => { setRemovePath(event.target.value); setConfirmation(''); }}>{issue.evidence.filter((entry) => entry.path).map((entry) => <option key={entry.path} value={entry.path}>{entry.path}</option>)}</select></label><label className="field"><span>输入完整路径确认</span><input value={confirmation} onChange={(event) => setConfirmation(event.target.value)} placeholder={removePath} /></label><button className="button danger full" disabled={busy || confirmation !== removePath} onClick={async () => { setBusy(true); try { await cleanupDuplicate(issue.id, removePath, confirmation); setToast('重复副本已删除'); cleaned(); } catch (error) { setToast(error instanceof Error ? error.message : String(error)); } finally { setBusy(false); } }}><Trash2 size={16} />确认删除并重新体检</button></div>}
  </Drawer>;
}

function ResourceDrawer({ resource, detail, close, openIssue }: { resource: UiResource; detail: ResourceDetailPayload | null; close: () => void; openIssue: (issue: UiIssue) => void }) {
  return <Drawer title={resource.name} subtitle={`${resource.kindLabel} · ${resource.shared ? `${resource.consumers.length} 个 Agent 共享` : platformLabel(resource.platform)} · ${scopeLabel(resource.scope)}`} close={close}>
    <div className="resource-hero"><div><ResourceStatus status={resource.status} count={resource.issueIds.length} />{resource.shared && <span className="shared-badge">共享资源</span>}</div><p>{resource.description || resource.recommendation || '暂无描述'}</p></div>
    <div className="detail-grid"><Detail label="激活方式" value={activationLabel(resource.activation)} /><Detail label="固定成本" value={`${resource.fixedTokens} tokens`} /><Detail label="按需成本" value={`${resource.activationTokens} tokens`} /><Detail label="可控制" value={resource.controllable ? '支持' : '只读'} /></div>
    {resource.shared && <div className="drawer-section"><h4>使用这个资源的 Agent</h4><p className="shared-impact">修改这个文件会同时影响以下 {resource.consumers.length} 个 Agent。</p><div className="consumer-list">{resource.consumers.map((consumer) => <div key={`${consumer.platform}:${consumer.scope}`}><PlatformIcon platform={consumer.platform} /><span><strong>{platformLabel(consumer.platform)}</strong><small>{scopeLabel(consumer.scope)} · {activationLabel(consumer.activation)}{consumer.enabled === false ? ' · 已禁用' : ''}</small></span><code>{consumer.fixedTokens + consumer.activationTokens} tokens</code></div>)}</div></div>}
    <div className="drawer-section"><h4>来源</h4><div className="path-box"><code>{resource.sourcePath}</code><button onClick={() => void navigator.clipboard.writeText(resource.sourcePath)}><Clipboard size={14} /></button></div>{resource.installSource && <Detail label="安装来源" value={resource.installSource} />}{resource.repository && <Detail label="仓库" value={resource.repository} />}{resource.author && <Detail label="作者" value={resource.author} />}</div>
    <div className="drawer-section"><h4>触发词与入口</h4><div className="tag-list">{resource.triggers.length ? resource.triggers.map((trigger) => <span key={trigger}>{trigger}</span>) : <span className="muted">没有可用触发信息</span>}</div></div>
    <div className="drawer-section"><h4>关联问题</h4>{detail ? <div className="linked-issues">{detail.issues.map((issue) => <button key={issue.id} onClick={() => openIssue(issue)}><SeverityBadge severity={issue.severity} /><span>{issue.title}</span><ArrowRight size={15} /></button>)}{!detail.issues.length && <p className="muted">没有关联问题。</p>}</div> : <LoadingLine />}</div>
    {detail?.skill?.relatedSkills?.length ? <div className="drawer-section"><h4>相关 Skills</h4><div className="related-list">{detail.skill.relatedSkills.map((related) => <div key={related.name}><code>{related.name}</code><span>{Math.round(related.similarity * 100)}% 相似</span></div>)}</div></div> : null}
  </Drawer>;
}

function CompareDialog({ state, snapshot, setState, close }: { state: { leftId: string; rightId: string; result?: DiffResult; loading?: boolean }; snapshot: DoctorSnapshot | null; setState: (value: typeof state) => void; close: () => void }) {
  useEffect(() => { if (state.result || state.loading) return; setState({ ...state, loading: true }); void compareResources(state.leftId, state.rightId).then((result) => setState({ ...state, result, loading: false })).catch(() => setState({ ...state, loading: false })); }, [state, setState]);
  const left = snapshot?.resources.find((entry) => entry.id === state.leftId); const right = snapshot?.resources.find((entry) => entry.id === state.rightId);
  return <div className="modal-backdrop" role="presentation"><section className="compare-dialog" role="dialog" aria-modal="true"><header><div><span className="eyebrow">资源对比</span><h2>{left?.name} <span>vs</span> {right?.name}</h2></div><button className="icon-button" onClick={close}><X size={19} /></button></header>{state.loading && <div className="dialog-loading"><LoaderCircle className="spin" />正在整理差异…</div>}{state.result && <div className="compare-grid"><CompareColumn title={state.result.skillA.name} profile={state.result.skillA} /><CompareColumn title={state.result.skillB.name} profile={state.result.skillB} /></div>}</section></div>;
}

function CompareColumn({ title, profile }: { title: string; profile: DiffResult['skillA'] }) { return <article><h3>{title}</h3><p>{profile.description}</p><h4>适用场景</h4><p>{profile.whenToUse || '未声明'}</p><h4>触发词</h4><div className="tag-list">{profile.triggers.map((trigger) => <span key={trigger}>{trigger}</span>)}</div><h4>流程项</h4><ul>{profile.checklistItems.map((item) => <li key={item}>{item}</li>)}{!profile.checklistItems.length && <li className="muted">未提取到流程清单</li>}</ul></article>; }

function Drawer({ title, subtitle, close, children }: { title: string; subtitle?: string; close: () => void; children: ReactNode }) { return <div className="drawer-backdrop" onMouseDown={(event) => event.target === event.currentTarget && close()}><aside className="drawer" role="dialog" aria-modal="true"><header><div><span className="eyebrow">{subtitle}</span><h2>{title}</h2></div><button className="icon-button" onClick={close} aria-label="关闭"><X size={19} /></button></header><div className="drawer-body">{children}</div></aside></div>; }
function PageHeading({ title, subtitle, children }: { title: string; subtitle: string; children?: ReactNode }) { return <div className="page-heading"><div><h1>{title}</h1><p>{subtitle}</p></div>{children && <div className="heading-action">{children}</div>}</div>; }
function StatCard({ label, value, detail }: { label: string; value: string | number; detail: string }) { return <div className="stat-card"><span>{label}</span><strong>{Number(value).toLocaleString()}</strong><small>{detail}</small></div>; }
function IssueCard({ issue, open }: { issue: UiIssue; open: () => void }) { const Icon = issue.kind === 'security' ? ShieldCheck : issue.kind === 'context' ? BarChart3 : GitCompareArrows; return <button className="issue-card" onClick={open}><span className={`issue-icon ${issue.severity}`}><Icon size={20} /></span><span className="issue-copy"><strong>{issue.title}</strong><small>{issue.summary}</small><span>{issue.resourceNames.join(' ↔ ')}</span></span><SeverityBadge severity={issue.severity} /><ArrowRight size={17} /></button>; }
function SeverityBadge({ severity }: { severity: UiIssue['severity'] }) { return <span className={`severity ${severity}`}>{severityLabel(severity)}</span>; }
function StatusPill({ kind, children }: { kind: 'success' | 'warning' | 'danger'; children: React.ReactNode }) { return <span className={`status-pill ${kind}`}>{kind === 'success' ? <Check size={14} /> : <AlertTriangle size={14} />}{children}</span>; }
function ResourceStatus({ status, count }: { status: UiResource['status']; count: number }) { return <span className={`resource-status ${status}`}>{status === 'attention' ? `${count} 项需处理` : status === 'disabled' ? '已禁用' : status === 'unknown' ? '未知' : '正常'}</span>; }
function FilterBar({ query, setQuery, placeholder, children }: { query: string; setQuery: (value: string) => void; placeholder: string; children: ReactNode }) { return <div className="filter-bar"><label className="search-input"><Search size={17} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={placeholder} /></label><div className="filter-selects"><Filter size={15} />{children}</div></div>; }
function InlineNotice({ kind, title, children, onClose }: { kind: 'danger' | 'warning'; title: string; children: ReactNode; onClose?: () => void }) { return <div className={`inline-notice ${kind}`}><AlertTriangle size={17} /><div><strong>{title}</strong><span>{children}</span></div>{onClose && <button onClick={onClose}><X size={15} /></button>}</div>; }
function SettingSwitch({ label, description, checked, disabled, onChange }: { label: string; description: string; checked: boolean; disabled?: boolean; onChange: (value: boolean) => void }) { return <label className={`setting-switch ${disabled ? 'disabled' : ''}`}><div><strong>{label}</strong><span>{description}</span></div><input type="checkbox" checked={checked} disabled={disabled} onChange={(event) => onChange(event.target.checked)} /><span className="switch-track" /></label>; }
function HelpTip({ label, text }: { label: string; text: string }) { return <details className="help-tip"><summary aria-label={`解释${label}`}><CircleHelp size={14} /></summary><p>{text}</p></details>; }
function Detail({ label, value }: { label: string; value: string }) { return <div className="detail"><span>{label}</span><strong>{value}</strong></div>; }
function EmptyRows({ icon: Icon, title }: { icon: typeof Check; title: string }) { return <div className="empty-rows"><Icon size={22} /><span>{title}</span></div>; }
function LoadingLine() { return <div className="loading-line"><LoaderCircle size={16} className="spin" />正在读取详情</div>; }
function LaunchScreen() { return <div className="launch-screen"><span><Stethoscope size={30} /></span><h1>Skill Doctor</h1><p>正在启动本地配置体检台…</p><LoaderCircle className="spin" /></div>; }
function ScanningEmpty({ running }: { running: boolean }) { return <div className="scanning-empty"><span>{running ? <LoaderCircle className="spin" /> : <CircleHelp />}</span><h2>{running ? '正在检查 Agent 配置' : '尚未生成体检结果'}</h2><p>{running ? '正在发现资源、分析冲突、安全风险和上下文成本。' : '点击重新体检开始。'}</p></div>; }
function PlatformIcon({ platform }: { platform: string }) { return <span className="platform-icon">{platform.slice(0, 1).toUpperCase()}</span>; }

function routeFromHash(): Route { const value = window.location.hash.replace(/^#\//, '') as Route; return ROUTES.some((route) => route.id === value) ? value : 'overview'; }
function loadScanOptions(): ScanRequest { return DEFAULT_SCAN; }
function loadProjectPreference(projectDir: string): Partial<ScanRequest> { try { return JSON.parse(localStorage.getItem('skill-doctor-project-preferences') ?? '{}')[projectDir] ?? {}; } catch { return {}; } }
function saveProjectPreference(options: ScanRequest): void { try { const preferences = JSON.parse(localStorage.getItem('skill-doctor-project-preferences') ?? '{}'); preferences[options.projectDir] = options; localStorage.setItem('skill-doctor-project-preferences', JSON.stringify(preferences)); } catch { /* ignore unavailable storage */ } }
function isOnboardingComplete(projectDir: string): boolean { try { return JSON.parse(localStorage.getItem('skill-doctor-onboarded-projects') ?? '{}')[projectDir] === true; } catch { return false; } }
function markOnboardingComplete(projectDir: string): void { try { const projects = JSON.parse(localStorage.getItem('skill-doctor-onboarded-projects') ?? '{}'); projects[projectDir] = true; localStorage.setItem('skill-doctor-onboarded-projects', JSON.stringify(projects)); } catch { /* ignore unavailable storage */ } }
function loadAnalysisMode(): AnalysisMode { const value = localStorage.getItem('skill-doctor-analysis-mode'); return value === 'deep' || value === 'custom' ? value : 'standard'; }
function optionsForAnalysisMode(options: ScanRequest, mode: Exclude<AnalysisMode, 'custom'>, capabilities?: BootstrapPayload['capabilities']): ScanRequest {
  if (mode === 'standard') return { ...options, includeContext: true, discoverMcpTools: false, useAiAudit: false, conflictStrategy: 'token', analyzeConflicts: false };
  return { ...options, includeContext: true, discoverMcpTools: false, useAiAudit: capabilities?.aiAuditConfigured === true, conflictStrategy: capabilities?.embeddingConfigured ? 'embedding' : 'token', analyzeConflicts: capabilities?.aiAuditConfigured === true };
}
function severityLabel(value: UiIssue['severity']): string { return ({ high: '高风险', med: '中风险', low: '低风险', info: '提示' } as const)[value]; }
function kindLabel(value: UiIssue['kind']): string { return ({ security: '安全', conflict: '冲突', duplicate: '重复', context: '上下文' } as const)[value]; }
function scopeLabel(value: Scope): string { return value === 'project' ? '项目' : '全局'; }
function platformLabel(value: string): string { return ({ claude: 'Claude', cursor: 'Cursor', copilot: 'Copilot', codex: 'Codex', gemini: 'Gemini', windsurf: 'Windsurf', opencode: 'OpenCode', openclaw: 'OpenClaw' } as Record<string, string>)[value] ?? value; }
function resourceKindLabel(value: string): string { return ({ skill: 'Skill', instruction: 'Instruction', rule: 'Rule', prompt: 'Prompt', agents: 'AGENTS.md', mcp: 'MCP', plugin: 'Plugin', memory: 'Memory' } as Record<string, string>)[value] ?? value; }
function activationLabel(value?: string): string { return ({ startup: '启动加载', 'always-on': '每轮固定', 'on-demand': '按需激活', 'file-scoped': '文件范围', manual: '手动' } as Record<string, string>)[value ?? ''] ?? '未知'; }
function shortPath(path: string): string { if (!path) return ''; const home = path.match(/^\/Users\/[^/]+|^\/home\/[^/]+/)?.[0]; return home ? path.replace(home, '~') : path; }
async function copyText(text: string, setToast: (message: string) => void) { await navigator.clipboard.writeText(text); setToast('已复制'); }
