import { ArchiveRestore, Boxes, FileCode2, FolderOpen, LoaderCircle, PackagePlus, Search, Trash2 } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import type { BootstrapPayload, DoctorSnapshot } from '../../../src/application/types';
import type { InstallSourceSkill, TargetAgentSkill } from '../../../src/application/install';
import type { AgentImportCandidate, AgentSkillImportPreview } from '../../../src/library/importAgentSkills';
import type { Platform, Scope } from '../../../src/types/skill';
import { getTargetAgentSkills, inspectSkillSource, installSkill, pickSkillSourceDirectory, previewPhysicalAgentSkills, reclaimPhysicalAgentSkills, uninstallSkill } from '../api';
import { PageHeading, platformLabel, scopeLabel, shortPath } from '../components/ui';
import { useTranslation } from '../i18n';

type SelectableSkill = InstallSourceSkill;

type InstallPlatform = Exclude<Platform, 'unknown'>;

type ManageTab = 'install' | 'installed' | 'reclaim' | 'export';

export function ManagePage({ bootstrap, snapshot, onChanged, setToast }: { bootstrap: BootstrapPayload | null; snapshot: DoctorSnapshot | null; onChanged: () => void; setToast: (message: string) => void }) {
  const { t } = useTranslation();
  const platforms = bootstrap?.supportedPlatforms.filter((value): value is InstallPlatform => value !== 'unknown') ?? [];
  const [sourceType, setSourceType] = useState<'local' | 'marketplace'>('local');
  const [source, setSource] = useState('');
  const [sourceLabel, setSourceLabel] = useState('');
  const [skills, setSkills] = useState<SelectableSkill[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [target, setTarget] = useState<InstallPlatform>(() => platforms[0] ?? 'claude');
  const [installScope, setInstallScope] = useState<Scope>('global');
  const [availableScopes, setAvailableScopes] = useState<Scope[]>(['global', 'project']);
  const [targetSkills, setTargetSkills] = useState<TargetAgentSkill[]>([]);
  const [targetPath, setTargetPath] = useState('');
  const [targetLoading, setTargetLoading] = useState(false);
  const [targetReload, setTargetReload] = useState(0);
  const [importPreview, setImportPreview] = useState<AgentSkillImportPreview | null>(null);
  const [selectedImportIds, setSelectedImportIds] = useState<string[]>([]);
  const [importBusy, setImportBusy] = useState(false);
  const [link, setLink] = useState(false);
  const [busy, setBusy] = useState(false);
  const [sourceBusy, setSourceBusy] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const [tab, setTab] = useState<ManageTab>('install');

  useEffect(() => {
    if (platforms.length > 0 && !platforms.includes(target)) setTarget(platforms[0]);
  }, [platforms, target]);

  useEffect(() => {
    let active = true;
    setTargetLoading(true);
    void Promise.all([
      getTargetAgentSkills(target, installScope),
      previewPhysicalAgentSkills(target, installScope),
    ]).then(([result, preview]) => {
      if (!active) return;
      setTargetSkills(result.skills);
      setTargetPath(result.targetPath);
      setAvailableScopes(result.availableScopes);
      setImportPreview(preview);
      setSelectedImportIds([]);
      if (result.scope !== installScope) setInstallScope(result.scope);
      setLocalError(null);
    }).catch((error) => {
      if (active) setLocalError(error instanceof Error ? error.message : String(error));
    }).finally(() => {
      if (active) setTargetLoading(false);
    });
    return () => { active = false; };
  }, [target, installScope, targetReload]);

  const existingNames = useMemo(() => new Set(targetSkills
    .filter((skill) => skill.scope === installScope)
    .map((skill) => skill.name.toLowerCase())), [targetSkills, installScope]);
  const selectableSkills = skills.filter((skill) => !existingNames.has(skill.name.toLowerCase()));
  const selectedSkills = selectableSkills.filter((skill) => selectedIds.includes(skill.id));
  const physicalCandidates = useMemo(() => (importPreview?.candidates ?? []).filter((candidate) =>
    candidate.platform === target && candidate.scope === installScope && isPhysicalSkillCandidate(candidate)), [importPreview, installScope, target]);
  const reclaimableCandidates = physicalCandidates.filter(isReclaimableCandidate);
  const selectedImportCandidates = reclaimableCandidates.filter((candidate) => selectedImportIds.includes(candidate.id));

  const chooseSourceType = (next: 'local' | 'marketplace') => {
    setSourceType(next);
    setSkills([]);
    setSelectedIds([]);
    setSourceLabel('');
    setLocalError(null);
  };

  const inspectSource = async () => {
    setSourceBusy(true);
    setLocalError(null);
    try {
      const result = await inspectSkillSource(source);
      setSkills(result.skills);
      setSelectedIds([]);
      setSourceLabel(shortPath(result.sourcePath));
    } catch (error) {
      setSkills([]);
      setSelectedIds([]);
      setLocalError(error instanceof Error ? error.message : String(error));
    } finally {
      setSourceBusy(false);
    }
  };

  const chooseDirectory = async () => {
    setSourceBusy(true);
    setLocalError(null);
    try {
      const result = await pickSkillSourceDirectory();
      if ('cancelled' in result) return;
      setSkills(result.skills);
      setSelectedIds([]);
      setSource('');
      setSourceLabel(shortPath(result.sourcePath));
    } catch (error) {
      setLocalError(error instanceof Error ? error.message : String(error));
    } finally {
      setSourceBusy(false);
    }
  };

  const submit = async () => {
    setBusy(true);
    setLocalError(null);
    try {
      if (sourceType === 'marketplace') {
        const result = await installSkill({ source, sourceType, target, scope: installScope, link: false });
        setToast(t('manage.installed', { name: result.name }));
        setSource('');
        onChanged();
        setTargetReload((value) => value + 1);
        return;
      }

      const failures: string[] = [];
      let installed = 0;
      for (const skill of selectedSkills) {
        try {
          await installSkill({ source: skill.sourcePath, sourceType: 'local', target, scope: installScope, link });
          installed += 1;
        } catch (error) {
          failures.push(`${skill.name}: ${error instanceof Error ? error.message : String(error)}`);
        }
      }
      if (installed > 0) {
        setToast(t('manage.installedCount', { count: installed }));
        onChanged();
        setTargetReload((value) => value + 1);
      }
      if (failures.length > 0) {
        setLocalError(failures.join('\n'));
      } else {
        setSkills([]);
        setSelectedIds([]);
        setSource('');
        setSourceLabel('');
      }
    } catch (error) {
      setLocalError(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  };

  const toggleSkill = (id: string, checked: boolean) => {
    setSelectedIds((current) => checked ? [...current, id] : current.filter((value) => value !== id));
  };

  const reclaimSelected = async () => {
    if (!importPreview) return;
    setImportBusy(true);
    setLocalError(null);
    try {
      const selected = new Set(selectedImportIds);
      const result = await reclaimPhysicalAgentSkills({
        planId: importPreview.planId,
        target,
        scope: installScope,
        decisions: importPreview.candidates.map((candidate) => ({
          candidateId: candidate.id,
          action: selected.has(candidate.id) && isReclaimableCandidate(candidate) ? 'replace-with-link' : 'skip',
        })),
      });
      const selectedOutcomes = result.outcomes.filter((outcome) => selected.has(outcome.candidateId));
      const linked = selectedOutcomes.filter((outcome) => outcome.status === 'linked').length;
      const failures = selectedOutcomes.filter((outcome) => outcome.status === 'failed');
      if (linked > 0) {
        setToast(t('manage.reclaimed', { count: linked }));
        onChanged();
        setTargetReload((value) => value + 1);
      }
      if (failures.length > 0) {
        setLocalError(failures.map((outcome) => outcome.message ?? t('manage.reclaimFailed')).join('\n'));
      }
    } catch (error) {
      setLocalError(error instanceof Error ? error.message : String(error));
    } finally {
      setImportBusy(false);
    }
  };

  return <section>
    <PageHeading title={t('manage.title')} subtitle={t('manage.subtitle')} />

    <div className="manage-context-bar">
      <div className="context-field">
        <span>{t('manage.contextTarget')}</span>
        <select value={target} onChange={(event) => setTarget(event.target.value as InstallPlatform)}>
          {platforms.map((value) => <option key={value} value={value}>{platformLabel(value)}</option>)}
        </select>
      </div>
      <div className="context-field">
        <span>{t('manage.contextScope')}</span>
        <div className="segmented">
          <button className={installScope === 'global' ? 'active' : ''} disabled={!availableScopes.includes('global')} onClick={() => setInstallScope('global')}>{t('label.global')}</button>
          <button className={installScope === 'project' ? 'active' : ''} disabled={!availableScopes.includes('project')} onClick={() => setInstallScope('project')}>{t('manage.currentProject')}</button>
        </div>
      </div>
      <p className="context-hint">{t('manage.contextHint')}</p>
    </div>

    <div className="agent-tabs manage-tabs" role="tablist">
      <button role="tab" aria-selected={tab === 'install'} className={tab === 'install' ? 'active' : ''} onClick={() => setTab('install')}><PackagePlus size={15} />{t('manage.tabs.install')}</button>
      <button role="tab" aria-selected={tab === 'installed'} className={tab === 'installed' ? 'active' : ''} onClick={() => setTab('installed')}><Boxes size={15} />{t('manage.tabs.installed')}</button>
      <button role="tab" aria-selected={tab === 'reclaim'} className={tab === 'reclaim' ? 'active' : ''} onClick={() => setTab('reclaim')}><ArchiveRestore size={15} />{t('manage.tabs.reclaim')}{physicalCandidates.length > 0 && <span className="tab-count">{physicalCandidates.length}</span>}</button>
      <button role="tab" aria-selected={tab === 'export'} className={tab === 'export' ? 'active' : ''} onClick={() => setTab('export')}><FileCode2 size={15} />{t('manage.tabs.export')}</button>
    </div>

    {tab === 'install' && <div className="manage-tab-panel">
      <section className="panel install-panel">
        <div className="panel-heading"><div><h3>{t('manage.installTitle')}</h3><p>{t('manage.installSubtitle')}</p></div><PackagePlus size={20} /></div>
        <div className="segmented"><button className={sourceType === 'local' ? 'active' : ''} onClick={() => chooseSourceType('local')}>{t('manage.local')}</button><button className={sourceType === 'marketplace' ? 'active' : ''} onClick={() => chooseSourceType('marketplace')}>{t('manage.marketplace')}</button></div>
        {sourceType === 'local' ? <>
          <label className="field"><span>{t('manage.source')}</span><div className="source-input-row"><input aria-label={t('manage.source')} value={source} onChange={(event) => setSource(event.target.value)} placeholder="/path/to/skills" /><button className="button secondary compact" disabled={!source.trim() || sourceBusy} onClick={() => void inspectSource()}>{sourceBusy ? <LoaderCircle className="spin" size={15} /> : <Search size={15} />}{t('manage.read')}</button></div></label>
          <div className="directory-choice"><span>{t('manage.or')}</span><button className="button secondary" disabled={sourceBusy} onClick={() => void chooseDirectory()}><FolderOpen size={16} />{t('manage.chooseDirectory')}</button><small>{t('manage.localOnly')}</small></div>
          {skills.length > 0 && <div className="skill-picker"><div className="skill-picker-heading"><div><strong>{t('manage.sourceSkills')}</strong><small>{sourceLabel} · {t('manage.found', { count: skills.length })}</small></div><label><input type="checkbox" aria-label={t('manage.selectAllInstall')} checked={selectableSkills.length > 0 && selectedSkills.length === selectableSkills.length} onChange={(event) => setSelectedIds(event.target.checked ? selectableSkills.map((skill) => skill.id) : [])} />{t('manage.selectAllInstall')}</label></div><div className="skill-check-list">{skills.map((skill) => { const exists = existingNames.has(skill.name.toLowerCase()); return <label className={exists ? 'disabled' : ''} key={skill.id}><input type="checkbox" checked={!exists && selectedIds.includes(skill.id)} disabled={exists} onChange={(event) => toggleSkill(skill.id, event.target.checked)} /><span><code>{skill.name}</code><small>{skill.relativePath}</small></span>{exists && <em>{t('manage.exists')}</em>}</label>; })}</div></div>}
          <label className="check-row"><input type="checkbox" checked={link} onChange={(event) => setLink(event.target.checked)} />{t('manage.link')}</label>
        </> : <label className="field"><span>Skill slug</span><input value={source} onChange={(event) => setSource(event.target.value)} placeholder="owner/skill-name" /></label>}
        {localError && <p className="form-error">{localError}</p>}
        <button className="button primary full" disabled={busy || (sourceType === 'marketplace' ? !source.trim() : selectedSkills.length === 0)} onClick={() => void submit()}>{busy ? <LoaderCircle className="spin" size={17} /> : <PackagePlus size={17} />}{sourceType === 'marketplace' ? t('manage.install') : t('manage.installSelected', { count: selectedSkills.length })}</button>
      </section>
    </div>}

    {tab === 'installed' && <div className="manage-tab-panel manage-tab-grid">
      <section className="panel target-skills-panel">
        <div className="panel-heading"><div><h3>{t('manage.targetTitle')}</h3><p>{t('manage.targetSubtitle')}</p></div><span className="result-count">{targetSkills.length}</span></div>
        {targetPath && <code className="target-path">{scopeLabel(installScope, t)}{t('manage.installDirectory')} · {shortPath(targetPath)}</code>}
        {targetLoading ? <div className="loading-line"><LoaderCircle className="spin" size={17} />{t('manage.reading')}</div> : <div className="target-skill-list">{targetSkills.map((skill) => <div key={skill.sourcePath}><span><code>{skill.name}</code><small>{shortPath(skill.sourcePath)}</small></span><span className="target-skill-badges"><em>{scopeLabel(skill.scope, t)}</em>{skill.managed && <em>{t('manage.registered')}</em>}</span></div>)}{targetSkills.length === 0 && <p className="muted empty-copy">{t('manage.targetEmpty')}</p>}</div>}
      </section>
      <section className="panel registry-panel">
        <div className="panel-heading"><div><h3>{t('manage.registryTitle')}</h3><p>{t('manage.registrySubtitle')}</p></div><span className="result-count">{bootstrap?.registry.length ?? 0}</span></div>
        <div className="registry-list">{bootstrap?.registry.map((entry) => <div className="registry-row" key={`${entry.platform}:${entry.scope}:${entry.name}`}><div><code>{entry.name}</code><small>{entry.platform} · {scopeLabel(entry.scope, t)} · {entry.source} · {shortPath(entry.installedPath)}</small></div><button className="button danger compact" onClick={async () => { if (!window.confirm(t('manage.uninstallConfirm', { name: entry.name }))) return; try { await uninstallSkill({ name: entry.name, platform: entry.platform, scope: entry.scope, force: false }); setToast(t('manage.uninstalled', { name: entry.name })); onChanged(); } catch (error) { const message = error instanceof Error ? error.message : String(error); if (window.confirm(t('manage.forceUninstall', { error: message }))) { await uninstallSkill({ name: entry.name, platform: entry.platform, scope: entry.scope, force: true }); setToast(t('manage.forceUninstalled', { name: entry.name })); onChanged(); } } }}><Trash2 size={15} />{t('manage.uninstall')}</button></div>)}{!bootstrap?.registry.length && <p className="muted empty-copy">{t('manage.registryEmpty')}</p>}</div>
      </section>
    </div>}

    {tab === 'reclaim' && <div className="manage-tab-panel">
      <section className="panel reclaim-panel">
        <div className="panel-heading"><div><h3>{t('manage.reclaimTitle')}</h3><p>{t('manage.reclaimSubtitle')}</p></div><span className="result-count">{physicalCandidates.length}</span></div>
        {targetPath && <code className="target-path">{platformLabel(target)} · {scopeLabel(installScope, t)} · {shortPath(targetPath)}</code>}
        {targetLoading ? <div className="loading-line"><LoaderCircle className="spin" size={17} />{t('manage.discovering')}</div> : <>{physicalCandidates.length > 0 ? <div className="skill-picker reclaim-picker"><div className="skill-picker-heading"><div><strong>{t('manage.reclaimable')}</strong><small>{t('manage.reclaimableDetail')}</small></div><label><input type="checkbox" aria-label={t('manage.selectAllReclaim')} checked={reclaimableCandidates.length > 0 && selectedImportCandidates.length === reclaimableCandidates.length} onChange={(event) => setSelectedImportIds(event.target.checked ? reclaimableCandidates.map((candidate) => candidate.id) : [])} />{t('manage.selectAllReclaim')}</label></div><div className="skill-check-list">{physicalCandidates.map((candidate) => { const reclaimable = isReclaimableCandidate(candidate); return <label className={!reclaimable ? 'disabled' : ''} key={candidate.id}><input type="checkbox" checked={reclaimable && selectedImportIds.includes(candidate.id)} disabled={!reclaimable} onChange={(event) => setSelectedImportIds((current) => event.target.checked ? [...current, candidate.id] : current.filter((value) => value !== candidate.id))} /><span><code>{candidate.name}</code><small>{shortPath(candidate.rootPath)}</small></span><em>{agentImportStatusLabel(candidate, t)}</em></label>; })}</div></div> : <p className="muted empty-copy">{t('manage.reclaimEmpty')}</p>}</>}
        <button className="button primary" disabled={importBusy || selectedImportCandidates.length === 0} onClick={() => void reclaimSelected()}>{importBusy ? <LoaderCircle className="spin" size={17} /> : <ArchiveRestore size={17} />}{t('manage.reclaimSelected', { count: selectedImportCandidates.length })}</button>
        {localError && <p className="form-error">{localError}</p>}
      </section>
    </div>}

    {tab === 'export' && <div className="manage-tab-panel">
      <section className="panel report-panel">
        <div className="panel-heading"><div><h3>{t('manage.reportTitle')}</h3><p>{t('manage.reportSubtitle')}</p></div><FileCode2 size={20} /></div>
        <div className="action-list">
          <div><span>{t('manage.staticReport')}</span><small>{t('manage.staticReportDetail')}</small></div>
          <a className="button secondary" href="/api/export/dashboard" download>{t('manage.download')}</a>
          <div><span>{t('manage.snapshot')}</span><small>{snapshot ? t('manage.snapshotDetail', { resources: snapshot.summary.resources, issues: snapshot.summary.issues }) : t('manage.notScanned')}</small></div>
          <span className="muted">{snapshot ? new Date(snapshot.generatedAt).toLocaleString() : '—'}</span>
        </div>
      </section>
    </div>}
  </section>;
}

function isPhysicalSkillCandidate(candidate: AgentImportCandidate): boolean {
  return candidate.status === 'new' || candidate.status === 'identical-copy' || candidate.status === 'same-name-different-content';
}

function isReclaimableCandidate(candidate: AgentImportCandidate): boolean {
  return candidate.status === 'new' || candidate.status === 'identical-copy';
}

function agentImportStatusLabel(candidate: AgentImportCandidate, t: ReturnType<typeof useTranslation>['t']): string {
  if (candidate.status === 'identical-copy') return t('manage.identicalCopy');
  if (candidate.status === 'same-name-different-content') return t('manage.nameConflict');
  return t('manage.physicalDirectory');
}
