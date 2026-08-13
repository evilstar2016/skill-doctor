import { Activity, ArchiveRestore, Boxes, CheckCircle2, ChevronRight, Download, FileCode2, GitCompareArrows, LoaderCircle, RefreshCw, Rocket, Settings, TriangleAlert, Trash2, X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import type { BootstrapPayload, DoctorSnapshot } from '../../../src/application/types';
import type { CenterInstallationView, CenterPhysicalView, CenterSkillView, CenterView } from '../../../src/application/center';
import type { Platform, Scope } from '../../../src/types/skill';
import {
  getCenterSkills,
  getManagedSkillConflictDiff,
  previewDeployment,
  commitDeployment,
  getDeploymentTargets,
  reclaimPhysicalAgentSkills,
  removeSkill,
  pickCenterLibraryPath,
  saveCenterLibraryPath,
  syncDeployment,
  uninstallDeployment,
} from '../api';
import { FilterBar, PageHeading, PlatformIcon, platformLabel, scopeLabel, shortPath } from '../components/ui';
import { EmptyState } from '../components/EmptyState';
import { useTranslation } from '../i18n';

type Row =
  | { id: string; kind: 'managed'; skill: CenterSkillView }
  | { id: string; kind: 'physical'; candidate: CenterPhysicalView };

type SourceFilter = 'all' | 'managed' | 'physical' | 'local' | 'github' | 'marketplace' | 'agent-import';
type StatusFilter = 'all' | CenterInstallationView['status'];
type Confirmation = { title: string; message: string; confirmLabel: string; danger?: boolean; onConfirm: () => Promise<void> };
type ReclaimDecision = { candidateId: string; action: 'replace-with-link' | 'keep-separate-and-link' | 'use-managed-link'; name?: string };

export function ManagePage({ bootstrap, snapshot, onChanged, setToast, onViewIssues, selectedAgent = 'all' }: { bootstrap: BootstrapPayload | null; snapshot: DoctorSnapshot | null; onChanged: () => void; setToast: (message: string) => void; onViewIssues?: (skillName: string) => void; selectedAgent?: Platform | 'all' }) {
  const { t } = useTranslation();
  const [center, setCenter] = useState<CenterView | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  const [query, setQuery] = useState('');
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>('all');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [detail, setDetail] = useState<Row | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [deploySkill, setDeploySkill] = useState<CenterSkillView | null>(null);
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null);
  const [conflictCandidate, setConflictCandidate] = useState<CenterPhysicalView | null>(null);
  const [comparisonCandidate, setComparisonCandidate] = useState<CenterPhysicalView | null>(null);
  const [busy, setBusy] = useState(false);
  const library = center?.library ?? { rootPath: '~/.skill-doctor', isDefault: true };

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

  useEffect(() => {
    setSelected(new Set());
    setDetail(null);
  }, [selectedAgent]);

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
  const pendingGroups = useMemo(() => {
    const groups = new Map<Platform, CenterPhysicalView[]>();
    for (const row of filtered) {
      if (row.kind !== 'physical') continue;
      if (selectedAgent !== 'all' && row.candidate.platform !== selectedAgent) continue;
      groups.set(row.candidate.platform, [...(groups.get(row.candidate.platform) ?? []), row.candidate]);
    }
    return [...groups.entries()];
  }, [filtered, selectedAgent]);
  const managedRows = filtered.filter((row): row is Extract<Row, { kind: 'managed' }> => row.kind === 'managed');

  const reload = () => { setSelected(new Set()); setDetail(null); setReloadKey((value) => value + 1); onChanged(); };

  const toggleSelect = (id: string) => {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const reclaim = (candidate: CenterPhysicalView) => {
    if (!center) return;
    if (candidate.status === 'same-name-different-content') {
      setConflictCandidate(candidate);
      return;
    }
    setConfirmation({ title: t('center.reclaim'), message: t('center.reclaimConfirm', { name: candidate.name }), confirmLabel: t('center.adopt'), onConfirm: () => reclaimCandidates([{ candidateId: candidate.id, action: 'replace-with-link' }]) });
  };

  const reclaimCandidates = async (decisions: ReclaimDecision[]) => {
    if (!center || decisions.length === 0) return;
    setBusy(true);
    try {
      const result = await reclaimPhysicalAgentSkills({
        planId: center.importPlanId,
        decisions,
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

  const unlinkDeployment = (installation: CenterInstallationView) => {
    setConfirmation({ title: t('center.uninstall'), message: t('center.uninstallConfirm', { name: installation.installedPath }), confirmLabel: t('center.uninstall'), danger: true, onConfirm: () => unlinkDeploymentConfirmed(installation) });
  };

  const unlinkDeploymentConfirmed = async (installation: CenterInstallationView) => {
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

  const bulkReclaim = () => {
    if (!center || selectedPhysical.length === 0) return;
    const candidates = selectedPhysical.filter((row) => row.candidate.status !== 'same-name-different-content');
    if (candidates.length === 0) return;
    setConfirmation({ title: t('center.bulkReclaim'), message: t('center.bulkReclaimConfirm', { count: candidates.length }), confirmLabel: t('center.bulkReclaim'), onConfirm: () => reclaimCandidates(candidates.map((row) => ({ candidateId: row.candidate.id, action: 'replace-with-link' }))) });
  };

  const bulkUninstall = () => {
    if (selectedManaged.length === 0) return;
    setConfirmation({ title: t('center.bulkUninstall'), message: t('center.bulkUninstallConfirm', { count: selectedManaged.length }), confirmLabel: t('center.bulkUninstall'), danger: true, onConfirm: bulkUninstallConfirmed });
  };

  const bulkUninstallConfirmed = async () => {
    if (selectedManaged.length === 0) return;
    setBusy(true);
    try {
      for (const row of selectedManaged) {
        // First uninstall all deployments
        for (const installation of row.skill.installations) {
          await uninstallDeployment(installation.deploymentId, true);
        }
        // Then remove the skill entirely from center store + delete files
        await removeSkill(row.skill.id, true);
      }
      setToast(t('center.bulkUninstalled', { count: selectedManaged.length }));
      reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  return <section className="skill-library-page">
    <PageHeading title={t('center.title')} subtitle={t('center.subtitle')}>
      <button className="button secondary compact" disabled={loading} onClick={() => setReloadKey((value) => value + 1)}><RefreshCw size={15} className={loading ? 'spin' : ''} />{t('center.refresh')}</button>
    </PageHeading>

    {error && <p className="form-error">{error}</p>}

    {center && <section className="center-library-card" aria-label={t('center.libraryPath')}>
      <div className="center-library-icon"><Boxes size={31} /></div>
      <div className="center-library-copy"><div><h2>{t('center.libraryPath')}</h2><code>{library.rootPath}</code></div><p>{t('center.libraryHint')}</p></div>
      <div className="center-library-status"><span><CheckCircle2 size={18} />{t('center.libraryHealthy')}</span><button className="button secondary compact" onClick={() => setSettingsOpen(true)}>{t('center.changeLibrary')}</button></div>
    </section>}

    {loading ? <div className="loading-line"><LoaderCircle className="spin" size={16} />{t('common.loading')}</div> : center && center.skills.length === 0 && center.physical.length === 0 ? <EmptyState icon={Boxes} title={t('center.empty')} description={t('center.emptyHint')} /> : <>
      <section className="pending-section">
        <div className="library-section-heading"><h2>{t('center.pending')}</h2><p>{t('center.pendingHint')}</p></div>
        {pendingGroups.length === 0 ? <p className="muted empty-copy">{t('center.noPending')}</p> : pendingGroups.map(([platform, candidates]) => <PendingGroup key={platform} platform={platform} candidates={candidates} selected={selected} onToggle={toggleSelect} onReclaim={reclaim} onResolveConflict={setConflictCandidate} onOpen={(candidate) => setDetail({ id: candidate.id, kind: 'physical', candidate })} busy={busy} />)}
      </section>

      <section className="managed-section">
        <div className="library-section-heading"><h2>{t('center.managedLibrary')}</h2><p>{t('center.managedLibraryHint')}</p></div>
        <FilterBar query={query} setQuery={setQuery} placeholder={t('center.search')}>
          <select value={sourceFilter} onChange={(event) => setSourceFilter(event.target.value as SourceFilter)}>
            <option value="all">{t('center.filterAll')}</option><option value="managed">{t('center.filterManaged')}</option><option value="physical">{t('center.filterPhysical')}</option><option value="local">local</option><option value="github">github</option><option value="marketplace">marketplace</option><option value="agent-import">agent-import</option>
          </select>
          <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as StatusFilter)}>
            <option value="all">{t('center.statusAll')}</option><option value="synced">{t('center.status.synced')}</option><option value="outdated">{t('center.status.outdated')}</option><option value="modified">{t('center.status.modified')}</option><option value="missing">{t('center.status.missing')}</option><option value="conflict">{t('center.status.conflict')}</option>
          </select>
        </FilterBar>
        {managedRows.length === 0 ? <p className="muted empty-copy">{t('center.noMatch')}</p> : <div className="center-list">
          <div className="center-row center-header"><span /><span>{t('center.colName')}</span><span>{t('center.colSource')}</span><span>{t('center.colInstalls')}</span><span /></div>
          {managedRows.map((row) => <CenterRowItem key={row.id} row={row} selected={selected.has(row.id)} onToggle={() => toggleSelect(row.id)} onOpen={() => setDetail(row)} onReclaim={reclaim} onDeploy={setDeploySkill} busy={busy} />)}
        </div>}
      </section>
    </>}

    {selected.size > 0 && <div className="bulk-bar">
      <span className="bulk-count">{t('center.selected', { count: selected.size })}</span>
      <div className="bulk-actions">
        <button className="button primary compact" disabled={busy || selectedPhysical.every((row) => row.candidate.status === 'same-name-different-content')} onClick={bulkReclaim}><ArchiveRestore size={15} />{t('center.bulkReclaim')}</button>
        <button className="button danger compact" disabled={busy || selectedManaged.length === 0} onClick={bulkUninstall}><Trash2 size={15} />{t('center.bulkUninstall')}</button>
        <a className="button secondary compact" href="/api/export/dashboard" download><Download size={15} />{t('center.export')}</a>
        <button className="button ghost compact" onClick={() => setSelected(new Set())}>{t('center.clearSelection')}</button>
      </div>
    </div>}

    {detail && <CenterDrawer row={detail} onClose={() => setDetail(null)} onReclaim={reclaim} onUninstall={unlinkDeployment} onResync={resync} onDeploy={setDeploySkill} onCompare={setComparisonCandidate} busy={busy} onViewIssues={onViewIssues} />}
    {settingsOpen && center && <CenterSettingsDialog currentPath={library.rootPath} onClose={() => setSettingsOpen(false)} onSaved={() => { setSettingsOpen(false); reload(); }} />}
    {deploySkill && <DeploymentDialog skill={deploySkill} onClose={() => setDeploySkill(null)} onDeployed={() => { setDeploySkill(null); reload(); }} setToast={setToast} />}
    {confirmation && <ConfirmDialog confirmation={confirmation} busy={busy} onCancel={() => setConfirmation(null)} onConfirm={async () => { const action = confirmation.onConfirm; setConfirmation(null); await action(); }} />}
    {conflictCandidate && <ConflictResolutionDialog candidate={conflictCandidate} busy={busy} onClose={() => setConflictCandidate(null)} onResolve={async (decision) => { setConflictCandidate(null); await reclaimCandidates([decision]); }} />}
    {comparisonCandidate && <SkillComparisonDialog candidate={comparisonCandidate} onClose={() => setComparisonCandidate(null)} />}
  </section>;
}

function PendingGroup({ platform, candidates, selected, onToggle, onReclaim, onResolveConflict, onOpen, busy }: { platform: Platform; candidates: CenterPhysicalView[]; selected: Set<string>; onToggle: (id: string) => void; onReclaim: (candidate: CenterPhysicalView) => void; onResolveConflict: (candidate: CenterPhysicalView) => void; onOpen: (candidate: CenterPhysicalView) => void; busy: boolean }) {
  const { t } = useTranslation();
  return <section className="pending-group">
    <div className="pending-agent-heading"><PlatformIcon platform={platform} size={18} /><strong>{t('center.agentGroup', { agent: platformLabel(platform), count: candidates.length })}</strong></div>
    <div className="pending-table" role="table">
      <div className="pending-table-head" role="row"><span /><span>{t('center.colName')}</span><span>{t('center.pendingSource')}</span><span>{t('center.pendingScope')}</span><span>{t('center.pendingConflict')}</span><span>{t('center.pendingAction')}</span></div>
      {candidates.map((candidate) => {
        const conflict = candidate.status === 'same-name-different-content';
        return <div className="pending-table-row center-row" role="row" tabIndex={0} key={candidate.id} onClick={() => onOpen(candidate)} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') onOpen(candidate); }}>
          <label className="row-check" onClick={(event) => event.stopPropagation()}><input type="checkbox" disabled={conflict} checked={selected.has(candidate.id)} onChange={() => onToggle(candidate.id)} /></label>
          <span className="pending-skill-name"><Boxes size={18} /><code>{candidate.name}</code></span>
          <span>{platformLabel(candidate.platform)} · {shortPath(candidate.rootPath)}</span>
          <span><em className={`scope-chip ${candidate.scope}`}>{scopeLabel(candidate.scope, t)}</em></span>
          <span className={conflict ? 'pending-conflict' : 'pending-ok'}>{conflict ? <TriangleAlert size={17} /> : <CheckCircle2 size={17} />}{t(conflict ? 'center.pendingDifferent' : 'center.pendingNoConflict')}</span>
          <span className="pending-action" onClick={(event) => event.stopPropagation()}><button className="button primary compact" disabled={busy} onClick={() => conflict ? onResolveConflict(candidate) : onReclaim(candidate)}>{t(conflict ? 'center.resolveConflict' : 'center.adopt')}</button></span>
        </div>;
      })}
    </div>
  </section>;
}

function ConfirmDialog({ confirmation, busy, onCancel, onConfirm }: { confirmation: Confirmation; busy: boolean; onCancel: () => void; onConfirm: () => Promise<void> }) {
  const { t } = useTranslation();
  return <div className="drawer-overlay confirm-overlay" onClick={busy ? undefined : onCancel}>
    <section className="confirm-dialog" role="dialog" aria-modal="true" aria-labelledby="confirm-title" onClick={(event) => event.stopPropagation()}>
      <div className="confirm-dialog-copy"><h3 id="confirm-title">{confirmation.title}</h3><p>{confirmation.message}</p></div>
      <div className="confirm-dialog-actions"><button className="button secondary" disabled={busy} onClick={onCancel}>{t('common.cancel')}</button><button className={`button ${confirmation.danger ? 'danger' : 'primary'}`} disabled={busy} onClick={() => void onConfirm()}>{busy && <LoaderCircle className="spin" size={15} />}{confirmation.confirmLabel}</button></div>
    </section>
  </div>;
}

function ConflictResolutionDialog({ candidate, busy, onClose, onResolve }: { candidate: CenterPhysicalView; busy: boolean; onClose: () => void; onResolve: (decision: ReclaimDecision) => Promise<void> }) {
  const { t } = useTranslation();
  const [action, setAction] = useState<'keep-separate-and-link' | 'use-managed-link'>('keep-separate-and-link');
  const [name, setName] = useState(`${candidate.name}-${candidate.platform}`);
  const canSubmit = action === 'use-managed-link' || Boolean(name.trim());
  return <div className="drawer-overlay confirm-overlay" onClick={busy ? undefined : onClose}>
    <section className="conflict-dialog conflict-diff-dialog" role="dialog" aria-modal="true" aria-labelledby="conflict-title" onClick={(event) => event.stopPropagation()}>
      <header className="conflict-diff-head"><div><span className="conflict-kicker"><TriangleAlert size={16} />{t('center.pendingDifferent')}</span><h3 id="conflict-title">{t('center.resolveConflict')}</h3><p>{t('center.resolveConflictHint', { name: candidate.name })}</p></div><button className="button ghost compact" onClick={onClose} aria-label={t('common.close')}><X size={17} /></button></header>
      <SkillDiffViewer candidate={candidate} />
      <div className="conflict-decisions"><label className={`conflict-option ${action === 'keep-separate-and-link' ? 'selected' : ''}`}><input type="radio" name="conflict-action" checked={action === 'keep-separate-and-link'} onChange={() => setAction('keep-separate-and-link')} /><span><strong>{t('center.keepSeparate')}</strong><small>{t('center.keepSeparateHint')}</small>{action === 'keep-separate-and-link' && <label className="field"><span>{t('center.conflictCopyName')}</span><input value={name} onChange={(event) => setName(event.target.value)} /></label>}</span></label><label className={`conflict-option ${action === 'use-managed-link' ? 'selected' : ''}`}><input type="radio" name="conflict-action" checked={action === 'use-managed-link'} onChange={() => setAction('use-managed-link')} /><span><strong>{t('center.useCenterVersion')}</strong><small>{t('center.useCenterVersionHint')}</small>{action === 'use-managed-link' && <em>{t('center.useCenterWarning')}</em>}</span></label></div>
      <footer className="confirm-dialog-actions"><button className="button secondary" disabled={busy} onClick={onClose}>{t('common.cancel')}</button><button className="button primary" disabled={busy || !canSubmit} onClick={() => void onResolve({ candidateId: candidate.id, action, ...(action === 'keep-separate-and-link' ? { name: name.trim() } : {}) })}>{busy && <LoaderCircle className="spin" size={15} />}{t('common.confirm')}</button></footer>
    </section>
  </div>;
}

function SkillComparisonDialog({ candidate, onClose }: { candidate: CenterPhysicalView; onClose: () => void }) {
  const { t } = useTranslation();
  return <div className="drawer-overlay confirm-overlay" onClick={onClose}>
    <section className="conflict-dialog conflict-diff-dialog" role="dialog" aria-modal="true" aria-labelledby="comparison-title" onClick={(event) => event.stopPropagation()}>
      <header className="conflict-diff-head"><div><h3 id="comparison-title">{t('center.compareVersions')}</h3><p>{candidate.name}</p></div><button className="button ghost compact" onClick={onClose} aria-label={t('common.close')}><X size={17} /></button></header>
      <SkillDiffViewer candidate={candidate} />
      <footer className="confirm-dialog-actions"><button className="button secondary" onClick={onClose}>{t('common.close')}</button></footer>
    </section>
  </div>;
}

function SkillDiffViewer({ candidate }: { candidate: CenterPhysicalView }) {
  const { t } = useTranslation();
  const [diff, setDiff] = useState<Awaited<ReturnType<typeof getManagedSkillConflictDiff>> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    setDiff(null); setError(null); setSelectedPath(null);
    void getManagedSkillConflictDiff(candidate.id).then((result) => {
      if (!active) return;
      setDiff(result);
      setSelectedPath(result.files[0]?.path ?? null);
    }).catch((cause: unknown) => {
      if (active) setError(cause instanceof Error ? cause.message : String(cause));
    });
    return () => { active = false; };
  }, [candidate.id]);
  const selectedFile = diff?.files.find((file) => file.path === selectedPath) ?? diff?.files[0];
  return <>
    <div className="conflict-sources"><SourceCard label={t('center.centerVersion')} path={diff?.managed.rootPath} /><SourceCard label={t('center.localVersion')} path={candidate.rootPath} detail={`${platformLabel(candidate.platform)} · ${scopeLabel(candidate.scope, t)}`} /></div>
    {error ? <p className="form-error">{t('center.diffLoadFailed', { message: error })}</p> : !diff ? <p className="muted conflict-diff-loading">{t('center.diffLoading')}</p> : diff.files.length === 0 ? <p className="conflict-diff-empty"><CheckCircle2 size={18} />{t('center.noDifferences')}</p> : <><div className="conflict-diff-summary"><GitCompareArrows size={17} /><strong>{t('center.diffSummary', { files: diff.files.length, added: diff.added, deleted: diff.deleted })}</strong></div><div className="conflict-diff-body"><nav className="conflict-file-list" aria-label={t('center.changedFiles')}><strong>{t('center.changedFiles')}</strong>{diff.files.map((file) => <button key={file.path} type="button" className={file.path === selectedFile?.path ? 'active' : ''} onClick={() => setSelectedPath(file.path)}><FileCode2 size={15} /><span>{file.path}</span><em>+{file.added} −{file.deleted}</em></button>)}</nav>{selectedFile && <SideBySideDiff file={selectedFile} />}</div></>}
  </>;
}

function SideBySideDiff({ file }: { file: NonNullable<Awaited<ReturnType<typeof getManagedSkillConflictDiff>>['files'][number]> }) {
  const { t } = useTranslation();
  return <section className="conflict-code-diff"><header><strong>{file.path}</strong><span>+{file.added} −{file.deleted}</span></header><div className="diff-side-labels"><span>{t('center.centerVersion')}</span><span>{t('center.localVersion')}</span></div><div className="conflict-code-lines side-by-side">{pairDiffLines(file.lines).map((pair, index) => <div className="conflict-comparison-row" key={index}><DiffCell line={pair.managed} side="managed" /><DiffCell line={pair.candidate} side="candidate" /></div>)}</div></section>;
}

function DiffCell({ line, side }: { line?: { type: 'context' | 'added' | 'removed'; content: string; managedLine?: number; candidateLine?: number }; side: 'managed' | 'candidate' }) {
  const lineNumber = side === 'managed' ? line?.managedLine : line?.candidateLine;
  return <div className={`comparison-cell ${line?.type ?? 'empty'}`}><span>{lineNumber ?? ''}</span>{line ? <code>{line.content}</code> : <i aria-hidden="true" />}</div>;
}

function pairDiffLines(lines: Array<{ type: 'context' | 'added' | 'removed'; content: string; managedLine?: number; candidateLine?: number }>) {
  const pairs: Array<{ managed?: typeof lines[number]; candidate?: typeof lines[number] }> = [];
  for (let index = 0; index < lines.length;) {
    if (lines[index].type === 'context') { pairs.push({ managed: lines[index], candidate: lines[index] }); index++; continue; }
    const managed: typeof lines[number][] = [];
    const candidate: typeof lines[number][] = [];
    while (index < lines.length && lines[index].type !== 'context') { (lines[index].type === 'removed' ? managed : candidate).push(lines[index]); index++; }
    for (let offset = 0; offset < Math.max(managed.length, candidate.length); offset++) pairs.push({ managed: managed[offset], candidate: candidate[offset] });
  }
  return pairs;
}

function SourceCard({ label, path, detail }: { label: string; path?: string; detail?: string }) {
  return <section className="conflict-source-card"><strong>{label}</strong><code>{path ?? '…'}</code>{detail && <small>{detail}</small>}</section>;
}

function CenterRowItem({ row, selected, onToggle, onOpen, onReclaim, onDeploy, busy }: { row: Row; selected: boolean; onToggle: () => void; onOpen: () => void; onReclaim: (candidate: CenterPhysicalView) => void; onDeploy: (skill: CenterSkillView) => void; busy: boolean }) {
  const { t } = useTranslation();
  const managed = row.kind === 'managed';
  const name = managed ? row.skill.name : row.candidate.name;
  const installations = managed ? row.skill.installations : [];
  return (
    <div className={`center-row ${selected ? 'selected' : ''} ${managed ? '' : 'physical'}`} onClick={onOpen}>
      <label className="row-check" onClick={(event) => event.stopPropagation()}><input type="checkbox" checked={selected} onChange={onToggle} /></label>
      <span className="row-name"><code>{name}</code>{!managed && <em className="unmanaged-tag">{t('center.unmanaged')}</em>}</span>
      <span className="row-source">{managed ? <SourceBadge source={row.skill.sourceType} /> : <PhysicalStatusBadge status={row.candidate.status} />}</span>
      <span className="row-installs">{installations.length === 0 ? <small className="muted">{managed ? t('center.notInstalled') : t('center.physicalOnly')}</small> : installations.map((installation) => <StatusBadge key={installation.deploymentId} status={installation.status} label={platformLabel(installation.platform)} />)}</span>
      <span className="row-action" onClick={(event) => event.stopPropagation()}>{managed ? <button className="button primary compact" disabled={busy} onClick={() => onDeploy(row.skill)}><Rocket size={14} />{t('center.deploy')}</button> : <button className="button secondary compact" disabled={busy} onClick={() => onReclaim(row.candidate)}><ArchiveRestore size={14} />{t('center.adopt')}</button>}<ChevronRight size={16} /></span>
    </div>
  );
}

function CenterDrawer({ row, onClose, onReclaim, onUninstall, onResync, onDeploy, onCompare, busy, onViewIssues }: { row: Row; onClose: () => void; onReclaim: (candidate: CenterPhysicalView) => void; onUninstall: (installation: CenterInstallationView) => void; onResync: (installation: CenterInstallationView) => void; onDeploy: (skill: CenterSkillView) => void; onCompare: (candidate: CenterPhysicalView) => void; busy: boolean; onViewIssues?: (skillName: string) => void }) {
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
              <button className="button primary full" disabled={busy} onClick={() => onDeploy(row.skill)}><Rocket size={15} />{t('center.deploy')}</button>
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
              {row.skill.physicalCandidates && row.skill.physicalCandidates.length > 0 && <><h4>{t('center.physicalCandidates')}</h4>{row.skill.physicalCandidates.map((candidate) => <div className="detail" key={candidate.id}><span>{platformLabel(candidate.platform)} · {scopeLabel(candidate.scope, t)}</span><code>{shortPath(candidate.rootPath)}</code><button className="button secondary compact" onClick={() => onCompare(candidate)}><GitCompareArrows size={14} />{t('center.compareVersions')}</button></div>)}</>}
              {onViewIssues && <div className="drawer-section"><button className="button secondary full" onClick={() => onViewIssues(name)}><Activity size={15} />{t('center.relatedIssues')}</button></div>}
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

function PhysicalStatusBadge({ status }: { status: CenterPhysicalView['status'] }) {
  const map: Record<CenterPhysicalView['status'], { kind: 'success' | 'warning' | 'danger' | 'neutral'; text: string }> = {
    'new': { kind: 'neutral', text: 'new' },
    'identical-copy': { kind: 'success', text: 'synced' },
    'external-link': { kind: 'neutral', text: 'external' },
    'managed-link': { kind: 'success', text: 'managed' },
    'same-name-different-content': { kind: 'warning', text: 'diverged' },
    'invalid': { kind: 'danger', text: 'invalid' },
    'unreadable': { kind: 'danger', text: 'unreadable' },
  };
  const badge = map[status];
  return <span className={`status-badge ${badge.kind}`}>{badge.text}</span>;
}

function StatusBadge({ status, label }: { status: CenterInstallationView['status'] | 'managed-link' | 'identical-copy'; label?: string }) {
  const kind = status === 'synced' || status === 'identical-copy' || status === 'managed-link' ? 'success' : status === 'outdated' || status === 'modified' ? 'warning' : 'danger';
  const text = status === 'synced' ? 'synced' : status === 'outdated' ? 'outdated' : status === 'modified' ? 'modified' : status === 'missing' ? 'missing' : status === 'conflict' ? 'conflict' : status === 'identical-copy' ? 'synced' : status === 'managed-link' ? 'synced' : status;
  return <span className={`status-badge ${kind}`} title={label}>{label ? `${platformLabel(label)} ` : ''}{text}</span>;
}

function CenterSettingsDialog({ currentPath, onClose, onSaved }: { currentPath: string; onClose: () => void; onSaved: () => void }) {
  const { t } = useTranslation();
  const [rootPath, setRootPath] = useState(currentPath);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const choose = async () => {
    setBusy(true); setError(null);
    try {
      const result = await pickCenterLibraryPath();
      if (!('cancelled' in result)) setRootPath(result.rootPath);
    } catch (err) { setError(err instanceof Error ? err.message : String(err)); } finally { setBusy(false); }
  };
  const save = async () => {
    setBusy(true); setError(null);
    try { await saveCenterLibraryPath(rootPath); onSaved(); } catch (err) { setError(err instanceof Error ? err.message : String(err)); } finally { setBusy(false); }
  };

  return <div className="drawer-overlay" onClick={onClose}>
    <aside className="drawer center-settings-drawer" onClick={(event) => event.stopPropagation()}>
      <div className="drawer-head"><div><h3>{t('center.changeLibrary')}</h3><small>{t('center.librarySettingHint')}</small></div><button className="button ghost compact" onClick={onClose}><X size={16} /></button></div>
      <div className="drawer-body">
        <label className="field"><span>{t('center.libraryPath')}</span><input value={rootPath} onChange={(event) => setRootPath(event.target.value)} /></label>
        <button className="button secondary" disabled={busy} onClick={() => void choose()}><Boxes size={16} />{t('center.chooseDirectory')}</button>
        <p className="muted center-settings-note">{t('center.libraryChangeNotice')}</p>
        {error && <p className="form-error">{error}</p>}
        <div className="drawer-actions"><button className="button secondary" disabled={busy} onClick={onClose}>{t('common.cancel')}</button><button className="button primary" disabled={busy || !rootPath.trim()} onClick={() => void save()}>{t('common.save')}</button></div>
      </div>
    </aside>
  </div>;
}

type DeploymentTarget = { targetId: string; platform: Platform; scope: Scope; directory: string };
type DeploymentPreviewTarget = { targetId: string; state: 'available' | 'managed-link' | 'occupied'; installedPath: string };
type DeploymentTargetGroup = { platform: Platform; targets: DeploymentTarget[] };
type ConflictDecision = 'replace' | 'keep' | 'skip';

function DeploymentDialog({ skill, onClose, onDeployed, setToast }: { skill: CenterSkillView; onClose: () => void; onDeployed: () => void; setToast: (message: string) => void }) {
  const { t } = useTranslation();
  const [targets, setTargets] = useState<DeploymentTarget[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [mode, setMode] = useState<'copy' | 'symlink'>('copy');
  const [preview, setPreview] = useState<{ planId: string; targets: DeploymentPreviewTarget[] } | null>(null);
  const [decisions, setDecisions] = useState<Record<string, ConflictDecision>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => { void getDeploymentTargets().then(setTargets).catch((err) => setError(err instanceof Error ? err.message : String(err))); }, []);
  useEffect(() => {
    if (selectedIds.length === 0) { setPreview(null); return; }
    let active = true;
    void previewDeployment(skill.id, selectedIds, mode).then((result) => { if (active) setPreview(result); }).catch((err) => { if (active) setError(err instanceof Error ? err.message : String(err)); });
    return () => { active = false; };
  }, [mode, selectedIds, skill.id]);

  const previewByTarget = new Map(preview?.targets.map((target) => [target.targetId, target]) ?? []);
  const targetGroups = useMemo<DeploymentTargetGroup[]>(() => {
    const grouped = new Map<Platform, DeploymentTarget[]>();
    for (const target of targets) grouped.set(target.platform, [...(grouped.get(target.platform) ?? []), target]);
    return [...grouped.entries()].map(([platform, groupedTargets]) => ({
      platform,
      targets: groupedTargets.sort((left, right) => left.scope.localeCompare(right.scope)),
    })).sort((left, right) => platformLabel(left.platform).localeCompare(platformLabel(right.platform)));
  }, [targets]);
  const conflicts = selectedIds.filter((id) => previewByTarget.get(id)?.state === 'occupied');
  const unresolved = conflicts.some((id) => !decisions[id]);
  const effectiveIds = selectedIds.filter((id) => previewByTarget.get(id)?.state !== 'occupied' || decisions[id] === 'replace');

  const toggleTarget = (targetId: string) => {
    setSelectedIds((current) => current.includes(targetId) ? current.filter((id) => id !== targetId) : [...current, targetId]);
    setDecisions((current) => { const next = { ...current }; delete next[targetId]; return next; });
  };
  const toggleTargetGroup = (group: DeploymentTargetGroup) => {
    const active = group.targets.find((target) => selectedIds.includes(target.targetId));
    toggleTarget(active?.targetId ?? group.targets.find((target) => target.scope === 'global')?.targetId ?? group.targets[0].targetId);
  };
  const selectTargetScope = (group: DeploymentTargetGroup, target: DeploymentTarget) => {
    setSelectedIds((current) => [...current.filter((id) => !group.targets.some((item) => item.targetId === id)), target.targetId]);
    setDecisions((current) => {
      const next = { ...current };
      for (const item of group.targets) delete next[item.targetId];
      return next;
    });
  };
  const deploy = async () => {
    if (effectiveIds.length === 0 || unresolved) return;
    setBusy(true); setError(null);
    try {
      const fresh = await previewDeployment(skill.id, effectiveIds, mode);
      const force = fresh.targets.some((target) => target.state === 'occupied');
      await commitDeployment(skill.id, effectiveIds, mode, fresh.planId, force);
      setToast(t('center.deployedCount', { count: effectiveIds.length }));
      onDeployed();
    } catch (err) { setError(err instanceof Error ? err.message : String(err)); } finally { setBusy(false); }
  };

  return <div className="drawer-overlay deployment-overlay" onClick={onClose}>
    <aside className="drawer deployment-drawer" role="dialog" aria-modal="true" aria-labelledby="deployment-title" onClick={(event) => event.stopPropagation()}>
      <div className="deploy-drawer-head"><div><h3 id="deployment-title">{t('center.deployTitle')}</h3><div className="deploy-skill"><span className="deploy-skill-icon"><Boxes size={24} /></span><span><strong>{skill.name}</strong><small>{t('center.managedSkill')}</small></span></div></div><button className="button ghost compact" onClick={onClose} aria-label={t('common.close')}><X size={18} /></button></div>
      <div className="deploy-drawer-body">
        <section className="deployment-step"><h4><span>1</span>{t('center.selectTargets')}</h4><p>{t('center.selectTargetsHint')}</p><div className="deployment-target-list">{targetGroups.map((group) => {
          const activeTarget = group.targets.find((target) => selectedIds.includes(target.targetId));
          const displayedTarget = activeTarget ?? group.targets.find((target) => target.scope === 'global') ?? group.targets[0];
          const targetPreview = activeTarget ? previewByTarget.get(activeTarget.targetId) : undefined;
          const occupied = activeTarget && targetPreview?.state === 'occupied';
          return <div className={`deployment-target-card ${activeTarget ? 'selected' : ''}`} key={group.platform}>
            <label className="deployment-target-main"><input type="checkbox" checked={Boolean(activeTarget)} onChange={() => toggleTargetGroup(group)} /><PlatformIcon platform={group.platform} size={20} /><strong>{platformLabel(group.platform)}</strong></label>
            <div className="deployment-scope-controls">{group.targets.map((target) => <button type="button" className={activeTarget?.targetId === target.targetId ? 'active' : ''} key={target.targetId} onClick={() => selectTargetScope(group, target)}>{scopeLabel(target.scope, t)}</button>)}</div>
            <span className="deployment-install-path"><small>{t('center.installPath')}</small><code>{targetPreview?.installedPath ?? displayedTarget.directory}</code></span>
            {occupied && <em>{t('center.targetConflict')}</em>}
          </div>;
        })}</div></section>
        <section className="deployment-step"><h4><span>2</span>{t('center.installMode')}</h4><p>{t('center.installModeHint')}</p><label className="deployment-choice"><input type="radio" name="mode" checked={mode === 'copy'} onChange={() => setMode('copy')} /><span><strong>{t('common.copy')}</strong><small>{t('center.copyHint')}</small></span></label><label className="deployment-choice"><input type="radio" name="mode" checked={mode === 'symlink'} onChange={() => setMode('symlink')} /><span><strong>{t('center.linkShort')}</strong><small>{t('center.linkHint')}</small></span></label></section>
        {conflicts.length > 0 && <section className="deployment-step deployment-conflicts"><h4>3. {t('center.conflictPreview')}</h4>{conflicts.map((targetId) => {
          const target = targets.find((item) => item.targetId === targetId);
          return <div className="deployment-conflict" key={targetId}><strong>{target && `${platformLabel(target.platform)} · ${scopeLabel(target.scope, t)}`}</strong><span>{t('center.conflictDecisionHint')}</span><div>{(['replace', 'keep', 'skip'] as const).map((decision) => <label key={decision}><input type="radio" name={`conflict-${targetId}`} checked={decisions[targetId] === decision} onChange={() => setDecisions((current) => ({ ...current, [targetId]: decision }))} />{t(`center.conflict.${decision}`)}</label>)}</div></div>;
        })}</section>}
        {error && <p className="form-error">{error}</p>}
      </div>
      <div className="deploy-drawer-footer"><button className="button primary full deployment-submit" disabled={busy || selectedIds.length === 0 || unresolved || effectiveIds.length === 0} onClick={() => void deploy()}>{busy ? <LoaderCircle className="spin" size={17} /> : <Rocket size={17} />}{t('center.deploySummary', { count: effectiveIds.length, mode: mode === 'copy' ? t('common.copy') : t('center.linkShort') })}</button>{unresolved && <p className="muted deployment-blocked">{t('center.conflictBlocked')}</p>}</div>
    </aside>
  </div>;
}
