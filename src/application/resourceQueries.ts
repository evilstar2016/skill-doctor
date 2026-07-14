import { runDiff } from '../diff/runDiff';
import { loadUserConfig } from '../config/loadUserConfig';
import { buildExplanation } from '../explain/buildExplanation';
import { loadWhenToUseCache, saveWhenToUseCache } from '../explain/whenToUseCache';
import type { LlmExplainOptions } from '../types/explain';
import type { DoctorSnapshot, ResourceDetailPayload } from './types';
import { getWhenToUseCachePath } from './runtimePaths';

export interface ResourceQueryRuntime {
  homeDir?: string;
  whenToUseCachePath?: string;
}

function getAnalysisOptions(homeDir?: string): LlmExplainOptions | undefined {
  const analysis = loadUserConfig(homeDir).config.analysis;
  if (!analysis?.baseUrl || !analysis.model) return undefined;
  return {
    baseUrl: analysis.baseUrl,
    modelId: analysis.model,
    ...(analysis.apiKey ? { apiKey: analysis.apiKey } : {}),
    ...(analysis.timeoutMs ? { timeoutMs: analysis.timeoutMs } : {}),
  };
}

export async function getResourceDetail(
  snapshot: DoctorSnapshot,
  resourceId: string,
  runtime: ResourceQueryRuntime = {},
): Promise<ResourceDetailPayload> {
  const resource = snapshot.resources.find((entry) => entry.id === resourceId);
  if (!resource) throw new Error(`Resource not found: ${resourceId}`);
  const record = snapshot.skills.find((skill) => skill.sourcePath === resource.sourcePath && skill.name === resource.name);
  const llmOptions = getAnalysisOptions(runtime.homeDir);
  const cachePath = runtime.whenToUseCachePath ?? getWhenToUseCachePath(runtime.homeDir);
  const whenToUseCache = loadWhenToUseCache(cachePath);
  const skill = record ? await buildExplanation(record, snapshot.skills, { llmOptions, whenToUseCache }) : undefined;
  if (whenToUseCache.size > 0) saveWhenToUseCache(whenToUseCache, cachePath);
  return {
    resource,
    ...(skill ? { skill } : {}),
    issues: snapshot.issues.filter((issue) => issue.resourceIds.includes(resourceId)),
  };
}

export async function compareResources(
  snapshot: DoctorSnapshot,
  leftId: string,
  rightId: string,
  homeDir?: string,
) {
  const left = snapshot.resources.find((entry) => entry.id === leftId);
  const right = snapshot.resources.find((entry) => entry.id === rightId);
  if (!left || !right) throw new Error('Choose two existing resources to compare.');
  if (!snapshot.skills.some((skill) => skill.name === left.name) || !snapshot.skills.some((skill) => skill.name === right.name)) {
    throw new Error('Only skill-like resources can be compared.');
  }
  return runDiff(left.name, right.name, snapshot.skills, { llmOptions: getAnalysisOptions(homeDir) });
}
