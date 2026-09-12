import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync, existsSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { parseTOML } from 'confbox/toml';
import { applyHistoryControl, previewHistoryControl, publicControlPreview, reportControlTarget, undoHistoryControl } from '../../src/context/historyControls';

describe('history project controls', () => {
  let root: string; let project: string; let home: string; let config: string;
  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'history-controls-')); project = join(root, 'project'); home = join(root, 'home');
    mkdirSync(join(project, '.codex'), { recursive: true }); mkdirSync(join(home, '.codex'), { recursive: true });
    config = join(project, '.codex/config.toml');
  });
  afterEach(() => rmSync(root, { recursive: true, force: true }));
  const target = { kind: 'recommendation' as const, id: 'figma@openai-curated-remote' };
  it('merges inherited connector entries, changes only project and restores absent config', () => {
    const global = '# global\n[tool_suggest]\ndisabled_tools = [{type="connector", id="keep"}]\n';
    writeFileSync(join(home, '.codex/config.toml'), global);
    const preview = previewHistoryControl(project, target, false, home);
    expect(existsSync(config)).toBe(false);
    expect(publicControlPreview(preview)).not.toHaveProperty('before');
    const result = applyHistoryControl(project, target, false, preview.digest, home);
    expect(parseTOML<any>(readFileSync(config, 'utf8')).tool_suggest.disabled_tools).toEqual([{ type: 'connector', id: 'keep' }, { type: 'plugin', id: target.id }]);
    expect(readFileSync(join(home, '.codex/config.toml'), 'utf8')).toBe(global);
    undoHistoryControl(project, result.operationId);
    expect(existsSync(config)).toBe(false);
  });
  it('preserves multiline lists, comments and unrelated tables', () => {
    writeFileSync(config, '# keep\n[tool_suggest]\ndisabled_tools = [\n {type="connector", id="keep"},\n {type="plugin", id="other@remote"},\n]\n[features]\nother = true\n');
    const preview = previewHistoryControl(project, target, false, home);
    expect(preview.after).toContain('# keep'); expect(preview.after).toContain('other = true');
    const result = applyHistoryControl(project, target, false, preview.digest, home);
    const enable = previewHistoryControl(project, target, true, home);
    expect(parseTOML<any>(enable.after).tool_suggest.disabled_tools).toHaveLength(2);
    undoHistoryControl(project, result.operationId);
    expect(readFileSync(config, 'utf8')).toContain('disabled_tools = [\n');
  });
  it('sets both block gates, preserves installed plugins and rejects stale confirmation', () => {
    writeFileSync(config, '[features]\nother = true\n[plugins.figma]\nenabled = true\n');
    const block = { kind: 'recommendations' as const, id: 'recommended_plugins' };
    const preview = previewHistoryControl(project, block, false, home);
    expect(parseTOML<any>(preview.after).features).toEqual({ other: true, tool_suggest: false, recommended_plugins: false });
    expect(parseTOML<any>(preview.after).plugins.figma.enabled).toBe(true);
    writeFileSync(config, '# changed\n' + readFileSync(config, 'utf8'));
    expect(() => applyHistoryControl(project, block, false, preview.digest, home)).toThrow('stale');
  });
  it('refuses stale inherited configuration and undo after subsequent edits', () => {
    const preview = previewHistoryControl(project, target, false, home);
    writeFileSync(join(home, '.codex/config.toml'), '[features]\nother = true\n');
    expect(() => applyHistoryControl(project, target, false, preview.digest, home)).toThrow('stale');
    const fresh = previewHistoryControl(project, target, false, home);
    const result = applyHistoryControl(project, target, false, fresh.digest, home);
    writeFileSync(config, fresh.after + '\n# user edit');
    expect(() => undoHistoryControl(project, result.operationId)).toThrow('subsequent');
    expect(readFileSync(config, 'utf8')).toContain('# user edit');
  });
  it('writes and restores a single Skill without changing its siblings', () => {
    const skill = join(root, 'SKILL.md'); writeFileSync(skill, 'fixture');
    writeFileSync(config, `[[skills.config]]\npath = ${JSON.stringify(skill)}\nenabled = true\n[[skills.config]]\npath = "/other/SKILL.md"\nenabled = true\n`);
    const target = { kind: 'skill' as const, id: skill };
    const preview = previewHistoryControl(project, target, false, home);
    expect(parseTOML<any>(preview.after).skills.config.map((item: any) => item.enabled)).toEqual([false, true]);
    const result = applyHistoryControl(project, target, false, preview.digest, home);
    undoHistoryControl(project, result.operationId);
    expect(readFileSync(config, 'utf8')).toBe(preview.before);
  });
  it('rejects unsupported layouts and symlinked configuration without writing', () => {
    writeFileSync(config, 'tool_suggest.disabled_tools = []\n');
    expect(() => previewHistoryControl(project, target, false, home)).toThrow();
    expect(readFileSync(config, 'utf8')).toBe('tool_suggest.disabled_tools = []\n');
    rmSync(config); const outside = join(home, '.codex/config.toml'); writeFileSync(outside, ''); symlinkSync(outside, config);
    expect(() => previewHistoryControl(project, target, false, home)).toThrow('symlink');
  });
  it('rejects other projects and unknown candidates', () => {
    const report = { kind: 'skill-doctor-codex-benefit-report', projectDir: project, historyAnalysis: { usageProfile: [] } } as any;
    expect(() => reportControlTarget(report, home, 'recommendations', 'recommended_plugins')).toThrow('project');
    expect(() => reportControlTarget(report, project, 'recommended_plugins', 'invented')).toThrow('missing');
  });
  it('never treats the user home as a project-level global-config toggle', () => {
    expect(() => previewHistoryControl(home, target, false, home)).toThrow('global');
    expect(existsSync(join(home, '.codex/config.toml'))).toBe(false);
  });
});
