import { Info, LoaderCircle, Plus, RefreshCw, RotateCcw, Save, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import type { AgentScanSourcesUserConfig, ScanSourceResource } from '../../../src/config/loadUserConfig';
import type { EffectiveScanSource } from '../../../src/config/scanSources';
import type { Platform, Scope } from '../../../src/types/skill';
import { getScanSources, resetScanSources, saveScanSources, validateScanSources } from '../api';
import { InlineNotice, PageHeading, PlatformIcon, StatusPill, platformLabel, shortPath } from '../components/ui';
import { useTranslation } from '../i18n';

export function ScanPathsPage({ platforms, setToast, onSaved }: { platforms: Platform[]; setToast: (message: string) => void; onSaved: (rescan: boolean) => Promise<void> }) {
  const { t } = useTranslation();
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
  const save = async (rescan: boolean) => { setBusy(true); setLocalError(null); try { const config = userConfig(); await validateScanSources(config); const result = await saveScanSources(config); setSources(result.sources); await onSaved(rescan); setToast(rescan ? t('scanPaths.saveRescan') : t('scanPaths.save')); } catch (error) { setLocalError(error instanceof Error ? error.message : String(error)); } finally { setBusy(false); } };
  const reset = async () => { if (!window.confirm(t('scanPaths.restore'))) return; setBusy(true); setLocalError(null); try { const result = await resetScanSources(active); setSources(result.sources); setToast(t('scanPaths.restore')); await onSaved(false); } catch (error) { setLocalError(error instanceof Error ? error.message : String(error)); } finally { setBusy(false); } };

  const resourceKey = (resource: ScanSourceResource) => resource === 'skill' ? 'scanPaths.skill' : resource === 'mcp' ? 'scanPaths.mcp' : 'scanPaths.plugin';
  const descriptionKey = (resource: ScanSourceResource) => resource === 'skill' ? 'scanPaths.skillDescription' : resource === 'mcp' ? 'scanPaths.mcpDescription' : 'scanPaths.pluginDescription';

  return <section className="scan-paths-page"><PageHeading title={t('scanPaths.title')} subtitle={t('scanPaths.subtitle')}><code className="config-path">{shortPath(configPath)}</code></PageHeading>
    <div className="source-agent-tabs" aria-label={t('topbar.agents')}>{available.map((platform) => <button key={platform} className={active === platform ? 'active' : ''} onClick={() => setActive(platform)}><PlatformIcon platform={platform} />{platformLabel(platform)}</button>)}</div>
    <div className="scan-source-help"><Info size={17} /><span>{t('scanPaths.help')}</span></div>
    {localError && <InlineNotice kind="danger" title={t('notice.incomplete')} onClose={() => setLocalError(null)}>{localError}</InlineNotice>}
    {busy && sources.length === 0 ? <div className="loading-line"><LoaderCircle className="spin" size={18} />{t('common.loading')}</div> : <div className="source-groups">{(['skill', 'mcp', 'plugin'] as ScanSourceResource[]).map((resource) => { const entries = sources.filter((entry) => entry.platform === active && entry.resource === resource); return <section className="panel source-group" key={resource}><div className="panel-heading"><div><h3>{t(resourceKey(resource))}</h3><p>{t(descriptionKey(resource))}</p></div><button className="button secondary compact" onClick={() => add(resource)}><Plus size={15} />{t('scanPaths.add')}</button></div><div className="source-list">{entries.map((source) => <div className={`source-row ${resource} ${!source.enabled ? 'disabled' : ''}`} key={`${source.resource}:${source.id}`}><label className="source-path-field"><span>{t('scanPaths.path')}</span><input aria-label={`${platformLabel(active)} ${t(resourceKey(resource))}`} value={source.path} onChange={(event) => update(source, { path: event.target.value })} placeholder={resource === 'plugin' ? '/path/to/plugins/*/plugin.json' : '/path/to/config'} /></label><label><span>{t('scanPaths.scope')}</span><select value={source.scope} onChange={(event) => update(source, { scope: event.target.value as Scope })}><option value="global">{t('label.global')}</option><option value="project">{t('label.project')}</option></select></label>{resource === 'mcp' && <label><span>{t('scanPaths.format')}</span><select value={source.format ?? 'json'} onChange={(event) => update(source, { format: event.target.value as 'json' | 'toml' })}><option value="json">JSON</option><option value="toml">TOML</option></select></label>}<div className="source-meta"><StatusPill kind={sourceStatusKind(source.status)}>{t(source.status === 'exists' ? 'scanPaths.exists' : source.status === 'missing' ? 'scanPaths.missing' : source.status === 'unreadable' ? 'scanPaths.unreadable' : 'scanPaths.invalid')}</StatusPill><span className={`origin-badge ${source.origin}`}>{t(source.origin === 'builtin' ? 'scanPaths.default' : source.origin === 'override' ? 'scanPaths.override' : 'scanPaths.user')}</span></div><label className="switch-label source-switch"><input type="checkbox" checked={source.enabled} onChange={(event) => update(source, { enabled: event.target.checked })} /><span />{t('scanPaths.enabled')}</label>{source.origin === 'user' ? <button className="icon-button danger-text" aria-label={t('scanPaths.remove', { path: source.path || t('scanPaths.newPath') })} onClick={() => remove(source)}><Trash2 size={16} /></button> : <span className="source-locked">{source.origin === 'builtin' ? t('context.readonly') : t('scanPaths.override')}</span>}{source.resolvedPath && <code className="resolved-path" title={source.resolvedPath}>{source.resolvedPath}</code>}</div>)}{entries.length === 0 && <div className="empty-source"><span>{t('scanPaths.empty', { resource: t(resourceKey(resource)) })}</span><button onClick={() => add(resource)}>{t('scanPaths.add')}</button></div>}</div></section>; })}</div>}
    <div className="scan-path-actions"><button className="button secondary" onClick={() => void reset()} disabled={busy}><RotateCcw size={16} />{t('scanPaths.restore')}</button><span /><button className="button secondary" onClick={() => void save(false)} disabled={busy}><Save size={16} />{t('scanPaths.save')}</button><button className="button primary" onClick={() => void save(true)} disabled={busy}>{busy ? <LoaderCircle className="spin" size={16} /> : <RefreshCw size={16} />}{t('scanPaths.saveRescan')}</button></div>
  </section>;
}

function sourceStatusKind(status: EffectiveScanSource['status']): 'success' | 'warning' | 'danger' { return status === 'exists' ? 'success' : status === 'missing' ? 'warning' : 'danger'; }
