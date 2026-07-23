import type { IncomingMessage, ServerResponse } from 'node:http';

import {
  commitManagedAgentSkillImport,
  commitManagedSkillDeployment,
  getCenterView,
  getManagedSkillDeploymentTargets,
  getManagedSkillLibrary,
  inspectManagedSkillSource,
  installManagedSkill,
  listTargetAgentSkills,
  previewManagedAgentSkillImport,
  previewManagedSkillDeployment,
  removeManagedSkillEntirely,
  syncManagedSkillDeployment,
  uninstallManagedSkill,
  uninstallManagedSkillDeployment,
} from '../application/actions';
import { normalizePlatformName } from '../platforms/registry';
import { zhMessage } from '../i18n';
import type { AgentImportDecision } from '../library/importAgentSkills';
import { readJsonBody, requiredString, sendJson } from './apiPrimitives';
import type { ApiRequestContext } from './apiContext';
import { pickNativeDirectory } from './nativeDirectoryPicker';

export async function handleLibraryRoute(
  request: IncomingMessage,
  response: ServerResponse,
  url: URL,
  context: ApiRequestContext,
): Promise<boolean> {
  if (request.method === 'POST' && url.pathname === '/api/library/import/preview') {
    const body = await readJsonBody(request);
    sendJson(response, 200, previewManagedAgentSkillImport(context.projectDir, context.homeDir, readImportFilter(body)));
    return true;
  }

  if (request.method === 'POST' && url.pathname === '/api/library/import/commit') {
    const body = await readJsonBody(request);
    sendJson(response, 200, commitManagedAgentSkillImport(
      context.projectDir,
      requiredString(body.planId, 'planId'),
      readImportDecisions(body.decisions),
      context.homeDir,
      readImportFilter(body),
    ));
    return true;
  }

  if (request.method === 'GET' && url.pathname === '/api/library/skills') {
    sendJson(response, 200, getManagedSkillLibrary(context.projectDir, context.homeDir));
    return true;
  }

  if (request.method === 'GET' && url.pathname === '/api/center/skills') {
    sendJson(response, 200, getCenterView(context.projectDir, context.homeDir));
    return true;
  }

  const removeSkillMatch = url.pathname.match(/^\/api\/center\/skills\/([^/]+)$/);
  if (request.method === 'DELETE' && removeSkillMatch) {
    const body = await readJsonBody(request);
    sendJson(response, 200, removeManagedSkillEntirely(
      context.projectDir,
      decodeURIComponent(removeSkillMatch[1]),
      body.force === true,
      context.homeDir,
    ));
    return true;
  }

  if (request.method === 'GET' && url.pathname === '/api/deployments/targets') {
    sendJson(response, 200, { targets: getManagedSkillDeploymentTargets(context.projectDir, context.homeDir) });
    return true;
  }

  if (request.method === 'POST' && url.pathname === '/api/deployments/preview') {
    const body = await readJsonBody(request);
    sendJson(response, 200, previewManagedSkillDeployment(
      context.projectDir,
      requiredString(body.skillId, 'skillId'),
      readTargetIds(body.targetIds),
      readDeploymentMode(body.mode),
      context.homeDir,
    ));
    return true;
  }

  if (request.method === 'POST' && url.pathname === '/api/deployments/commit') {
    const body = await readJsonBody(request);
    sendJson(response, 200, commitManagedSkillDeployment(
      context.projectDir,
      requiredString(body.skillId, 'skillId'),
      readTargetIds(body.targetIds),
      readDeploymentMode(body.mode),
      requiredString(body.planId, 'planId'),
      body.force === true,
      context.homeDir,
    ));
    return true;
  }

  const deploymentSyncMatch = url.pathname.match(/^\/api\/deployments\/([^/]+)\/sync$/);
  if (request.method === 'POST' && deploymentSyncMatch) {
    const body = await readJsonBody(request);
    sendJson(response, 200, syncManagedSkillDeployment(context.projectDir, decodeURIComponent(deploymentSyncMatch[1]), body.force === true, context.homeDir));
    return true;
  }

  const deploymentMatch = url.pathname.match(/^\/api\/deployments\/([^/]+)$/);
  if (request.method === 'DELETE' && deploymentMatch) {
    const body = await readJsonBody(request);
    sendJson(response, 200, uninstallManagedSkillDeployment(
      context.projectDir,
      decodeURIComponent(deploymentMatch[1]),
      body.unregisterOnly === true,
      body.force === true,
      context.homeDir,
    ));
    return true;
  }

  if (request.method === 'POST' && url.pathname === '/api/install') {
    const body = await readJsonBody(request);
    const result = await installManagedSkill({
      source: requiredString(body.source, 'source'),
      sourceType: body.sourceType === 'marketplace' ? 'marketplace' : 'local',
      target: requiredString(body.target, 'target'),
      link: body.link === true,
      scope: readInstallScope(body.scope),
      projectDir: context.projectDir,
      homeDir: context.homeDir,
    });
    sendJson(response, 200, result);
    return true;
  }

  if (request.method === 'POST' && url.pathname === '/api/install/source/inspect') {
    const body = await readJsonBody(request);
    sendJson(response, 200, inspectManagedSkillSource(requiredString(body.source, 'source')));
    return true;
  }

  if (request.method === 'POST' && url.pathname === '/api/install/source/pick') {
    const source = await pickNativeDirectory(zhMessage('picker.skillDirectory'));
    sendJson(response, 200, source ? inspectManagedSkillSource(source) : { cancelled: true });
    return true;
  }

  const installTargetSkillsMatch = url.pathname.match(/^\/api\/install\/targets\/([^/]+)\/skills$/);
  if (request.method === 'GET' && installTargetSkillsMatch) {
    sendJson(response, 200, listTargetAgentSkills(
      decodeURIComponent(installTargetSkillsMatch[1]),
      context.projectDir,
      readInstallScope(url.searchParams.get('scope')),
      context.homeDir,
    ));
    return true;
  }

  if (request.method === 'POST' && url.pathname === '/api/uninstall') {
    const body = await readJsonBody(request);
    const platform = normalizePlatformName(requiredString(body.platform, 'platform'));
    if (!platform) throw new Error('Invalid platform.');
    await uninstallManagedSkill(requiredString(body.name, 'name'), platform, body.force === true, context.homeDir, readInstallScope(body.scope));
    sendJson(response, 200, { removed: true });
    return true;
  }

  return false;
}

