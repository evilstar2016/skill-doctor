import {
  commitSkillDeployment,
  listManagedSkillDeployments,
  listSkillDeploymentTargets,
  previewSkillDeployment,
  syncSkillDeployment,
  uninstallSkillDeployment,
  type DeploymentMode,
} from '../library/deployments';
import {
  commitAgentSkillImport,
  previewAgentSkillImport,
  type AgentImportDecision,
  type AgentSkillImportOptions,
} from '../library/importAgentSkills';
import { loadCenter, loadManagedSkills, removeCenterSkill, loadCenterRegistry } from '../library/centerStore';
import { homedir } from 'node:os';
import * as fs from 'node:fs';

export function getManagedRegistry(homeDir?: string) {
  return loadCenterRegistry(homeDir);
}

type AgentImportFilter = Pick<AgentSkillImportOptions, 'platform' | 'scope' | 'physicalOnly'>;

export function previewManagedAgentSkillImport(projectDir: string, homeDir?: string, filter: AgentImportFilter = {}) {
  return previewAgentSkillImport({ projectDir, homeDir, ...filter });
}

export function commitManagedAgentSkillImport(
  projectDir: string,
  planId: string,
  decisions: AgentImportDecision[],
  homeDir?: string,
  filter: AgentImportFilter = {},
) {
  return commitAgentSkillImport({ projectDir, homeDir, planId, decisions, ...filter });
}

export function getManagedSkillLibrary(projectDir: string, homeDir?: string) {
  return listManagedSkillDeployments(projectDir, { homeDir });
}

export function getManagedSkillDeploymentTargets(projectDir: string, homeDir?: string) {
  return listSkillDeploymentTargets(projectDir, { homeDir });
}

export function previewManagedSkillDeployment(
  projectDir: string,
  skillId: string,
  targetIds: string[],
  mode: DeploymentMode,
  homeDir?: string,
) {
  return previewSkillDeployment({ projectDir, skillId, targetIds, mode, homeDir });
}

export function commitManagedSkillDeployment(
  projectDir: string,
  skillId: string,
  targetIds: string[],
  mode: DeploymentMode,
  planId: string,
  force: boolean,
  homeDir?: string,
) {
  return commitSkillDeployment({ projectDir, skillId, targetIds, mode, planId, force, homeDir });
}

export function syncManagedSkillDeployment(projectDir: string, deploymentId: string, force: boolean, homeDir?: string) {
  return syncSkillDeployment({ projectDir, deploymentId, force, homeDir });
}

export function uninstallManagedSkillDeployment(
  projectDir: string,
  deploymentId: string,
  unregisterOnly: boolean,
  force: boolean,
  homeDir?: string,
) {
  return uninstallSkillDeployment({ projectDir, deploymentId, unregisterOnly, force, homeDir });
}

/**
 * Remove a managed skill entirely from the center store:
 * 1. Uninstall all deployments (remove files from agent dirs)
 * 2. Delete skill files from the center library (~/.skill-doctor/skills/<id>)
 * 3. Remove the skill record from center.json
 *
 * This is the "full uninstall" for skills that have zero or more installations.
 */
export function removeManagedSkillEntirely(
  _projectDir: string,
  skillId: string,
  force: boolean,
  homeDir?: string,
): { removed: boolean; uninstalledDeployments: number } {
  const resolvedHome = homeDir ?? homedir();
  const skills = loadManagedSkills(resolvedHome);
  const skill = skills.find((s) => s.id === skillId);
  if (!skill) return { removed: false, uninstalledDeployments: 0 };

  let uninstalled = 0;

  // Step 1: Uninstall all active deployments
  try {
    const { deployments } = listManagedSkillDeployments(_projectDir, { homeDir: resolvedHome });
    const skillDeployments = deployments.filter((d) => d.skillId === skillId);
    for (const dep of skillDeployments) {
      try {
        uninstallSkillDeployment({ projectDir: _projectDir, deploymentId: dep.id, unregisterOnly: false, force, homeDir: resolvedHome });
        uninstalled++;
      } catch {
        // Continue removing other deployments even if one fails
      }
    }
  } catch {
    // Non-fatal: proceed to delete skill files and record
  }

  // Step 2: Delete skill files from center library
  try {
    if (fs.existsSync(skill.rootPath)) {
      fs.rmSync(skill.rootPath, { recursive: true, force: true });
    }
  } catch {
    // Non-fatal: record removal is more important
  }

  // Step 3: Remove skill record from center.json
  removeCenterSkill(resolvedHome, skillId);

  return { removed: true, uninstalledDeployments: uninstalled };
}
