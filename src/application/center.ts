import type { Platform, Scope } from '../types/skill';
import type { ManagedSkill, ManagedSkillSource } from '../library/catalog';
import {
  listManagedSkillDeployments,
  type DeploymentStatus,
  type SkillDeployment,
} from '../library/deployments';
import {
  previewAgentSkillImport,
  type AgentImportCandidateStatus,
} from '../library/importAgentSkills';

export interface CenterInstallationView {
  deploymentId: string;
  platform: Platform;
  scope: Scope;
  mode: 'symlink' | 'copy';
  installedPath: string;
  status: DeploymentStatus;
  installedAt: string;
}

export interface CenterSkillView {
  id: string;
  name: string;
  sourceType: ManagedSkillSource['type'];
  treeHash: string;
  addedAt: string;
  updatedAt: string;
  installations: CenterInstallationView[];
  managed: true;
}

export interface CenterPhysicalView {
  id: string;
  name: string;
  rootPath: string;
  platform: Platform;
  scope: Scope;
  status: AgentImportCandidateStatus;
  treeHash?: string;
  managed: false;
}

export interface CenterView {
  skills: CenterSkillView[];
  physical: CenterPhysicalView[];
  importPlanId: string;
}

/**
 * Unified Skill Center view: the single read model for the management UI.
 * Composes the managed skills (from the center.json single store) with their
 * per-target install records (carrying sync status) and the physically-installed,
 * not-yet-managed agent skills (reclaim candidates).
 *
 * `center.json` is the single source of truth for managed skills and their
 * installations; legacy `catalog.json` / `deployments.json` / `registry.json`
 * are migrated into it on first access (see centerStore.ts).
 */
export function getCenterView(projectDir: string, homeDir?: string): CenterView {
  const { skills, deployments } = listManagedSkillDeployments(projectDir, { homeDir });
  const managedSkills: CenterSkillView[] = skills.map((skill) => toSkillView(skill, deployments));

  const preview = previewAgentSkillImport({ projectDir, homeDir });
  const physical: CenterPhysicalView[] = preview.candidates
    .filter((candidate) => candidate.status !== 'managed-link')
    .filter((candidate) => Boolean(candidate.name))
    .map((candidate) => ({
      id: candidate.id,
      name: candidate.name ?? candidate.rootPath,
      rootPath: candidate.rootPath,
      platform: candidate.platform,
      scope: candidate.scope,
      status: candidate.status,
      treeHash: candidate.treeHash,
      managed: false,
    }));

  return { skills: managedSkills, physical, importPlanId: preview.planId };
}

function toSkillView(skill: ManagedSkill, deployments: SkillDeployment[]): CenterSkillView {
  return {
    id: skill.id,
    name: skill.name,
    sourceType: skill.source.type,
    treeHash: skill.treeHash,
    addedAt: skill.addedAt,
    updatedAt: skill.updatedAt,
    managed: true,
    installations: deployments
      .filter((deployment) => deployment.skillId === skill.id)
      .map(toInstallationView)
      .sort((left, right) => left.platform.localeCompare(right.platform) || left.scope.localeCompare(right.scope)),
  };
}

function toInstallationView(deployment: SkillDeployment): CenterInstallationView {
  return {
    deploymentId: deployment.id,
    platform: deployment.platform,
    scope: deployment.scope,
    mode: deployment.mode,
    installedPath: deployment.installedPath,
    status: deployment.status,
    installedAt: deployment.installedAt,
  };
}