function readImportFilter(body: Record<string, unknown>): { platform?: Exclude<ReturnType<typeof normalizePlatformName>, null>; scope?: 'global' | 'project'; physicalOnly?: boolean } {
  const platform = body.target === undefined ? undefined : normalizePlatformName(requiredString(body.target, 'target'));
  if (body.target !== undefined && !platform) throw new Error('Invalid platform.');
  const scope = body.scope === undefined ? undefined : readInstallScope(body.scope);
  return {
    ...(platform ? { platform } : {}),
    ...(scope ? { scope } : {}),
    ...(body.physicalOnly === true ? { physicalOnly: true } : {}),
  };
}

function readImportDecisions(value: unknown): AgentImportDecision[] {
  if (!Array.isArray(value)) throw new Error('decisions must be an array.');
  return value.map((entry) => {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) throw new Error('Each import decision must be an object.');
    const decision = entry as Record<string, unknown>;
    const action = decision.action;
    if (action !== 'keep-copy' && action !== 'replace-with-link' && action !== 'keep-separate' && action !== 'use-managed-link' && action !== 'register' && action !== 'skip') {
      throw new Error('Invalid import decision action.');
    }
    return {
      candidateId: requiredString(decision.candidateId, 'candidateId'),
      action,
      ...(typeof decision.name === 'string' ? { name: decision.name } : {}),
    };
  });
}

function readTargetIds(value: unknown): string[] {
  if (!Array.isArray(value) || value.length === 0 || value.some((entry) => typeof entry !== 'string' || !entry)) {
    throw new Error('targetIds must be a non-empty array of target IDs.');
  }
  return value;
}

function readDeploymentMode(value: unknown): 'symlink' | 'copy' {
  if (value !== 'symlink' && value !== 'copy') throw new Error('mode must be symlink or copy.');
  return value;
}

function readInstallScope(value: unknown): 'global' | 'project' {
  if (value === undefined || value === null || value === 'global') return 'global';
  if (value === 'project') return 'project';
  throw new Error('scope must be global or project.');
}
