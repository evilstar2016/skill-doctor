import { randomUUID } from 'node:crypto';
import * as fs from 'node:fs';
import { basename, dirname, join } from 'node:path';

import type { Platform } from '../types/skill.js';

export interface ManagedSkill {
  id: string;
  name: string;
  rootPath: string;
  treeHash: string;
  source: ManagedSkillSource;
  addedAt: string;
  updatedAt: string;
}

export type ManagedSkillSource =
  | { type: 'agent-import'; originalPath: string; platform: Platform }
  | { type: 'local'; originalPath: string }
  | {
      type: 'github';
      repositoryUrl: string;
      subpath?: string;
      requestedRef?: string;
      resolvedCommit: string;
    }
  | { type: 'marketplace'; sourceRef: string };

export interface ManagedSkillCatalog {
  version: 1;
  skills: ManagedSkill[];
}

export class ManagedSkillCatalogError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ManagedSkillCatalogError';
  }
}

export function loadManagedSkillCatalog(catalogPath: string): ManagedSkillCatalog {
  if (!fs.existsSync(catalogPath)) {
    return { version: 1, skills: [] };
  }

  try {
    const catalog = JSON.parse(fs.readFileSync(catalogPath, 'utf8')) as unknown;
    if (!isManagedSkillCatalog(catalog)) {
      throw new ManagedSkillCatalogError(`Invalid managed skill catalog: ${catalogPath}`);
    }
    return catalog;
  } catch (error) {
    if (error instanceof ManagedSkillCatalogError) throw error;
    throw new ManagedSkillCatalogError(`Unable to read managed skill catalog: ${catalogPath}`);
  }
}

export function saveManagedSkillCatalog(catalogPath: string, catalog: ManagedSkillCatalog): void {
  if (!isManagedSkillCatalog(catalog)) {
    throw new ManagedSkillCatalogError('Refusing to save an invalid managed skill catalog.');
  }

  fs.mkdirSync(dirname(catalogPath), { recursive: true });
  const temporaryPath = join(dirname(catalogPath), `.${basename(catalogPath)}.${randomUUID()}.tmp`);
  try {
    fs.writeFileSync(temporaryPath, JSON.stringify(catalog, null, 2) + '\n', 'utf8');
    fs.renameSync(temporaryPath, catalogPath);
  } finally {
    fs.rmSync(temporaryPath, { force: true });
  }
}

function isManagedSkillCatalog(value: unknown): value is ManagedSkillCatalog {
  if (!isRecord(value) || value.version !== 1 || !Array.isArray(value.skills)) return false;
  return value.skills.every(isManagedSkill);
}

function isManagedSkill(value: unknown): value is ManagedSkill {
  return isRecord(value) &&
    isNonEmptyString(value.id) &&
    isNonEmptyString(value.name) &&
    isNonEmptyString(value.rootPath) &&
    isNonEmptyString(value.treeHash) &&
    isManagedSkillSource(value.source) &&
    isNonEmptyString(value.addedAt) &&
    isNonEmptyString(value.updatedAt);
}

function isManagedSkillSource(value: unknown): value is ManagedSkillSource {
  if (!isRecord(value) || typeof value.type !== 'string') return false;
  if (value.type === 'local') return isNonEmptyString(value.originalPath);
  if (value.type === 'agent-import') return isNonEmptyString(value.originalPath) && isNonEmptyString(value.platform);
  if (value.type === 'marketplace') return isNonEmptyString(value.sourceRef);
  if (value.type === 'github') {
    return isNonEmptyString(value.repositoryUrl) &&
      isNonEmptyString(value.resolvedCommit) &&
      (value.subpath === undefined || isNonEmptyString(value.subpath)) &&
      (value.requestedRef === undefined || isNonEmptyString(value.requestedRef));
  }
  return false;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}
