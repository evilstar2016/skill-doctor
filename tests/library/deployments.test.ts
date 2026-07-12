import * as fs from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import { importLocalSkill } from '../../src/library/importLocalSkill.js';
import { commitSkillDeployment, listManagedSkillDeployments, listSkillDeploymentTargets, previewSkillDeployment, syncSkillDeployment, uninstallSkillDeployment } from '../../src/library/deployments.js';
import { saveRegistry } from '../../src/install/registry.js';

const tempRoots: string[] = [];

afterEach(() => {
  for (const root of tempRoots) fs.rmSync(root, { recursive: true, force: true });
  tempRoots.length = 0;
});

function makeTempDir(): string {
  const directory = fs.mkdtempSync(join(tmpdir(), 'skill-doctor-deployments-'));
  tempRoots.push(directory);
  return directory;
}

function addSkill(root: string, name = 'review'): string {
  const source = join(root, 'source', name);
  fs.mkdirSync(join(source, 'scripts'), { recursive: true });
  fs.writeFileSync(join(source, 'SKILL.md'), `---\nname: ${name}\ndescription: test\n---\n# ${name}\n`);
  fs.writeFileSync(join(source, 'scripts', 'run.sh'), '#!/bin/sh\necho review\n');
  fs.chmodSync(join(source, 'scripts', 'run.sh'), 0o755);
  fs.writeFileSync(join(source, 'asset.txt'), 'asset');
  return source;
}

function importSkill(root: string, homeDir: string, name = 'review') {
  return importLocalSkill({ sourcePath: addSkill(root, name), homeDir }).skill;
}

