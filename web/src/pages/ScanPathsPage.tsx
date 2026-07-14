import { Info, LoaderCircle, Plus, RefreshCw, RotateCcw, Save, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import type { AgentScanSourcesUserConfig, ScanSourceResource } from '../../../src/config/loadUserConfig';
import type { EffectiveScanSource } from '../../../src/config/scanSources';
import type { Platform, Scope } from '../../../src/types/skill';
import { getScanSources, resetScanSources, saveScanSources, validateScanSources } from '../api';
import { InlineNotice, PageHeading, PlatformIcon, StatusPill, platformLabel, shortPath } from '../components/ui';

export function ScanPathsPage({ platforms, setToast, onSaved }: { platforms: Platform[]; setToast: (message: string) => void; onSaved: (rescan: boolean) => Promise<void> }) {
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
      if (!payload.sources.some((entry) => entry.platform === active)) setActive(payload.sources[0]?.platform ?? available[0] ?? 'codex');
    }).catch((error) => setLocalError(error instanceof Error ? error.message : String(error))).finally(() => { if (alive) setBusy(false); });
    return () => { alive = false; };
  }, []);

  const update = (source: EffectiveScanSource, patch: Partial<EffectiveScanSource>) => setSources((current) => current.map((entry) => entry.platform === source.platform && entry.resource === source.resource && entry.id === source.id ? { ...entry, ...patch, origin: entry.origin === 'builtin' ? 'override' : entry.origin } : entry));
  const add = (resource: ScanSourceResource) => setSources((current) => [...current, { id: `user-${resource}-${Date.now()}`, platform: active, resource, scope: 'global', path: '', resolvedPath: '', enabled: true, origin: 'user', status: 'missing', ...(resource === 'skill' ? { mode: 'recursive-dir', layout: 'skill-dirs' } : {}), ...(resource === 'mcp' ? { format: active === 'codex' ? 'toml' : 'json' } : {}) }]);
  const remove = (source: EffectiveScanSource) => setSources((current) => current.filter((entry) => !(entry.platform === source.platform && entry.resource === source.resource && entry.id === source.id)));
  const userConfig = () => {
    const result: Record<string, AgentScanSourcesUserConfig> = {};
    for (const source of sources.filter((entry) => entry.origin !== 'builtin')) {
      const agent = result[source.platform] ?? {};
      const key = source.resource === 'skill' ? 'skills' : source.resource === 'mcp' ? 'mcp' : 'plugins';
      const { id, scope, path, enabled, format, mode, layout, skillsField, defaultSkillsDir, costOnly } = source;
      agent[key] = [...(agent[key] ?? []), { id, scope, path, enabled, format, mode, layout, skillsField, defaultSkillsDir, costOnly }];
      result[source.platform] = agent;
    }
    return result;
  };
  const save = async (rescan: boolean) => { setBusy(true); setLocalError(null); try { const config = userConfig(); await validateScanSources(config); const result = await saveScanSources(config); setSources(result.sources); await onSaved(rescan); setToast(rescan ? '扫描路径已保存，正在重新体检' : '扫描路径已保存'); } catch (error) { setLocalError(error instanceof Error ? error.message : String(error)); } finally { setBusy(false); } };
  const reset = async () => { if (!window.confirm(`恢复 ${platformLabel(active)} 的默认扫描路径？`)) return; setBusy(true); setLocalError(null); try { const result = await resetScanSources(active); setSources(result.sources); setToast(`${platformLabel(active)} 已恢复默认`); await onSaved(false); } catch (error) { setLocalError(error instanceof Error ? error.message : String(error)); } finally { setBusy(false); } };

  return <section className="scan-paths-page"><PageHeading title="扫描路径" subtitle="按 Agent 管理 Skill、MCP 与 Plugin 的扫描来源。"><code className="config-path">{shortPath(configPath)}</code></PageHeading>
    <div className="source-agent-tabs" aria-label="选择要配置的 Agent">{available.map((platform) => <button key={platform} className={active === platform ? 'active' : ''} onClick={() => setActive(platform)}><PlatformIcon platform={platform} />{platformLabel(platform)}</button>)}</div>
    <div className="scan-source-help"><Info size={17} /><span>系统默认路径即使当前不存在也会展示。项目路径相对于当前项目解析，用户路径支持 <code>~</code>。</span></div>
    {localError && <InlineNotice kind="danger" title="配置未保存" onClose={() => setLocalError(null)}>{localError}</InlineNotice>}
    {busy && sources.length === 0 ? <div className="loading-line"><LoaderCircle className="spin" size={18} />正在读取扫描路径</div> : <div className="source-groups">{(['skill', 'mcp', 'plugin'] as ScanSourceResource[]).map((resource) => { const entries = sources.filter((entry) => entry.platform === active && entry.resource === resource); return <section className="panel source-group" key={resource}><div className="panel-heading"><div><h3>{scanSourceLabel(resource)}</h3><p>{scanSourceDescription(resource)}</p></div><button className="button secondary compact" onClick={() => add(resource)}><Plus size={15} />添加路径</button></div><div className="source-list">{entries.map((source) => <div className={`source-row ${resource} ${!source.enabled ? 'disabled' : ''}`} key={`${source.resource}:${source.id}`}><label className="source-path-field"><span>路径</span><input aria-label={`${platformLabel(active)} ${scanSourceLabel(resource)}路径`} value={source.path} onChange={(event) => update(source, { path: event.target.value })} placeholder={resource === 'plugin' ? '/path/to/plugins/*/plugin.json' : '/path/to/config'} /></label><label><span>范围</span><select value={source.scope} onChange={(event) => update(source, { scope: event.target.value as Scope })}><option value="global">全局</option><option value="project">项目</option></select></label>{resource === 'mcp' && <label><span>格式</span><select value={source.format ?? 'json'} onChange={(event) => update(source, { format: event.target.value as 'json' | 'toml' })}><option value="json">JSON</option><option value="toml">TOML</option></select></label>}<div className="source-meta"><StatusPill kind={sourceStatusKind(source.status)}>{sourceStatusLabel(source.status)}</StatusPill><span className={`origin-badge ${source.origin}`}>{sourceOriginLabel(source.origin)}</span></div><label className="switch-label source-switch"><input type="checkbox" checked={source.enabled} onChange={(event) => update(source, { enabled: event.target.checked })} /><span />启用</label>{source.origin === 'user' ? <button className="icon-button danger-text" aria-label={`删除 ${source.path || '新路径'}`} onClick={() => remove(source)}><Trash2 size={16} /></button> : <span className="source-locked">{source.origin === 'builtin' ? '只读' : '已覆盖'}</span>}{source.resolvedPath && <code className="resolved-path" title={source.resolvedPath}>{source.resolvedPath}</code>}</div>)}{entries.length === 0 && <div className="empty-source"><span>该 Agent 暂无内置 {scanSourceLabel(resource)} 配置。</span><button onClick={() => add(resource)}>添加第一个路径</button></div>}</div></section>; })}</div>}
    <div className="scan-path-actions"><button className="button secondary" onClick={() => void reset()} disabled={busy}><RotateCcw size={16} />恢复当前 Agent 默认</button><span /><button className="button secondary" onClick={() => void save(false)} disabled={busy}><Save size={16} />保存</button><button className="button primary" onClick={() => void save(true)} disabled={busy}>{busy ? <LoaderCircle className="spin" size={16} /> : <RefreshCw size={16} />}保存并重新体检</button></div>
  </section>;
}

function scanSourceLabel(resource: ScanSourceResource): string { return resource === 'skill' ? 'Skill 路径' : resource === 'mcp' ? 'MCP 配置文件' : 'Plugin 路径'; }
function scanSourceDescription(resource: ScanSourceResource): string { return resource === 'skill' ? 'Skill 目录、规则或指令文件' : resource === 'mcp' ? '包含 MCP server 定义的 JSON 或 TOML 文件' : 'Plugin manifest 路径，支持 * 通配符'; }
function sourceStatusLabel(status: EffectiveScanSource['status']): string { return status === 'exists' ? '存在' : status === 'missing' ? '不存在' : status === 'unreadable' ? '无权限' : '类型错误'; }
function sourceStatusKind(status: EffectiveScanSource['status']): 'success' | 'warning' | 'danger' { return status === 'exists' ? 'success' : status === 'missing' ? 'warning' : 'danger'; }
function sourceOriginLabel(origin: EffectiveScanSource['origin']): string { return origin === 'builtin' ? '系统默认' : origin === 'override' ? '用户覆盖' : '用户添加'; }
