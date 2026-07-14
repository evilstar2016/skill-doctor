import { loadRegistry } from '../install/registry';
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
} from '../library/importAgentSkills';
import { getRegistryPath } from './runtimePaths';

export function getManagedRegistry(homeDir?: string) {
  return loadRegistry(getRegistryPath(homeDir));
}

export function previewManagedAgentSkillImport(projectDir: string, homeDir?: string) {
  return previewAgentSkillImport({ projectDir, homeDir });
}

export function commitManagedAgentSkillImport(
  projectDir: string,
  planId: string,
  decisions: AgentImportDecision[],
  homeDir?: string,
) {
  return commitAgentSkillImport({ projectDir, homeDir, planId, decisions });
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
