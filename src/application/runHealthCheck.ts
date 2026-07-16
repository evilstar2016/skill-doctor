import { existsSync, realpathSync } from 'node:fs';
import { normalize, resolve } from 'node:path';

import { runAiAudit } from '../audit/ai-scanner';
import { runAudit } from '../audit/runAudit';
import { suggestCleanup } from '../cleanup/suggestCleanup';
import { filterConflicts, filterFindings } from '../config/applyIgnoreList';
import { loadUserConfig } from '../config/loadUserConfig';
import { detectConflicts } from '../conflicts/detectConflicts';
import { estimateContextCost } from '../context/estimateContextCost';
import { scanCodexPluginCache } from '../context/scanCodexPluginCache';
import { scanCodexContextEntries } from '../context/scanCodexContext';
import { groupSkills } from '../explain/groupSkills';
import { getDefaultGroupLabelCachePath, loadGroupLabelCache, saveGroupLabelCache } from '../explain/groupLabelCache';
import { loadRegistry } from '../install/registry';
import type { LlmExplainOptions } from '../types/explain';
import type { McpServerRecord } from '../types/mcp';
import type { Platform, SkillRecord } from '../types/skill';
import { addCodexResourceGroups, filterByPlatform, filterByScope, stableId } from './helpers';
import { buildDoctorSnapshot } from './buildSnapshot';
import { createHealthCheckScanContext, type HealthCheckScanContext } from './scanContext';
import type { DoctorSnapshot, HealthCheckOptions, ScanPhase, ScanProgressEvent, ScanWarning } from './types';

const PHASES: ScanPhase[] = ['discovering', 'conflicts', 'audit', 'context', 'grouping', 'complete'];

export async function runHealthCheck(
  options: HealthCheckOptions,
  onProgress?: (event: ScanProgressEvent) => void,
): Promise<DoctorSnapshot> {
  const startedAt = Date.now();
  const projectDir = resolve(options.projectDir);
  const scope = options.scope ?? 'all';
  const platform = options.platform ?? null;
  const includeContext = options.includeContext ?? true;
  const warnings: ScanWarning[] = [];
  const loaded = loadUserConfig(options.homeDir);
  const llmOptions = getAnalysisOptions(loaded.config.analysis);
  const embedding = loaded.config.embedding;
  const registry = loadRegistry(getRegistryPath(options.homeDir));
  const progress = (phase: ScanPhase, message: string) => {
    onProgress?.({ phase, message, completed: PHASES.indexOf(phase) + 1, total: PHASES.length });
    assertNotAborted(options.signal);
  };

  progress('discovering', 'i18n:progress.discovering');
  const scanContext = await createHealthCheckScanContext({
    projectDir,
    homeDir: options.homeDir,
    config: loaded.config,
    extraPaths: loaded.config.paths?.extra,
    llmOptions,
    provenanceCache: options.provenanceCache,
  });
  const skills = filterByPlatform(filterByScope(scanContext.skills, scope), platform);
  let mcpServers = filterByPlatform(filterByScope(scanContext.mcpServers, scope), platform);
  const consumerSkills = filterByScope(scanContext.skills, scope);
  const consumerMcpServers = filterByScope(scanContext.mcpServers, scope);
  const analysisSkills = options.deduplicatePhysicalSkills === false ? skills : uniquePhysicalSkills(skills);
  const ignore = options.applyIgnore === false ? {} : (loaded.config.ignore ?? {});

  if (options.discoverMcpTools !== false && mcpServers.length > 0) {
    mcpServers = await discoverMcpToolsSafely(mcpServers, warnings, scanContext.discoverMcpToolsForServers);
  }

  progress('conflicts', 'i18n:progress.conflicts');
  const conflicts = filterConflicts(await detectConflicts(analysisSkills, {
    strategy: options.conflictStrategy ?? 'token',
    analyze: options.analyzeConflicts ?? false,
    ...(embedding?.baseUrl ? { baseUrl: embedding.baseUrl } : {}),
    ...(embedding?.model ? { modelId: embedding.model } : {}),
    ...(embedding?.apiKey ? { apiKey: embedding.apiKey } : {}),
    ...(llmOptions?.baseUrl ? { analysisBaseUrl: llmOptions.baseUrl } : {}),
    ...(llmOptions?.modelId ? { analysisModelId: llmOptions.modelId } : {}),
    ...(llmOptions?.apiKey ? { analysisApiKey: llmOptions.apiKey } : {}),
    ...options.conflictOptions,
  }), ignore);

  progress('audit', 'i18n:progress.audit');
  const staticAudit = runAudit(analysisSkills);
  const findings = filterFindings(staticAudit.findings, ignore);
  let aiFindings = staticAudit.aiFindings ?? [];
  if (options.useAiAudit) {
    if (!llmOptions) {
      warnings.push(warning('audit', 'ai-not-configured', 'i18n:warning.aiNotConfigured'));
    } else {
      try {
        aiFindings = await runAiAudit(analysisSkills, { llmOptions, useCache: options.aiAuditUseCache ?? true });
      } catch (error) {
        warnings.push(warning('audit', 'ai-audit-failed', `i18n:warning.aiAuditFailed|error=${encodeURIComponent(errorMessage(error))}`));
      }
    }
  }
  const audit = {
    ...staticAudit,
    findings,
    aiFindings,
    summary: options.preserveUnfilteredAuditSummary ? staticAudit.summary : summarizeAudit(findings),
  };

  let context: DoctorSnapshot['context'];
  if (includeContext) {
    progress('context', 'i18n:progress.context');
    try {
      const contextEntries = await loadContextEntries(projectDir, scope, platform, options, scanContext);
      context = addCodexResourceGroups(estimateContextCost(contextEntries, {
        ...(options.budgetTokens ? { budgetTokens: options.budgetTokens } : {}),
        ...(options.platformBudgets ? { platformBudgets: options.platformBudgets } : {}),
        projectPath: projectDir,
        scope,
        tokenizer: options.tokenizer ?? 'openai',
        ...(options.tokenizerModel ? { tokenizerModel: options.tokenizerModel } : {}),
      }));
      if (options.includeCache && (!platform || platform === 'codex')) {
        context = { ...context, catalog: scanCodexPluginCache({ homeDir: options.homeDir }) };
      }
    } catch (error) {
      warnings.push(warning('context', 'context-scan-failed', `i18n:warning.contextFailed|error=${encodeURIComponent(errorMessage(error))}`));
    }
  }

  let groups: DoctorSnapshot['groups'];
  if (options.includeGroups !== false) {
    progress('grouping', 'i18n:progress.grouping');
    try {
      const cachePath = getDefaultGroupLabelCachePath(options.homeDir);
      const labelCache = loadGroupLabelCache(cachePath);
      groups = await groupSkills(analysisSkills, { llmOptions: undefined, labelCache });
      if (labelCache.size > 0) saveGroupLabelCache(labelCache, cachePath);
    } catch (error) {
      warnings.push(warning('grouping', 'grouping-failed', `i18n:warning.groupingFailed|error=${encodeURIComponent(errorMessage(error))}`));
    }
  }

  const snapshot = buildDoctorSnapshot({
    startedAt,
    projectDir,
    scope,
    platform,
    skills,
    mcpServers,
    consumerSkills,
    consumerMcpServers,
    conflicts,
    audit,
    context,
    suggestions: suggestCleanup(conflicts),
    warnings,
    registry: registry.entries,
    aiAuditConfigured: Boolean(llmOptions),
    embeddingConfigured: Boolean(embedding?.baseUrl && embedding.model),
    groups,
  });
  progress('complete', snapshot.status === 'partial' ? 'i18n:status.partial' : 'i18n:status.complete');
  return snapshot;
}

