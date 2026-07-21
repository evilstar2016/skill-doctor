import type { BootstrapPayload, DoctorSnapshot, HealthCheckScope, ResourceDetailPayload } from '../../src/application/types';
import type { DetectedAgent } from '../../src/discovery/detectAgents';
import type { DiffResult } from '../../src/diff/types';
import type { Platform, Scope } from '../../src/types/skill';
import type { AgentScanSourcesUserConfig } from '../../src/config/loadUserConfig';
import type { EffectiveScanSource } from '../../src/config/scanSources';
import type { InstallSourceSkill, TargetAgentSkill } from '../../src/application/install';
import type { CenterView } from '../../src/application/center';
import type { AgentImportCommitResult, AgentImportDecision, AgentSkillImportPreview } from '../../src/library/importAgentSkills';

export interface ScanRequest {
  projectDir: string;
  scope: HealthCheckScope;
  platform: Platform | 'all';
  includeContext: boolean;
  includeDisabled: boolean;
  includeCache: boolean;
  discoverMcpTools: boolean;
  useAiAudit: boolean;
  conflictStrategy: 'token' | 'embedding';
  analyzeConflicts: boolean;
  budgetTokens: number;
  tokenizer: 'openai' | 'approx';
  tokenizerModel: string;
}

export async function detectAgents(projectDir: string): Promise<{ projectDir: string; agents: DetectedAgent[] }> {
  return request('/api/agents/detect', { method: 'POST', body: JSON.stringify({ projectDir }) });
}

export interface ScanStreamHandlers {
  progress(event: { phase: string; message: string; completed: number; total: number }): void;
  complete(snapshot: DoctorSnapshot): void;
  error(error: Error): void;
  cancelled(): void;
}

export async function getBootstrap(): Promise<BootstrapPayload> {
  return request('/api/bootstrap');
}

export async function pickProjectDirectory() {
  return request<{ projectDir: string } | { cancelled: true }>('/api/project-directory/pick', {
    method: 'POST', body: '{}',
  });
}

export interface ScanSourcesPayload {
  projectDir: string;
  configPath: string;
  sources: EffectiveScanSource[];
}

export async function getScanSources(): Promise<ScanSourcesPayload> {
  return request('/api/scan-sources');
}

export async function validateScanSources(scanSources: Record<string, AgentScanSourcesUserConfig>) {
  return request<{ valid: true; scanSources: Record<string, AgentScanSourcesUserConfig> }>('/api/scan-sources/validate', {
    method: 'POST', body: JSON.stringify({ scanSources }),
  });
}

export async function saveScanSources(scanSources: Record<string, AgentScanSourcesUserConfig>) {
  return request<{ saved: true; sources: EffectiveScanSource[] }>('/api/scan-sources', {
    method: 'PUT', body: JSON.stringify({ scanSources }),
  });
}

export async function resetScanSources(platform: Platform) {
  return request<{ reset: true; sources: EffectiveScanSource[] }>('/api/scan-sources/reset', {
    method: 'POST', body: JSON.stringify({ platform }),
  });
}

export async function startScan(options: ScanRequest): Promise<string> {
  const result = await request<{ scanId: string }>('/api/scans', { method: 'POST', body: JSON.stringify(options) });
  return result.scanId;
}

export function streamScan(scanId: string, handlers: ScanStreamHandlers): () => void {
  const source = new EventSource(`/api/scans/${encodeURIComponent(scanId)}/events`);
  source.addEventListener('progress', (event) => handlers.progress(JSON.parse((event as MessageEvent).data)));
  source.addEventListener('complete', (event) => {
    handlers.complete(JSON.parse((event as MessageEvent).data));
    source.close();
  });
  source.addEventListener('cancelled', () => {
    handlers.cancelled();
    source.close();
  });
  source.addEventListener('error', (event) => {
    if (event instanceof MessageEvent && event.data) {
      const payload = JSON.parse(event.data);
      handlers.error(new Error(payload.message));
    } else if (source.readyState === EventSource.CLOSED) {
      handlers.error(new Error('scan_connection_closed'));
    }
    source.close();
  });
  return () => source.close();
}

export async function cancelScan(scanId: string): Promise<void> {
  await request(`/api/scans/${encodeURIComponent(scanId)}/cancel`, { method: 'POST' });
}

export async function getResourceDetail(id: string): Promise<ResourceDetailPayload> {
  return request(`/api/resources/${encodeURIComponent(id)}`);
}

