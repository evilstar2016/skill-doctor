import { Download, FileCode2, FolderOpen, LoaderCircle, PackagePlus, Search, Trash2 } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import type { BootstrapPayload, DoctorSnapshot } from '../../../src/application/types';
import type { InstallSourceSkill, TargetAgentSkill } from '../../../src/application/install';
import type { Platform, Scope } from '../../../src/types/skill';
import { getTargetAgentSkills, inspectSkillSource, installSkill, pickSkillSourceDirectory, uninstallSkill } from '../api';
import { PageHeading, platformLabel, scopeLabel, shortPath } from '../components/ui';

type SelectableSkill = InstallSourceSkill;

type InstallPlatform = Exclude<Platform, 'unknown'>;

export function ManagePage({ bootstrap, snapshot, onChanged, setToast }: { bootstrap: BootstrapPayload | null; snapshot: DoctorSnapshot | null; onChanged: () => void; setToast: (message: string) => void }) {
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
  const [link, setLink] = useState(false);
  const [busy, setBusy] = useState(false);
  const [sourceBusy, setSourceBusy] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  useEffect(() => {
    if (platforms.length > 0 && !platforms.includes(target)) setTarget(platforms[0]);
  }, [platforms, target]);

  useEffect(() => {
    let active = true;
    setTargetLoading(true);
    void getTargetAgentSkills(target, installScope).then((result) => {
      if (!active) return;
      setTargetSkills(result.skills);
      setTargetPath(result.targetPath);
      setAvailableScopes(result.availableScopes);
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
        setToast(`已安装 ${result.name}`);
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
        setToast(`已安装 ${installed} 个 Skills`);
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

  return <section><PageHeading title="管理与导出" subtitle="安装受信任的 skill、管理已登记资源并导出报告。"><a className="button secondary" href="/api/export/dashboard" download><Download size={16} />导出报告</a></PageHeading>
    <div className="manage-grid"><section className="panel install-panel"><div className="panel-heading"><div><h3>安装 Skill</h3><p>先预览来源，再选择要同步到目标 Agent 的 skills</p></div><PackagePlus size={20} /></div>
      <div className="segmented"><button className={sourceType === 'local' ? 'active' : ''} onClick={() => chooseSourceType('local')}>本地来源</button><button className={sourceType === 'marketplace' ? 'active' : ''} onClick={() => chooseSourceType('marketplace')}>Marketplace</button></div>
      {sourceType === 'local' ? <>
        <label className="field"><span>SKILL.md 或目录地址</span><div className="source-input-row"><input aria-label="SKILL.md 或目录地址" value={source} onChange={(event) => setSource(event.target.value)} placeholder="/path/to/skills" /><button className="button secondary compact" disabled={!source.trim() || sourceBusy} onClick={() => void inspectSource()}>{sourceBusy ? <LoaderCircle className="spin" size={15} /> : <Search size={15} />}读取</button></div></label>
        <div className="directory-choice"><span>或者</span><button className="button secondary" disabled={sourceBusy} onClick={() => void chooseDirectory()}><FolderOpen size={16} />选择本地来源目录</button><small>后端直接读取磁盘路径，不传输文件内容</small></div>
        {skills.length > 0 && <div className="skill-picker"><div className="skill-picker-heading"><div><strong>来源 Skills</strong><small>{sourceLabel} · 找到 {skills.length} 个</small></div><label><input type="checkbox" aria-label="全选可安装 Skills" checked={selectableSkills.length > 0 && selectedSkills.length === selectableSkills.length} onChange={(event) => setSelectedIds(event.target.checked ? selectableSkills.map((skill) => skill.id) : [])} />全选可安装</label></div><div className="skill-check-list">{skills.map((skill) => { const exists = existingNames.has(skill.name.toLowerCase()); return <label className={exists ? 'disabled' : ''} key={skill.id}><input type="checkbox" checked={!exists && selectedIds.includes(skill.id)} disabled={exists} onChange={(event) => toggleSkill(skill.id, event.target.checked)} /><span><code>{skill.name}</code><small>{skill.relativePath}</small></span>{exists && <em>目标已存在</em>}</label>; })}</div></div>}
        <label className="check-row"><input type="checkbox" checked={link} onChange={(event) => setLink(event.target.checked)} />使用符号链接，便于同步本地修改</label>
      </> : <label className="field"><span>Skill slug</span><input value={source} onChange={(event) => setSource(event.target.value)} placeholder="owner/skill-name" /></label>}
      <label className="field"><span>安装到</span><select value={target} onChange={(event) => setTarget(event.target.value as InstallPlatform)}>{platforms.map((value) => <option key={value} value={value}>{platformLabel(value)}</option>)}</select></label>
      <label className="field"><span>安装范围</span><select aria-label="安装范围" value={installScope} onChange={(event) => setInstallScope(event.target.value as Scope)}><option value="global" disabled={!availableScopes.includes('global')}>全局</option><option value="project" disabled={!availableScopes.includes('project')}>当前项目</option></select></label>
      {localError && <p className="form-error">{localError}</p>}
      <button className="button primary full" disabled={busy || (sourceType === 'marketplace' ? !source.trim() : selectedSkills.length === 0)} onClick={() => void submit()}>{busy ? <LoaderCircle className="spin" size={17} /> : <PackagePlus size={17} />}{sourceType === 'marketplace' ? '安装' : `安装已选 (${selectedSkills.length})`}</button>
    </section><section className="panel target-skills-panel"><div className="panel-heading"><div><h3>目标 Agent 已有 Skills</h3><p>同步前用于核对重名和现有能力</p></div><span className="result-count">{targetSkills.length}</span></div>{targetPath && <code className="target-path">{scopeLabel(installScope)}安装目录 · {shortPath(targetPath)}</code>}{targetLoading ? <div className="loading-line"><LoaderCircle className="spin" size={17} />正在读取</div> : <div className="target-skill-list">{targetSkills.map((skill) => <div key={skill.sourcePath}><span><code>{skill.name}</code><small>{shortPath(skill.sourcePath)}</small></span><span className="target-skill-badges"><em>{scopeLabel(skill.scope)}</em>{skill.managed && <em>已登记</em>}</span></div>)}{targetSkills.length === 0 && <p className="muted empty-copy">该 Agent 还没有 skill。</p>}</div>}</section></div>
    <section className="panel report-panel"><div className="panel-heading"><div><h3>扫描与报告</h3><p>保留本地诊断结果用于分享</p></div><FileCode2 size={20} /></div><div className="action-list"><div><span>静态 HTML 报告</span><small>包含资源、冲突、安全和清理建议</small></div><a className="button secondary" href="/api/export/dashboard" download>下载</a><div><span>当前快照</span><small>{snapshot ? `${snapshot.summary.resources} 个资源 · ${snapshot.summary.issues} 个问题` : '尚未扫描'}</small></div><span className="muted">{snapshot ? new Date(snapshot.generatedAt).toLocaleString() : '—'}</span></div></section>
    <section className="panel registry-panel"><div className="panel-heading"><div><h3>已登记安装</h3><p>通过 Skill Doctor 安装的 skills</p></div><span className="result-count">{bootstrap?.registry.length ?? 0}</span></div><div className="registry-list">{bootstrap?.registry.map((entry) => <div className="registry-row" key={`${entry.platform}:${entry.scope}:${entry.name}`}><div><code>{entry.name}</code><small>{entry.platform} · {scopeLabel(entry.scope)} · {entry.source} · {shortPath(entry.installedPath)}</small></div><button className="button danger compact" onClick={async () => { if (!window.confirm(`确认卸载 ${entry.name}？`)) return; try { await uninstallSkill({ name: entry.name, platform: entry.platform, scope: entry.scope, force: false }); setToast(`已卸载 ${entry.name}`); onChanged(); } catch (error) { if (window.confirm(`${error instanceof Error ? error.message : error}\n是否强制卸载？`)) { await uninstallSkill({ name: entry.name, platform: entry.platform, scope: entry.scope, force: true }); setToast(`已强制卸载 ${entry.name}`); onChanged(); } } }}><Trash2 size={15} />卸载</button></div>)}{!bootstrap?.registry.length && <p className="muted empty-copy">还没有通过 Skill Doctor 安装的资源。</p>}</div></section>
  </section>;
}
