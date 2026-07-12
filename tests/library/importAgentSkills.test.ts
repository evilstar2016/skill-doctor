import * as fs from 'node:fs';
import { join } from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { loadManagedSkillCatalog } from '../../src/library/catalog.js';
import { commitAgentSkillImport, previewAgentSkillImport } from '../../src/library/importAgentSkills.js';
import { importLocalSkill } from '../../src/library/importLocalSkill.js';
import { getManagedSkillPaths } from '../../src/library/paths.js';
import { cleanupTempRoots, createTempRoot, writeFile } from '../helpers/cliHarness.js';

afterEach(() => {
  vi.restoreAllMocks();
  cleanupTempRoots();
});

function writeSkill(root: string, name: string, body = 'Review changes safely.'): string {
  writeFile(join(root, 'SKILL.md'), `---\nname: ${name}\ndescription: ${body}\n---\n\n# ${name}\n${body}\n`);
  writeFile(join(root, 'scripts', 'check.sh'), '#!/bin/sh\necho check\n');
  return root;
}

function preview(homeDir: string, projectDir: string) {
  return previewAgentSkillImport({ homeDir, projectDir });
}

describe('Agent skill import preview', () => {
  it('classifies copies, name conflicts, links, invalid skills, and unreadable targets without changing files', () => {
    const root = createTempRoot();
    const homeDir = join(root, 'home');
    const projectDir = join(root, 'project');
    const skillsDir = join(homeDir, '.claude', 'skills');
    const managedSource = writeSkill(join(root, 'managed-source'), 'shared');
    const managed = importLocalSkill({ sourcePath: managedSource, homeDir }).skill;
    const identical = writeSkill(join(skillsDir, 'identical'), 'shared');
    writeSkill(join(skillsDir, 'conflict'), 'shared', 'Different content.');
    writeFile(join(skillsDir, 'invalid', 'README.md'), '# not a skill\n');
    const external = writeSkill(join(root, 'external-skill'), 'external');
    fs.symlinkSync(external, join(skillsDir, 'external-link'), 'dir');
    fs.symlinkSync(managed.rootPath, join(skillsDir, 'managed-link'), 'dir');
    const unreadable = join(skillsDir, 'unreadable');
    writeSkill(unreadable, 'unreadable');
    fs.chmodSync(unreadable, 0o000);

    let plan;
    try {
      plan = preview(homeDir, projectDir);
    } finally {
      fs.chmodSync(unreadable, 0o755);
    }

    expect(plan.candidates.map((candidate) => candidate.status)).toEqual(expect.arrayContaining([
      'identical-copy', 'same-name-different-content', 'managed-link', 'external-link', 'invalid', 'unreadable',
    ]));
    expect(plan.candidates.find((candidate) => candidate.rootPath === identical)?.managedSkillId).toBe(managed.id);
    expect(plan.candidates.find((candidate) => candidate.status === 'same-name-different-content')?.allowedActions).toEqual(['keep-separate', 'use-managed-link', 'skip']);
    expect(fs.lstatSync(join(skillsDir, 'external-link')).isSymbolicLink()).toBe(true);
  });

  it('requires a decision and rejects a changed candidate before writing', () => {
    const root = createTempRoot();
    const homeDir = join(root, 'home');
    const projectDir = join(root, 'project');
    const skill = writeSkill(join(homeDir, '.claude', 'skills', 'review'), 'review');
    const plan = preview(homeDir, projectDir);
    const candidate = plan.candidates[0];

    expect(commitAgentSkillImport({ homeDir, projectDir, planId: plan.planId, decisions: [] }).outcomes[0]).toMatchObject({
      status: 'failed', failedStep: 'decision',
    });
    expect(fs.existsSync(skill)).toBe(true);

    fs.appendFileSync(join(skill, 'SKILL.md'), 'Changed after preview.\n');
    expect(() => commitAgentSkillImport({
      homeDir, projectDir, planId: plan.planId, decisions: [{ candidateId: candidate.id, action: 'keep-copy' }],
    })).toThrow('stale');
  });
});

