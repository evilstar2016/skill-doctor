import * as fs from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, describe, expect, it } from 'vitest';

import {
  inspectManagedSkillSource,
  installManagedSkill,
  listTargetAgentSkills,
} from '../../src/application/install';

const tempRoots: string[] = [];

afterEach(() => {
  for (const root of tempRoots) fs.rmSync(root, { recursive: true, force: true });
  tempRoots.length = 0;
});

function tempRoot(): string {
  const root = fs.mkdtempSync(join(tmpdir(), 'skill-doctor-install-source-'));
  tempRoots.push(root);
  return root;
}

function writeSkill(path: string, name?: string): void {
  fs.mkdirSync(path, { recursive: true });
  fs.writeFileSync(join(path, 'SKILL.md'), name ? `---\nname: ${name}\n---\n` : '# Skill\n');
}

describe('managed skill installation sources', () => {
  it('previews every SKILL.md under a typed directory without installing it', () => {
    const root = tempRoot();
    const source = join(root, 'source');
    writeSkill(join(source, 'alpha'), 'alpha');
    writeSkill(join(source, 'nested', 'beta'), 'beta');
    fs.mkdirSync(join(source, 'empty'), { recursive: true });

    const result = inspectManagedSkillSource(source);

    expect(result.skills).toEqual([
      expect.objectContaining({ name: 'alpha', relativePath: join('alpha', 'SKILL.md') }),
      expect.objectContaining({ name: 'beta', relativePath: join('nested', 'beta', 'SKILL.md') }),
    ]);
    expect(fs.existsSync(join(root, 'home', '.claude', 'skills'))).toBe(false);
  });

  it('rejects a directory that contains no skill entries', () => {
    const source = join(tempRoot(), 'empty');
    fs.mkdirSync(source, { recursive: true });

    expect(() => inspectManagedSkillSource(source)).toThrow('No SKILL.md files found');
  });

  it('lists managed and unmanaged skills already present in the target Agent', async () => {
    const root = tempRoot();
    const homeDir = join(root, 'home');
    const projectDir = join(root, 'project');
    const uploadSource = join(root, 'source', 'uploaded');
    writeSkill(join(homeDir, '.claude', 'skills', 'manual'), 'manual');
    writeSkill(join(projectDir, '.claude', 'skills', 'project-skill'), 'project-skill');
    writeSkill(uploadSource, 'uploaded');
    await installManagedSkill({
      source: uploadSource,
      sourceType: 'local',
      target: 'claude',
      homeDir,
    });

    const result = listTargetAgentSkills('claude', projectDir, 'global', homeDir);

    expect(result.targetPath).toBe(join(homeDir, '.claude', 'skills'));
    expect(result.skills).toEqual([
      expect.objectContaining({ name: 'manual', managed: false, scope: 'global' }),
      expect.objectContaining({ name: 'project-skill', managed: false, scope: 'project' }),
      expect.objectContaining({ name: 'uploaded', managed: true, scope: 'global' }),
    ]);
  });

  it('installs the same skill independently in global and project scope', async () => {
    const root = tempRoot();
    const homeDir = join(root, 'home');
    const projectDir = join(root, 'project');
    const source = join(root, 'source', 'shared');
    writeSkill(source, 'shared');

    await installManagedSkill({ source, sourceType: 'local', target: 'claude', scope: 'global', projectDir, homeDir });
    await installManagedSkill({ source, sourceType: 'local', target: 'claude', scope: 'project', projectDir, homeDir });

    expect(fs.existsSync(join(homeDir, '.claude', 'skills', 'shared', 'SKILL.md'))).toBe(true);
    expect(fs.existsSync(join(projectDir, '.claude', 'skills', 'shared', 'SKILL.md'))).toBe(true);
    const result = listTargetAgentSkills('claude', projectDir, 'project', homeDir);
    expect(result.scope).toBe('project');
    expect(result.targetPath).toBe(join(projectDir, '.claude', 'skills'));
    expect(result.skills.filter((skill) => skill.name === 'shared')).toHaveLength(2);
  });
});