describe('managed skill deployments', () => {
  it('deploys one managed skill to global and current-project directory targets without losing assets', () => {
    const root = makeTempDir();
    const homeDir = join(root, 'home');
    const projectDir = join(root, 'project');
    fs.mkdirSync(projectDir, { recursive: true });
    const skill = importSkill(root, homeDir);
    const targetIds = ['claude-global-skills', 'codex-project-skills'];

    const preview = previewSkillDeployment({ skillId: skill.id, targetIds, mode: 'symlink', projectDir, homeDir });
    const result = commitSkillDeployment({ skillId: skill.id, targetIds, mode: 'symlink', planId: preview.planId, projectDir, homeDir });

    expect(result.outcomes.map((outcome) => outcome.status)).toEqual(['deployed', 'deployed']);
    expect(fs.lstatSync(join(homeDir, '.claude', 'skills', 'review')).isSymbolicLink()).toBe(true);
    expect(fs.readFileSync(join(projectDir, '.codex', 'skills', 'review', 'asset.txt'), 'utf8')).toBe('asset');
    expect(fs.statSync(join(projectDir, '.codex', 'skills', 'review', 'scripts', 'run.sh')).mode & 0o111).not.toBe(0);
    expect(listManagedSkillDeployments(projectDir, { homeDir }).deployments).toEqual(expect.arrayContaining([
      expect.objectContaining({ skillId: skill.id, scope: 'global', status: 'synced' }),
      expect.objectContaining({ skillId: skill.id, scope: 'project', projectDir, status: 'synced' }),
    ]));
  });

  it('classifies copy drift and only overwrites a modified copy with force confirmation', () => {
    const root = makeTempDir();
    const homeDir = join(root, 'home');
    const projectDir = join(root, 'project');
    fs.mkdirSync(projectDir, { recursive: true });
    const skill = importSkill(root, homeDir);
    const preview = previewSkillDeployment({ skillId: skill.id, targetIds: ['claude-global-skills'], mode: 'copy', projectDir, homeDir });
    const deployment = commitSkillDeployment({ skillId: skill.id, targetIds: ['claude-global-skills'], mode: 'copy', planId: preview.planId, projectDir, homeDir }).outcomes[0];
    const deploymentId = deployment.deploymentId!;
    const copiedSkill = join(homeDir, '.claude', 'skills', 'review');

    fs.appendFileSync(join(skill.rootPath, 'SKILL.md'), '\ncentral update\n');
    expect(listManagedSkillDeployments(projectDir, { homeDir }).deployments.find((entry) => entry.id === deploymentId)?.status).toBe('outdated');
    fs.appendFileSync(join(copiedSkill, 'SKILL.md'), '\nlocal edit\n');
    expect(listManagedSkillDeployments(projectDir, { homeDir }).deployments.find((entry) => entry.id === deploymentId)?.status).toBe('modified');
    expect(() => syncSkillDeployment({ deploymentId, projectDir, homeDir })).toThrow('Modified copies require force');

    const synced = syncSkillDeployment({ deploymentId, projectDir, homeDir, force: true });
    expect(synced.status).toBe('synced');
    expect(fs.readFileSync(join(copiedSkill, 'SKILL.md'), 'utf8')).toContain('central update');
    expect(fs.readFileSync(join(copiedSkill, 'SKILL.md'), 'utf8')).not.toContain('local edit');
  });

  it('does not remove a modified selected deployment unless it is explicitly unregistered or forced', () => {
    const root = makeTempDir();
    const homeDir = join(root, 'home');
    const projectDir = join(root, 'project');
    fs.mkdirSync(projectDir, { recursive: true });
    const skill = importSkill(root, homeDir);
    const preview = previewSkillDeployment({ skillId: skill.id, targetIds: ['claude-global-skills'], mode: 'copy', projectDir, homeDir });
    const deploymentId = commitSkillDeployment({ skillId: skill.id, targetIds: ['claude-global-skills'], mode: 'copy', planId: preview.planId, projectDir, homeDir }).outcomes[0].deploymentId!;
    const installedPath = join(homeDir, '.claude', 'skills', 'review');
    fs.appendFileSync(join(installedPath, 'SKILL.md'), '\nlocal edit\n');

    expect(() => uninstallSkillDeployment({ deploymentId, projectDir, homeDir })).toThrow('Modified or conflicting');
    const result = uninstallSkillDeployment({ deploymentId, projectDir, homeDir, unregisterOnly: true });
    expect(result).toEqual(expect.objectContaining({ removed: false, unregistered: true, status: 'modified' }));
    expect(fs.existsSync(installedPath)).toBe(true);
  });

  it('rejects a target changed after preview and adopts only matching legacy registrations', () => {
    const root = makeTempDir();
    const homeDir = join(root, 'home');
    const projectDir = join(root, 'project');
    fs.mkdirSync(projectDir, { recursive: true });
    const skill = importSkill(root, homeDir);
    const stalePreview = previewSkillDeployment({ skillId: skill.id, targetIds: ['claude-global-skills'], mode: 'copy', projectDir, homeDir });
    fs.mkdirSync(join(homeDir, '.claude', 'skills', 'review'), { recursive: true });
    fs.writeFileSync(join(homeDir, '.claude', 'skills', 'review', 'SKILL.md'), 'occupied');
    expect(() => commitSkillDeployment({ skillId: skill.id, targetIds: ['claude-global-skills'], mode: 'copy', planId: stalePreview.planId, projectDir, homeDir })).toThrow('preview is stale');
    fs.rmSync(join(homeDir, '.claude', 'skills', 'review'), { recursive: true, force: true });
    fs.cpSync(skill.rootPath, join(homeDir, '.claude', 'skills', 'review'), { recursive: true });
    saveRegistry(join(homeDir, '.skill-doctor', 'registry.json'), {
      version: 1,
      entries: [{ name: 'review', platform: 'claude', scope: 'global', installedPath: join(homeDir, '.claude', 'skills', 'review', 'SKILL.md'), installedAt: '2026-01-01T00:00:00.000Z', contentHash: 'sha256:legacy', source: 'local', sourceRef: '/legacy' }],
    });

    const library = listManagedSkillDeployments(projectDir, { homeDir });
    expect(library.legacy).toEqual([expect.objectContaining({ status: 'migrated' })]);
    expect(library.deployments).toEqual(expect.arrayContaining([expect.objectContaining({ skillId: skill.id, targetId: 'claude-global-skills' })]));
  });

  it('lists only declared writable skill-directory targets, including current-project targets', () => {
    const root = makeTempDir();
    const homeDir = join(root, 'home');
    const projectDir = join(root, 'project');
    fs.mkdirSync(projectDir, { recursive: true });

    const targets = listSkillDeploymentTargets(projectDir, { homeDir });
    expect(targets).toEqual(expect.arrayContaining([
      expect.objectContaining({ targetId: 'claude-global-skills', scope: 'global', layout: 'skill-dirs' }),
      expect.objectContaining({ targetId: 'claude-project-skills', scope: 'project', directory: join(projectDir, '.claude', 'skills') }),
    ]));
    expect(targets.some((target) => target.targetId === 'cursor-global-rules')).toBe(false);
    expect(targets.some((target) => target.directory === '/etc/codex/skills')).toBe(false);
  });
});