describe('Agent skill import commit', () => {
  it('requires a renamed keep-separate decision for same-name content', () => {
    const root = createTempRoot();
    const homeDir = join(root, 'home');
    const projectDir = join(root, 'project');
    importLocalSkill({ sourcePath: writeSkill(join(root, 'managed'), 'review'), homeDir });
    writeSkill(join(homeDir, '.claude', 'skills', 'review'), 'review', 'Different review instructions.');
    const plan = preview(homeDir, projectDir);
    const candidate = plan.candidates[0];

    expect(commitAgentSkillImport({
      homeDir, projectDir, planId: plan.planId, decisions: [{ candidateId: candidate.id, action: 'keep-separate' }],
    }).outcomes[0]).toMatchObject({ status: 'failed', failedStep: 'central-import' });

    const result = commitAgentSkillImport({
      homeDir,
      projectDir,
      planId: plan.planId,
      decisions: [{ candidateId: candidate.id, action: 'keep-separate', name: 'review-agent-copy' }],
    });
    expect(result.outcomes[0].status).toBe('imported');
    expect(loadManagedSkillCatalog(getManagedSkillPaths(homeDir).catalogPath).skills.map((skill) => skill.name)).toEqual([
      'review', 'review-agent-copy',
    ]);
  });

  it('imports and replaces an Agent directory with a verified managed directory link', () => {
    const root = createTempRoot();
    const homeDir = join(root, 'home');
    const projectDir = join(root, 'project');
    const agentSkill = writeSkill(join(homeDir, '.claude', 'skills', 'review'), 'review');
    const plan = preview(homeDir, projectDir);
    const candidate = plan.candidates[0];

    const result = commitAgentSkillImport({
      homeDir, projectDir, planId: plan.planId, decisions: [{ candidateId: candidate.id, action: 'replace-with-link' }],
    });
    const outcome = result.outcomes[0];
    const catalog = loadManagedSkillCatalog(getManagedSkillPaths(homeDir).catalogPath);

    expect(outcome.status).toBe('linked');
    expect(fs.lstatSync(agentSkill).isSymbolicLink()).toBe(true);
    expect(fs.realpathSync(agentSkill)).toBe(fs.realpathSync(catalog.skills[0].rootPath));
    expect(catalog.skills[0].source).toMatchObject({ type: 'agent-import', originalPath: agentSkill, platform: 'claude' });
    expect(fs.readdirSync(getManagedSkillPaths(homeDir).backupsDir)).toHaveLength(1);
  });

  it('restores the original Agent directory and removes new managed metadata when link takeover fails', () => {
    const root = createTempRoot();
    const homeDir = join(root, 'home');
    const projectDir = join(root, 'project');
    const agentSkill = writeSkill(join(homeDir, '.claude', 'skills', 'review'), 'review');
    const plan = preview(homeDir, projectDir);
    const result = commitAgentSkillImport({
      homeDir,
      projectDir,
      planId: plan.planId,
      decisions: [{ candidateId: plan.candidates[0].id, action: 'replace-with-link' }],
      linkFactory: () => { throw new Error('link failed'); },
    });
    const paths = getManagedSkillPaths(homeDir);

    expect(result.outcomes[0]).toMatchObject({
      status: 'failed', rollback: { originalRestored: true, managedSkillRemoved: true },
    });
    expect(fs.lstatSync(agentSkill).isDirectory()).toBe(true);
    expect(fs.readFileSync(join(agentSkill, 'SKILL.md'), 'utf8')).toContain('Review changes safely.');
    expect(loadManagedSkillCatalog(paths.catalogPath).skills).toEqual([]);
    expect(fs.readdirSync(paths.skillsDir)).toEqual([]);
  });
});