function uniquePhysicalSkills(skills: SkillRecord[]): SkillRecord[] {
  const seen = new Set<string>();
  return skills.filter((skill) => {
    let path = normalize(skill.sourcePath);
    try { if (existsSync(path)) path = realpathSync(path); } catch { /* use normalized path */ }
    const key = `${path}\0${skill.name}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

async function loadContextEntries(
  projectDir: string,
  scope: HealthCheckOptions['scope'],
  platform: Platform | null,
  options: HealthCheckOptions,
  scanContext: HealthCheckScanContext,
) {
  const effectiveScope = scope ?? 'all';
  const entries: Parameters<typeof estimateContextCost>[0] = [];

  if (!platform || platform === 'codex') {
    entries.push(...filterByScope(await scanCodexContextEntries(projectDir, {
      homeDir: options.homeDir,
      includeDisabled: options.includeDisabled ?? true,
      resource: 'all',
      discoverMcpTools: options.discoverMcpTools ?? true,
      discoverMcpToolsForServers: scanContext.discoverMcpToolsForServers,
      scanSources: scanContext.scanSources,
    }), effectiveScope));
  }

  if (platform !== 'codex') {
    const costSkills = filterByPlatform(
      filterByScope(scanContext.skills, effectiveScope),
      platform,
    ).filter((entry) => entry.platform !== 'codex');
    let servers = filterByPlatform(filterByScope(scanContext.mcpServers, effectiveScope), platform)
      .filter((entry) => entry.platform !== 'codex');
    if (options.discoverMcpTools !== false) servers = await scanContext.discoverMcpToolsForServers(servers);
    entries.push(...costSkills, ...servers);
  }

  return entries;
}

async function discoverMcpToolsSafely(
  servers: McpServerRecord[],
  warnings: ScanWarning[],
  discoverTools: (servers: McpServerRecord[]) => Promise<McpServerRecord[]>,
): Promise<McpServerRecord[]> {
  const results = await discoverTools(servers);
  for (const server of results) {
    if (server.toolDiscoveryStatus === 'failed') {
      warnings.push({
        ...warning('discovering', 'mcp-discovery-failed', `i18n:warning.mcpDiscoveryFailed|error=${encodeURIComponent(`${server.name}: ${server.toolDiscoveryError ?? 'unavailable_tool_list'}`)}`),
        resourceId: server.id,
      });
    }
  }
  return results;
}

function summarizeAudit(findings: Array<{ severity: 'high' | 'med' | 'low' }>) {
  const summary = { high: 0, med: 0, low: 0 };
  for (const finding of findings) summary[finding.severity] += 1;
  return summary;
}

function warning(phase: ScanPhase, code: string, message: string): ScanWarning {
  return { id: stableId('warning', phase, code, message), phase, code, message, recoverable: true };
}

function getAnalysisOptions(config: { baseUrl?: string; model?: string; apiKey?: string; timeoutMs?: number } | undefined): LlmExplainOptions | undefined {
  if (!config?.baseUrl || !config.model) return undefined;
  return {
    baseUrl: config.baseUrl,
    modelId: config.model,
    ...(config.apiKey ? { apiKey: config.apiKey } : {}),
    ...(config.timeoutMs ? { timeoutMs: config.timeoutMs } : {}),
  };
}

function getRegistryPath(homeDir?: string): string {
  const home = homeDir ?? process.env.HOME ?? process.env.USERPROFILE ?? '';
  return resolve(home, '.skill-doctor', 'registry.json');
}

function assertNotAborted(signal: AbortSignal | undefined): void {
  if (signal?.aborted) throw new DOMException('Scan cancelled', 'AbortError');
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
