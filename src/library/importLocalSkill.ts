import { randomUUID } from 'node:crypto';
import * as fs from 'node:fs';
import { join } from 'node:path';

import {
  type ManagedSkill,
  type ManagedSkillSource,
  loadManagedSkillCatalog,
  saveManagedSkillCatalog,
} from './catalog.js';
import { getManagedSkillPaths } from './paths.js';
import { copySkillDirectory, inspectSkillDirectory } from './skillDirectory.js';

export interface ImportLocalSkillOptions {
  sourcePath: string;
  homeDir?: string;
  name?: string;
  source?: ManagedSkillSource;
}

export interface ImportLocalSkillResult {
  skill: ManagedSkill;
  imported: boolean;
  duplicate: boolean;
}

export class ManagedSkillNameConflictError extends Error {
  constructor(name: string) {
    super(`A managed skill named '${name}' already exists with different content.`);
    this.name = 'ManagedSkillNameConflictError';
  }
}

export function importLocalSkill(options: ImportLocalSkillOptions): ImportLocalSkillResult {
  const source = inspectSkillDirectory(options.sourcePath);
  const paths = getManagedSkillPaths(options.homeDir);
  const catalog = loadManagedSkillCatalog(paths.catalogPath);
  const duplicate = catalog.skills.find((skill) => skill.treeHash === source.treeHash);
  if (duplicate) {
    return { skill: duplicate, imported: false, duplicate: true };
  }
  const name = options.name ?? source.name;
  if (catalog.skills.some((skill) => normalizeName(skill.name) === normalizeName(name))) {
    throw new ManagedSkillNameConflictError(name);
  }

  fs.mkdirSync(paths.stagingDir, { recursive: true });
  const stagingPath = fs.mkdtempSync(join(paths.stagingDir, 'local-import-'));
  const stagedSkillPath = join(stagingPath, 'skill');
  let promotedPath: string | undefined;

  try {
    copySkillDirectory(source.rootPath, stagedSkillPath);
    const staged = inspectSkillDirectory(stagedSkillPath);
    if (staged.treeHash !== source.treeHash) {
      throw new Error('Skill directory changed while it was being imported. Try again.');
    }

    const now = new Date().toISOString();
    const id = randomUUID();
    const skill: ManagedSkill = {
      id,
      name,
      rootPath: join(paths.skillsDir, id),
      treeHash: staged.treeHash,
      source: options.source ?? { type: 'local', originalPath: source.rootPath },
      addedAt: now,
      updatedAt: now,
    };
    fs.mkdirSync(paths.skillsDir, { recursive: true });
    if (fs.existsSync(skill.rootPath)) {
      throw new Error(`Managed skill destination already exists: ${skill.rootPath}`);
    }
    fs.renameSync(stagedSkillPath, skill.rootPath);
    promotedPath = skill.rootPath;

    saveManagedSkillCatalog(paths.catalogPath, {
      version: 1,
      skills: [...catalog.skills, skill],
    });
    return { skill, imported: true, duplicate: false };
  } catch (error) {
    if (promotedPath && fs.existsSync(promotedPath)) {
      fs.rmSync(promotedPath, { recursive: true, force: true });
    }
    throw error;
  } finally {
    fs.rmSync(stagingPath, { recursive: true, force: true });
  }
}

function normalizeName(name: string): string {
  return name.trim().toLocaleLowerCase('en-US');
}