export async function compareResources(leftId: string, rightId: string): Promise<DiffResult> {
  return request('/api/compare', { method: 'POST', body: JSON.stringify({ leftId, rightId }) });
}

export async function toggleContextResource(id: string, enabled: boolean) {
  return request<{ changed: boolean; supported: boolean; message: string; configPath: string; requiresNewSession: boolean }>('/api/context/toggle', {
    method: 'POST', body: JSON.stringify({ id, enabled }),
  });
}

export async function cleanupDuplicate(issueId: string, removePath: string, confirmation: string) {
  return request<{ removedPath: string }>('/api/cleanup', {
    method: 'POST', body: JSON.stringify({ issueId, removePath, confirmation }),
  });
}

export async function installSkill(input: { source: string; sourceType: 'local' | 'marketplace'; target: string; scope: Scope; link: boolean }) {
  return request<{ name: string; installedPath: string }>('/api/install', { method: 'POST', body: JSON.stringify(input) });
}

export async function inspectSkillSource(source: string) {
  return request<{ sourcePath: string; skills: InstallSourceSkill[] }>('/api/install/source/inspect', {
    method: 'POST', body: JSON.stringify({ source }),
  });
}

export async function pickSkillSourceDirectory() {
  return request<{ sourcePath: string; skills: InstallSourceSkill[] } | { cancelled: true }>('/api/install/source/pick', {
    method: 'POST', body: '{}',
  });
}

export async function getTargetAgentSkills(target: string, scope: Scope) {
  return request<{ targetPath: string; scope: Scope; availableScopes: Scope[]; skills: TargetAgentSkill[] }>(`/api/install/targets/${encodeURIComponent(target)}/skills?scope=${encodeURIComponent(scope)}`);
}

export async function previewPhysicalAgentSkills(target: string, scope: Scope) {
  return request<AgentSkillImportPreview>('/api/library/import/preview', {
    method: 'POST', body: JSON.stringify({ target, scope, physicalOnly: true }),
  });
}

export async function reclaimPhysicalAgentSkills(input: { planId: string; target: string; scope: Scope; decisions: AgentImportDecision[] }) {
  return request<AgentImportCommitResult>('/api/library/import/commit', {
    method: 'POST', body: JSON.stringify({ ...input, physicalOnly: true }),
  });
}

export async function uninstallSkill(input: { name: string; platform: Platform; scope: Scope; force: boolean }) {
  return request<{ removed: boolean }>('/api/uninstall', { method: 'POST', body: JSON.stringify(input) });
}

export async function getCenterSkills(): Promise<CenterView> {
  return request<CenterView>('/api/center/skills');
}

export async function syncDeployment(deploymentId: string, force: boolean = false) {
  return request<{ status: string }>(`/api/deployments/${encodeURIComponent(deploymentId)}/sync`, {
    method: 'POST', body: JSON.stringify({ force }),
  });
}

export async function uninstallDeployment(deploymentId: string, force: boolean = false) {
  return request<{ removed: boolean }>(`/api/deployments/${encodeURIComponent(deploymentId)}`, {
    method: 'DELETE', body: JSON.stringify({ force }),
  });
}

export async function previewDeployment(skillId: string, targetIds: string[], mode: 'symlink' | 'copy') {
  return request<{ planId: string; targets: Array<{ targetId: string; status?: string }> }>('/api/deployments/preview', {
    method: 'POST', body: JSON.stringify({ skillId, targetIds, mode }),
  });
}

export async function commitDeployment(skillId: string, targetIds: string[], mode: 'symlink' | 'copy', planId: string, force: boolean = false) {
  return request<{ outcomes: Array<{ targetId: string; status: string }> }>('/api/deployments/commit', {
    method: 'POST', body: JSON.stringify({ skillId, targetIds, mode, planId, force }),
  });
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
    credentials: 'same-origin',
  });
  const contentType = response.headers.get('content-type') ?? '';
  const isJson = contentType.includes('application/json');
  const payload = isJson ? await response.json() : await response.text();
  if (!response.ok) {
    const message = typeof payload === 'object' && payload && 'error' in payload
      ? String((payload as { error: { message?: string } }).error.message ?? response.statusText)
      : String(payload || response.statusText);
    throw new Error(message);
  }
  if (!isJson || typeof payload !== 'object' || payload === null) {
    throw new Error('API 返回了非 JSON 响应，后端服务是否已在运行？(The API returned a non-JSON response; is the backend server running?)');
  }
  return payload as T;
}
