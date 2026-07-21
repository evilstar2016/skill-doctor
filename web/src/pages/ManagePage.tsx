import { ArchiveRestore, Boxes, ChevronRight, Download, LoaderCircle, PackagePlus, RefreshCw, Search, Trash2, X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import type { BootstrapPayload, DoctorSnapshot } from '../../../src/application/types';
import type { CenterInstallationView, CenterPhysicalView, CenterSkillView, CenterView } from '../../../src/application/center';
import type { Platform, Scope } from '../../../src/types/skill';
import {
  getCenterSkills,
  inspectSkillSource,
  installSkill,
  pickSkillSourceDirectory,
  previewDeployment,
  commitDeployment,
  reclaimPhysicalAgentSkills,
  syncDeployment,
  uninstallDeployment,
} from '../api';
import { FilterBar, PageHeading, platformLabel, scopeLabel, shortPath } from '../components/ui';
import { useTranslation } from '../i18n';

type InstallPlatform = Exclude<Platform, 'unknown'>;

type Row =
  | { id: string; kind: 'managed'; skill: CenterSkillView }
  | { id: string; kind: 'physical'; candidate: CenterPhysicalView };

type SourceFilter = 'all' | 'managed' | 'physical' | 'local' | 'github' | 'marketplace' | 'agent-import';
type StatusFilter = 'all' | CenterInstallationView['status'];

export function ManagePage({ bootstrap, onChanged, setToast }: { bootstrap: BootstrapPayload | null; snapshot: DoctorSnapshot | null; onChanged: () => void; setToast: (message: string) => void }) {
  const { t } = useTranslation();
  const platforms = bootstrap?.supportedPlatforms.filter((value): value is InstallPlatform => value !== 'unknown') ?? [];
  const [center, setCenter] = useState<CenterView | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  const [query, setQuery] = useState('');
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>('all');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [detail, setDetail] = useState<Row | null>(null);
  const [installOpen, setInstallOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const [target, setTarget] = useState<InstallPlatform>(() => platforms[0] ?? 'claude');
  const [scope, setScope] = useState<Scope>('global');

  useEffect(() => {
    if (platforms.length > 0 && !platforms.includes(target)) setTarget(platforms[0]);
  }, [platforms, target]);

  useEffect(() => {
    let active = true;
    setLoading(true);
    void getCenterSkills().then((result) => {
      if (!active) return;
      setCenter(result);
      setError(null);
    }).catch((err) => {
      if (active) setError(err instanceof Error ? err.message : String(err));
    }).finally(() => {
      if (active) setLoading(false);
    });
    return () => { active = false; };
  }, [reloadKey]);

  const rows = useMemo<Row[]>(() => {
    if (!center) return [];
    const managed: Row[] = center.skills.map((skill) => ({ id: skill.id, kind: 'managed', skill }));
    const physical: Row[] = center.physical.map((candidate) => ({ id: candidate.id, kind: 'physical', candidate }));
    return [...managed, ...physical];
  }, [center]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((row) => {
      const name = row.kind === 'managed' ? row.skill.name : row.candidate.name;
      if (q && !name.toLowerCase().includes(q)) return false;
      if (sourceFilter === 'managed' && row.kind !== 'managed') return false;
      if (sourceFilter === 'physical' && row.kind !== 'physical') return false;
      if (sourceFilter !== 'all' && sourceFilter !== 'managed' && sourceFilter !== 'physical') {
        if (row.kind !== 'managed' || row.skill.sourceType !== sourceFilter) return false;
      }
      if (statusFilter !== 'all' && row.kind === 'managed') {
        if (!row.skill.installations.some((installation) => installation.status === statusFilter)) return false;
      }
      return true;
    });
  }, [rows, query, sourceFilter, statusFilter]);

  const selectedRows = useMemo(() => rows.filter((row) => selected.has(row.id)), [rows, selected]);
  const selectedManaged = selectedRows.filter((row): row is Extract<Row, { kind: 'managed' }> => row.kind === 'managed');
  const selectedPhysical = selectedRows.filter((row): row is Extract<Row, { kind: 'physical' }> => row.kind === 'physical');

  const reload = () => { setSelected(new Set()); setDetail(null); setReloadKey((value) => value + 1); onChanged(); };

  const toggleSelect = (id: string) => {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const reclaim = async (candidate: CenterPhysicalView) => {
    if (!center) return;
    if (!window.confirm(t('center.reclaimConfirm', { name: candidate.name }))) return;
    setBusy(true);
    try {
      const result = await reclaimPhysicalAgentSkills({
        planId: center.importPlanId,
        target: candidate.platform,
        scope: candidate.scope,
        decisions: [{ candidateId: candidate.id, action: 'replace-with-link' }],
      });
      const linked = result.outcomes.filter((outcome) => outcome.status === 'linked').length;
      if (linked > 0) setToast(t('center.reclaimed', { count: linked }));
      if (result.outcomes.some((outcome) => outcome.status === 'failed')) {
        setError(result.outcomes.filter((o) => o.status === 'failed').map((o) => o.message ?? t('center.reclaimFailed')).join('\n'));
      }
      reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const unlinkDeployment = async (installation: CenterInstallationView) => {
    if (!window.confirm(t('center.uninstallConfirm', { name: installation.installedPath }))) return;
    setBusy(true);
    try {
      await uninstallDeployment(installation.deploymentId, false);
      setToast(t('center.uninstalled'));
      reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const resync = async (installation: CenterInstallationView) => {
    setBusy(true);
    try {
      await syncDeployment(installation.deploymentId, installation.status === 'modified' || installation.status === 'conflict');
      setToast(t('center.resynced'));
      reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const bulkReclaim = async () => {
    if (!center || selectedPhysical.length === 0) return;
    if (!window.confirm(t('center.bulkReclaimConfirm', { count: selectedPhysical.length }))) return;
    setBusy(true);
    try {
      const result = await reclaimPhysicalAgentSkills({
        planId: center.importPlanId,
        target: selectedPhysical[0].candidate.platform,
        scope: selectedPhysical[0].candidate.scope,
        decisions: selectedPhysical.map((row) => ({ candidateId: row.candidate.id, action: 'replace-with-link' as const })),
      });
      const linked = result.outcomes.filter((outcome) => outcome.status === 'linked').length;
      if (linked > 0) setToast(t('center.reclaimed', { count: linked }));
      reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const bulkUninstall = async () => {
    if (selectedManaged.length === 0) return;
    if (!window.confirm(t('center.bulkUninstallConfirm', { count: selectedManaged.length }))) return;
    setBusy(true);
    try {
      for (const row of selectedManaged) {
        for (const installation of row.skill.installations) {
          await uninstallDeployment(installation.deploymentId, true);
        }
      }
      setToast(t('center.bulkUninstalled', { count: selectedManaged.length }));
      reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const bulkInstallTo = async (installTarget: InstallPlatform) => {
    if (selectedManaged.length === 0) return;
    setBusy(true);
    try {
      for (const row of selectedManaged) {
        const preview = await previewDeployment(row.skill.id, [`${installTarget}-global`], 'copy');
        await commitDeployment(row.skill.id, [`${installTarget}-global`], 'copy', preview.planId, false);
      }
      setToast(t('center.bulkInstalled', { count: selectedManaged.length, target: platformLabel(installTarget) }));
      reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  return <section>
    <PageHeading title={t('center.title')} subtitle={t('center.subtitle')}>
      <button className="button secondary compact" onClick={() => setInstallOpen((value) => !value)}><PackagePlus size={15} />{t('center.add')}</button>
      <button className="button secondary compact" disabled={loading} onClick={() => setReloadKey((value) => value + 1)}><RefreshCw size={15} className={loading ? 'spin' : ''} />{t('center.refresh')}</button>
    </PageHeading>

    {error && <p className="form-error">{error}</p>}

    {installOpen && <InstallPanel target={target} scope={scope} setTarget={setTarget} setScope={setScope} platforms={platforms} onInstalled={() => { setInstallOpen(false); reload(); }} setToast={setToast} />}

    <FilterBar query={query} setQuery={setQuery} placeholder={t('center.search')}>
      <select value={sourceFilter} onChange={(event) => setSourceFilter(event.target.value as SourceFilter)}>
        <option value="all">{t('center.filterAll')}</option>
        <option value="managed">{t('center.filterManaged')}</option>
        <option value="physical">{t('center.filterPhysical')}</option>
        <option value="local">local</option>
        <option value="github">github</option>
        <option value="marketplace">marketplace</option>
        <option value="agent-import">agent-import</option>
      </select>
      <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as StatusFilter)}>
        <option value="all">{t('center.statusAll')}</option>
        <option value="synced">{t('center.status.synced')}</option>
        <option value="outdated">{t('center.status.outdated')}</option>
        <option value="modified">{t('center.status.modified')}</option>
        <option value="missing">{t('center.status.missing')}</option>
        <option value="conflict">{t('center.status.conflict')}</option>
      </select>
    </FilterBar>

    {loading ? <div className="loading-line"><LoaderCircle className="spin" size={16} />{t('common.loading')}</div> : filtered.length === 0 ? <p className="muted empty-copy">{t('center.empty')}</p> : (
      <div className="center-list">
        <div className="center-row center-header">
          <span /><span>{t('center.colName')}</span><span>{t('center.colSource')}</span><span>{t('center.colInstalls')}</span><span />
        </div>
        {filtered.map((row) => <CenterRowItem key={row.id} row={row} selected={selected.has(row.id)} onToggle={() => toggleSelect(row.id)} onOpen={() => setDetail(row)} onReclaim={reclaim} busy={busy} />)}
      </div>
    )}

    {selected.size > 0 && <div className="bulk-bar">
      <span className="bulk-count">{t('center.selected', { count: selected.size })}</span>
      <div className="bulk-actions">
        <select value={target} onChange={(event) => setTarget(event.target.value as InstallPlatform)} disabled={selectedManaged.length === 0}>
          {platforms.map((value) => <option key={value} value={value}>{platformLabel(value)}</option>)}
        </select>
        <button className="button secondary compact" disabled={busy || selectedManaged.length === 0} onClick={() => void bulkInstallTo(target)}><PackagePlus size={15} />{t('center.bulkInstall')}</button>
        <button className="button secondary compact" disabled={busy || selectedPhysical.length === 0} onClick={() => void bulkReclaim()}><ArchiveRestore size={15} />{t('center.bulkReclaim')}</button>
        <button className="button danger compact" disabled={busy || selectedManaged.length === 0} onClick={() => void bulkUninstall()}><Trash2 size={15} />{t('center.bulkUninstall')}</button>
        <a className="button secondary compact" href="/api/export/dashboard" download><Download size={15} />{t('center.export')}</a>
        <button className="button ghost compact" onClick={() => setSelected(new Set())}>{t('center.clearSelection')}</button>
      </div>
    </div>}

    {detail && <CenterDrawer row={detail} onClose={() => setDetail(null)} onReclaim={reclaim} onUninstall={unlinkDeployment} onResync={resync} busy={busy} />}
  </section>;
}

function CenterRowItem({ row, selected, onToggle, onOpen, onReclaim, busy }: { row: Row; selected: boolean; onToggle: () => void; onOpen: () => void; onReclaim: (candidate: CenterPhysicalView) => void; busy: boolean }) {
  const { t } = useTranslation();
  const managed = row.kind === 'managed';
  const name = managed ? row.skill.name : row.candidate.name;
  const installations = managed ? row.skill.installations : [];
  return (
    <div className={`center-row ${selected ? 'selected' : ''} ${managed ? '' : 'physical'}`} onClick={onOpen}>
      <label className="row-check" onClick={(event) => event.stopPropagation()}><input type="checkbox" checked={selected} onChange={onToggle} /></label>
      <span className="row-name"><code>{name}</code>{!managed && <em className="unmanaged-tag">{t('center.unmanaged')}</em>}</span>
      <span className="row-source">{managed ? <SourceBadge source={row.skill.sourceType} /> : <StatusBadge status={row.candidate.status === 'new' ? 'missing' : row.candidate.status === 'identical-copy' ? 'synced' : 'conflict'} />}</span>
      <span className="row-installs">{installations.length === 0 ? <small className="muted">{managed ? t('center.notInstalled') : t('center.physicalOnly')}</small> : installations.map((installation) => <StatusBadge key={installation.deploymentId} status={installation.status} label={platformLabel(installation.platform)} />)}</span>
      <span className="row-action" onClick={(event) => event.stopPropagation()}>{!managed && <button className="button secondary compact" disabled={busy} onClick={() => onReclaim(row.candidate)}><ArchiveRestore size={14} />{t('center.reclaim')}</button>}<ChevronRight size={16} /></span>
    </div>
  );
}

function CenterDrawer({ row, onClose, onReclaim, onUninstall, onResync, busy }: { row: Row; onClose: () => void; onReclaim: (candidate: CenterPhysicalView) => void; onUninstall: (installation: CenterInstallationView) => void; onResync: (installation: CenterInstallationView) => void; busy: boolean }) {
  const { t } = useTranslation();
  const managed = row.kind === 'managed';
  const name = managed ? row.skill.name : row.candidate.name;
  return (
    <div className="drawer-overlay" onClick={onClose}>
      <aside className="drawer" onClick={(event) => event.stopPropagation()}>
        <div className="drawer-head">
          <div><h3><code>{name}</code></h3><small>{managed ? <SourceBadge source={row.skill.sourceType} /> : t('center.unmanaged')}</small></div>
          <button className="button ghost compact" onClick={onClose}><X size={16} /></button>
        </div>
        <div className="drawer-body">
          {managed ? (
            <>
              <div className="detail"><span>{t('center.treeHash')}</span><code>{shortPath(row.skill.treeHash)}</code></div>
              <div className="detail"><span>{t('center.addedAt')}</span><strong>{row.skill.addedAt}</strong></div>
              <div className="detail"><span>{t('center.updatedAt')}</span><strong>{row.skill.updatedAt}</strong></div>
              <h4>{t('center.installations')}</h4>
              {row.skill.installations.length === 0 ? <p className="muted empty-copy">{t('center.notInstalled')}</p> : row.skill.installations.map((installation) => (
                <div className="install-card" key={installation.deploymentId}>
                  <div className="install-card-head"><span>{platformLabel(installation.platform)} · {scopeLabel(installation.scope, t)}</span><StatusBadge status={installation.status} /></div>
                  <code className="install-path">{shortPath(installation.installedPath)}</code>
                  <div className="install-actions">
                    <button className="button secondary compact" disabled={busy} onClick={() => void onResync(installation)}><RefreshCw size={14} />{installation.status === 'synced' ? t('center.relink') : t('center.resync')}</button>
                    <button className="button danger compact" disabled={busy} onClick={() => void onUninstall(installation)}><Trash2 size={14} />{t('center.uninstall')}</button>
                  </div>
                </div>
              ))}
            </>
          ) : (
            <>
              <div className="detail"><span>{t('center.path')}</span><code>{shortPath(row.candidate.rootPath)}</code></div>
              <div className="detail"><span>{t('center.platform')}</span><strong>{platformLabel(row.candidate.platform)} · {scopeLabel(row.candidate.scope, t)}</strong></div>
              <p className="muted">{t('center.physicalHint')}</p>
              <button className="button primary" disabled={busy} onClick={() => void onReclaim(row.candidate)}><ArchiveRestore size={16} />{t('center.reclaim')}</button>
            </>
          )}
        </div>
      </aside>
    </div>
  );
}

function SourceBadge({ source }: { source: CenterSkillView['sourceType'] }) {
  return <span className={`source-badge source-${source}`}>{source}</span>;
}

function StatusBadge({ status, label }: { status: CenterInstallationView['status'] | 'managed-link' | 'identical-copy'; label?: string }) {
  const kind = status === 'synced' || status === 'identical-copy' || status === 'managed-link' ? 'success' : status === 'outdated' || status === 'modified' ? 'warning' : 'danger';
  const text = status === 'synced' ? 'synced' : status === 'outdated' ? 'outdated' : status === 'modified' ? 'modified' : status === 'missing' ? 'missing' : status === 'conflict' ? 'conflict' : status === 'identical-copy' ? 'synced' : status === 'managed-link' ? 'synced' : status;
  return <span className={`status-badge ${kind}`} title={label}>{label ? `${platformLabel(label)} ` : ''}{text}</span>;
}

function InstallPanel({ target, scope, setTarget, setScope, platforms, onInstalled, setToast }: {
  target: InstallPlatform; scope: Scope; setTarget: (value: InstallPlatform) => void; setScope: (value: Scope) => void;
  platforms: InstallPlatform[]; onInstalled: () => void; setToast: (message: string) => void;
}) {
  const { t } = useTranslation();
  const [sourceType, setSourceType] = useState<'local' | 'marketplace'>('local');
  const [source, setSource] = useState('');
  const [skills, setSkills] = useState<{ id: string; name: string; sourcePath: string; relativePath: string }[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [link, setLink] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const inspect = async () => {
    setBusy(true); setError(null);
    try {
      const result = await inspectSkillSource(source);
      setSkills(result.skills); setSelectedIds([]);
    } catch (err) { setError(err instanceof Error ? err.message : String(err)); } finally { setBusy(false); }
  };
  const choose = async () => {
    setBusy(true); setError(null);
    try {
      const result = await pickSkillSourceDirectory();
      if ('cancelled' in result) return;
      setSkills(result.skills); setSelectedIds([]); setSource('');
    } catch (err) { setError(err instanceof Error ? err.message : String(err)); } finally { setBusy(false); }
  };
  const submit = async () => {
    setBusy(true); setError(null);
    try {
      if (sourceType === 'marketplace') {
        const result = await installSkill({ source, sourceType, target, scope, link: false });
        setToast(t('center.installed', { name: result.name }));
      } else {
        const chosen = skills.filter((skill) => selectedIds.includes(skill.id));
        let installed = 0;
        for (const skill of chosen) {
          try { await installSkill({ source: skill.sourcePath, sourceType: 'local', target, scope, link }); installed += 1; } catch (err) { setError(`${skill.name}: ${err instanceof Error ? err.message : String(err)}`); }
        }
        if (installed > 0) setToast(t('center.installedCount', { count: installed }));
      }
      onInstalled();
    } catch (err) { setError(err instanceof Error ? err.message : String(err)); } finally { setBusy(false); }
  };

  return (
    <section className="panel install-panel center-install">
      <div className="panel-heading"><div><h3>{t('center.addTitle')}</h3><p>{t('center.addSubtitle')}</p></div><PackagePlus size={20} /></div>
      <div className="context-field-row">
        <div className="context-field"><span>{t('center.contextTarget')}</span><select value={target} onChange={(event) => setTarget(event.target.value as InstallPlatform)}>{platforms.map((value) => <option key={value} value={value}>{platformLabel(value)}</option>)}</select></div>
        <div className="context-field"><span>{t('center.contextScope')}</span><div className="segmented"><button className={scope === 'global' ? 'active' : ''} onClick={() => setScope('global')}>{t('label.global')}</button><button className={scope === 'project' ? 'active' : ''} onClick={() => setScope('project')}>{t('center.currentProject')}</button></div></div>
        <label className="check-row"><input type="checkbox" checked={link} onChange={(event) => setLink(event.target.checked)} />{t('center.link')}</label>
      </div>
      <div className="segmented"><button className={sourceType === 'local' ? 'active' : ''} onClick={() => setSourceType('local')}>{t('center.local')}</button><button className={sourceType === 'marketplace' ? 'active' : ''} onClick={() => setSourceType('marketplace')}>{t('center.marketplace')}</button></div>
      {sourceType === 'local' ? <>
        <label className="field"><span>{t('center.source')}</span><div className="source-input-row"><input value={source} onChange={(event) => setSource(event.target.value)} placeholder="/path/to/skills" /><button className="button secondary compact" disabled={!source.trim() || busy} onClick={() => void inspect()}><Search size={15} />{t('center.read')}</button></div></label>
        <div className="directory-choice"><button className="button secondary" disabled={busy} onClick={() => void choose()}><Boxes size={16} />{t('center.chooseDirectory')}</button></div>
        {skills.length > 0 && <div className="skill-check-list">{skills.map((skill) => <label key={skill.id}><input type="checkbox" checked={selectedIds.includes(skill.id)} onChange={(event) => setSelectedIds((current) => event.target.checked ? [...current, skill.id] : current.filter((value) => value !== skill.id))} /><span><code>{skill.name}</code><small>{skill.relativePath}</small></span></label>)}</div>}
      </> : <label className="field"><span>Skill slug</span><input value={source} onChange={(event) => setSource(event.target.value)} placeholder="owner/skill-name" /></label>}
      {error && <p className="form-error">{error}</p>}
      <button className="button primary full" disabled={busy || (sourceType === 'marketplace' ? !source.trim() : selectedIds.length === 0)} onClick={() => void submit()}>{busy ? <LoaderCircle className="spin" size={17} /> : <PackagePlus size={17} />}{t('center.install')}</button>
    </section>
  );
}
