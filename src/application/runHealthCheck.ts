import { existsSync, realpathSync } from 'node:fs';
import { normalize, resolve } from 'node:path';

import { runAiAudit } from '../audit/ai-scanner';
import { runAudit } from '../audit/runAudit';
import { suggestCleanup } from '../cleanup/suggestCleanup';
import { filterConflicts, filterFindings } from '../config/applyIgnoreList';
import { loadUserConfig } from '../config/loadUserConfig';
import { loadEffectiveScanSources } from '../config/scanSources';
import { detectConflicts } from '../conflicts/detectConflicts';
import { estimateContextCost } from '../context/estimateContextCost';
import { scanCodexPluginCache } from '../context/scanCodexPluginCache';
import { scanCodexContextEntries } from '../context/scanCodexContext';
import { scanSkills } from '../discovery/scanSkills';
import { groupSkills } from '../explain/groupSkills';
import { getDefaultGroupLabelCachePath, loadGroupLabelCache, saveGroupLabelCache } from '../explain/groupLabelCache';
import { loadRegistry } from '../install/registry';
import { discoverMcpToolsForServers } from '../mcp/listMcpTools';
import { scanMcpServers } from '../mcp/scanMcpServers';
import type { LlmExplainOptions } from '../types/explain';
import type { McpServerRecord } from '../types/mcp';
import type { Platform, SkillRecord } from '../types/skill';
import { addCodexResourceGroups, filterByPlatform, filterByScope, stableId } from './helpers';
import { buildDoctorSnapshot } from './buildSnapshot';
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
  const scanSources = loadEffectiveScanSources(projectDir, { homeDir: options.homeDir });
  const llmOptions = getAnalysisOptions(loaded.config.analysis);
  const embedding = loaded.config.embedding;
  const registry = loadRegistry(getRegistryPath(options.homeDir));
  const progress = (phase: ScanPhase, message: string) => {
    onProgress?.({ phase, message, completed: PHASES.indexOf(phase) + 1, total: PHASES.length });
    assertNotAborted(options.signal);
  };

  progress('discovering', '正在发现 skills、rules、instructions 与 MCP 配置');
  let skills = filterByPlatform(filterByScope(await scanSkills(projectDir, {
    homeDir: options.homeDir,
    extraPaths: loaded.config.paths?.extra,
    sources: scanSources,
  }), scope), platform);
  let mcpServers = filterByPlatform(filterByScope(scanMcpServers(projectDir, {
    homeDir: options.homeDir,
    files: scanSources.filter((entry) => entry.resource === 'mcp' && entry.enabled).map((entry) => ({
      platform: entry.platform, scope: entry.scope, path: entry.resolvedPath, format: entry.format ?? 'json',
    })),
  }), scope), platform);
  const analysisSkills = uniquePhysicalSkills(skills);

  if (options.discoverMcpTools && mcpServers.length > 0) {
    mcpServers = await discoverMcpToolsSafely(mcpServers, warnings);
  }

  progress('conflicts', '正在检查重复安装与触发冲突');
  const conflicts = filterConflicts(await detectConflicts(analysisSkills, {
    strategy: options.conflictStrategy ?? 'token',
    analyze: options.analyzeConflicts ?? false,
    ...(embedding?.baseUrl ? { baseUrl: embedding.baseUrl } : {}),
    ...(embedding?.model ? { modelId: embedding.model } : {}),
    ...(embedding?.apiKey ? { apiKey: embedding.apiKey } : {}),
    ...(llmOptions?.baseUrl ? { analysisBaseUrl: llmOptions.baseUrl } : {}),
    ...(llmOptions?.modelId ? { analysisModelId: llmOptions.modelId } : {}),
    ...(llmOptions?.apiKey ? { analysisApiKey: llmOptions.apiKey } : {}),
  }), loaded.config.ignore ?? {});

  progress('audit', '正在执行安全审计');
  const staticAudit = runAudit(analysisSkills);
  const findings = filterFindings(staticAudit.findings, loaded.config.ignore ?? {});
  let aiFindings = staticAudit.aiFindings ?? [];
  if (options.useAiAudit) {
    if (!llmOptions) {
      warnings.push(warning('audit', 'ai-not-configured', 'AI 审计未运行：尚未配置 analysis 服务。'));
    } else {
      try {
        aiFindings = await runAiAudit(analysisSkills, { llmOptions, useCache: true });
      } catch (error) {
        warnings.push(warning('audit', 'ai-audit-failed', `AI 审计失败：${errorMessage(error)}`));
      }
    }
  }
  const audit = {
    ...staticAudit,
    findings,
    aiFindings,
    summary: summarizeAudit(findings),
  };

  let context: DoctorSnapshot['context'];
  if (includeContext) {
    progress('context', '正在估算固定与按需上下文成本');
    try {
      const contextEntries = await loadContextEntries(projectDir, scope, platform, options, loaded.config.paths?.extra, scanSources);
      context = addCodexResourceGroups(estimateContextCost(contextEntries, {
        ...(options.budgetTokens ? { budgetTokens: options.budgetTokens } : {}),
        projectPath: projectDir,
        scope,
        tokenizer: options.tokenizer ?? 'openai',
        ...(options.tokenizerModel ? { tokenizerModel: options.tokenizerModel } : {}),
      }));
      if (options.includeCache && (!platform || platform === 'codex')) {
        context = { ...context, catalog: scanCodexPluginCache({ homeDir: options.homeDir }) };
      }
    } catch (error) {
      warnings.push(warning('context', 'context-scan-failed', `上下文成本分析未完成：${errorMessage(error)}`));
    }
  }

  progress('grouping', '正在整理资源用途');
  let groups: DoctorSnapshot['groups'];
  try {
    const cachePath = getDefaultGroupLabelCachePath(options.homeDir);
    const labelCache = loadGroupLabelCache(cachePath);
    groups = await groupSkills(analysisSkills, { llmOptions: undefined, labelCache });
    if (labelCache.size > 0) saveGroupLabelCache(labelCache, cachePath);
  } catch (error) {
    warnings.push(warning('grouping', 'grouping-failed', `资源分组未完成：${errorMessage(error)}`));
  }

  const snapshot = buildDoctorSnapshot({
    startedAt,
    projectDir,
    scope,
    platform,
    skills,
    mcpServers,
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
  progress('complete', snapshot.status === 'partial' ? '体检完成，部分项目需要关注' : '体检完成');
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
  extraPaths: string[] | undefined,
  scanSources: ReturnType<typeof loadEffectiveScanSources>,
) {
  const effectiveScope = scope ?? 'all';
  const entries: Parameters<typeof estimateContextCost>[0] = [];

  if (!platform || platform === 'codex') {
    entries.push(...filterByScope(await scanCodexContextEntries(projectDir, {
      homeDir: options.homeDir,
      includeDisabled: options.includeDisabled ?? true,
      resource: 'all',
      discoverMcpTools: options.discoverMcpTools ?? false,
      scanSources,
    }), effectiveScope));
  }

  if (platform !== 'codex') {
    const costSkills = filterByPlatform(
      filterByScope(await scanSkills(projectDir, { homeDir: options.homeDir, extraPaths, includeCostPaths: true, sources: scanSources }), effectiveScope),
      platform,
    ).filter((entry) => entry.platform !== 'codex');
    let servers = filterByPlatform(filterByScope(scanMcpServers(projectDir, {
      homeDir: options.homeDir,
      files: scanSources.filter((entry) => entry.resource === 'mcp' && entry.enabled).map((entry) => ({
        platform: entry.platform, scope: entry.scope, path: entry.resolvedPath, format: entry.format ?? 'json',
      })),
    }), effectiveScope), platform)
      .filter((entry) => entry.platform !== 'codex');
    if (options.discoverMcpTools) servers = await discoverMcpToolsForServers(servers);
    entries.push(...costSkills, ...servers);
  }

  return entries;
}

async function discoverMcpToolsSafely(servers: McpServerRecord[], warnings: ScanWarning[]): Promise<McpServerRecord[]> {
  const results = await discoverMcpToolsForServers(servers);
  for (const server of results) {
    if (server.toolDiscoveryStatus === 'failed') {
      warnings.push({
        ...warning('discovering', 'mcp-discovery-failed', `${server.name}: ${server.toolDiscoveryError ?? '无法读取工具列表'}`),
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
