import { existsSync, realpathSync } from 'node:fs';
import { basename, extname, normalize } from 'node:path';

import type { AuditResult } from '../types/audit';
import type { CleanupSuggestion } from '../types/cleanup';
import type { ContextCostItem, ContextCostResult } from '../types/context';
import type { RegistryEntry } from '../types/install';
import type { McpServerRecord } from '../types/mcp';
import type { ConflictPair, Platform, Scope, SkillRecord } from '../types/skill';
import { countScopes, stableId } from './helpers';
import type { DoctorSnapshot, HealthCheckScope, ScanWarning, UiIssue, UiIssueSeverity, UiResource, UiResourceKind } from './types';

interface BuildSnapshotInput {
  startedAt: number;
  projectDir: string;
  scope: HealthCheckScope;
  platform: Platform | null;
  skills: SkillRecord[];
  mcpServers: McpServerRecord[];
  consumerSkills?: SkillRecord[];
  consumerMcpServers?: McpServerRecord[];
  conflicts: ConflictPair[];
  audit: AuditResult;
  context?: ContextCostResult;
  suggestions: CleanupSuggestion[];
  warnings: ScanWarning[];
  registry: RegistryEntry[];
  aiAuditConfigured: boolean;
  embeddingConfigured: boolean;
  groups?: DoctorSnapshot['groups'];
}

export function buildDoctorSnapshot(input: BuildSnapshotInput): DoctorSnapshot {
  const issues = buildIssues(input.skills, input.conflicts, input.audit, input.context, input.suggestions);
  const resources = buildResources(input.skills, input.mcpServers, input.context, input.registry, issues, input.consumerSkills, input.consumerMcpServers);
  const fixedTokens = input.context?.summary.totalEstimatedTokens ?? 0;
  const activationTokens = input.context?.items.reduce((sum, item) => sum + item.activationEstimatedTokens, 0) ?? 0;
  const generatedAt = new Date().toISOString();

  return {
    id: stableId('snapshot', input.projectDir, input.scope, input.platform ?? 'all', generatedAt),
    generatedAt,
    durationMs: Date.now() - input.startedAt,
    status: input.warnings.length > 0 ? 'partial' : 'complete',
    target: { projectDir: input.projectDir, scope: input.scope, platform: input.platform },
    summary: {
      resources: resources.length,
      issues: issues.length,
      high: issues.filter((issue) => issue.severity === 'high').length,
      medium: issues.filter((issue) => issue.severity === 'med').length,
      low: issues.filter((issue) => issue.severity === 'low').length,
      conflicts: issues.filter((issue) => issue.kind === 'conflict').length,
      duplicates: issues.filter((issue) => issue.kind === 'duplicate').length,
      security: issues.filter((issue) => issue.kind === 'security').length,
      fixedTokens,
      activationTokens,
      disabledResources: resources.filter((resource) => resource.enabled === false).length,
      platforms: countResourceConsumers(resources),
      scopes: countScopes(resources),
    },
    resources,
    issues,
    skills: input.skills,
    conflicts: input.conflicts,
    audit: {
      scanned: input.audit.scanned,
      findings: input.audit.findings,
      aiFindings: input.audit.aiFindings ?? [],
      summary: input.audit.summary,
    },
    ...(input.context ? { context: input.context } : {}),
    ...(input.groups ? { groups: input.groups } : {}),
    warnings: input.warnings,
    capabilities: {
      aiAuditConfigured: input.aiAuditConfigured,
      embeddingConfigured: input.embeddingConfigured,
      canToggleCodexResources: resources.some((resource) => resource.platform === 'codex' && resource.controllable),
      canExecuteCleanup: issues.some((issue) => issue.kind === 'duplicate'),
      canInstall: true,
      canUninstall: input.registry.length > 0,
      canExportDashboard: true,
    },
  };
}

export function buildIssues(
  skills: SkillRecord[],
  conflicts: ConflictPair[],
  audit: AuditResult,
  context: ContextCostResult | undefined,
  suggestions: CleanupSuggestion[],
): UiIssue[] {
  const resourceIdByPath = new Map(skills.map((skill) => [skill.sourcePath, resourceIdForSkill(skill)]));
  const issues: UiIssue[] = [];

  for (const finding of audit.findings) {
    issues.push({
      id: stableId('issue', 'audit', finding.ruleId, finding.sourcePath, finding.matchedText),
      kind: 'security',
      severity: finding.severity,
      title: auditTitle(finding.ruleId),
      summary: finding.summary,
      resourceIds: [resourceIdByPath.get(finding.sourcePath) ?? stableId('resource', finding.sourcePath)],
      resourceNames: [finding.skillName],
      evidence: [{ label: '命中内容', value: finding.matchedText, path: finding.sourcePath }],
      recommendation: auditRecommendation(finding.ruleId),
      detectionMethod: 'static-rule',
      sourceFinding: finding,
    });
  }

  for (const finding of audit.aiFindings ?? []) {
    issues.push({
      id: stableId('issue', 'ai-audit', finding.code, finding.sourcePath, finding.evidence),
      kind: 'security',
      severity: finding.severity,
      title: finding.title,
      summary: finding.detail,
      resourceIds: [resourceIdByPath.get(finding.sourcePath) ?? stableId('resource', finding.sourcePath)],
      resourceNames: [finding.skillName],
      evidence: finding.evidence ? [{ label: 'AI 证据', value: finding.evidence, path: finding.sourcePath }] : [],
      recommendation: '人工核对证据与完整指令，确认风险后再修改或停用。',
      detectionMethod: 'ai-audit',
      sourceFinding: finding,
    });
  }

  for (const pair of conflicts) {
    const suggestion = pair.kind === 'duplicate'
      ? suggestions.find((item) => item.skillName === pair.a.name && [item.keepPath, item.removePath].includes(pair.a.sourcePath))
      : undefined;
    issues.push({
      id: stableId('issue', pair.kind, pair.a.sourcePath, pair.b.sourcePath),
      kind: pair.kind,
      severity: pair.severity,
      title: pair.kind === 'duplicate' ? `发现重复资源：${pair.a.name}` : `${pair.a.name} 与 ${pair.b.name} 可能同时触发`,
      summary: pair.kind === 'duplicate'
        ? '同名资源安装在多个位置，可能造成版本漂移或加载顺序不明确。'
        : pair.analysis?.summary ?? `两个资源共享 ${pair.sharedTokens.length} 个触发词或描述关键词。`,
      resourceIds: [resourceIdForSkill(pair.a), resourceIdForSkill(pair.b)],
      resourceNames: [pair.a.name, pair.b.name],
      evidence: pair.kind === 'duplicate'
        ? [
            { label: '副本 A', value: pair.a.sourcePath, path: pair.a.sourcePath },
            { label: '副本 B', value: pair.b.sourcePath, path: pair.b.sourcePath },
          ]
        : [{ label: '共享触发词', value: pair.sharedTokens.join('、') || '语义重叠' }],
      recommendation: pair.remediation,
      detectionMethod: pair.detectionMethod,
      similarity: pair.similarity,
      analysis: pair.analysis,
      cleanup: suggestion,
    });
  }

  if (context?.summary.overBudget) {
    issues.push({
      id: stableId('issue', 'context-budget', context.summary.projectPath, String(context.summary.budgetTokens)),
      kind: 'context',
      severity: 'med',
      title: 'context-over-budget',
      summary: `context-over-budget-summary:${context.summary.totalEstimatedTokens}:${context.summary.budgetTokens}`,
      resourceIds: context.items.filter((item) => fixedCost(item) > 0).slice(0, 5).map(resourceIdForContextItem),
      resourceNames: context.items.filter((item) => fixedCost(item) > 0).slice(0, 5).map((item) => item.name),
      evidence: [{ label: '预算', value: `${context.summary.totalEstimatedTokens} / ${context.summary.budgetTokens} tokens` }],
      recommendation: '优先检查 always-on 指令、MCP 工具描述和宽泛的 skill 元数据。',
      detectionMethod: 'context-budget',
    });
  }

  for (const item of context?.items ?? []) {
    if (item.estimateStatus !== 'unknown') continue;
    issues.push({
      id: stableId('issue', 'context-unknown', item.id, item.sourcePath),
      kind: 'context',
      severity: 'info',
      title: `${item.name} 的上下文成本未知`,
      summary: item.recommendation,
      resourceIds: [resourceIdForContextItem(item)],
      resourceNames: [item.name],
      evidence: [{ label: '资源', value: item.sourcePath, path: item.sourcePath }],
      recommendation: item.recommendation,
      detectionMethod: 'context-estimate',
    });
  }

  return issues.sort(compareIssues);
}

function buildResources(
  skills: SkillRecord[],
  mcpServers: McpServerRecord[],
  context: ContextCostResult | undefined,
  registry: RegistryEntry[],
  issues: UiIssue[],
  consumerSkills: SkillRecord[] = skills,
  consumerMcpServers: McpServerRecord[] = mcpServers,
): UiResource[] {
  const byId = new Map<string, UiResource>();
  const issueIds = new Map<string, string[]>();
  for (const issue of issues) {
    for (const resourceId of issue.resourceIds) issueIds.set(resourceId, [...(issueIds.get(resourceId) ?? []), issue.id]);
  }

  for (const skill of skills) {
    const id = resourceIdForSkill(skill);
    const existing = byId.get(id);
    if (existing) {
      upsertConsumer(existing, { platform: skill.platform, scope: skill.scope, enabled: skill.context?.enabled, fixedTokens: 0, activationTokens: 0 });
      existing.issueIds = [...new Set([...existing.issueIds, ...(issueIds.get(id) ?? [])])];
      existing.shared = existing.consumers.length > 1;
      existing.status = statusFor(id, combinedEnabled(existing), issueIds);
      continue;
    }
    byId.set(id, {
      id,
      name: skill.name,
      kind: inferSkillKind(skill),
      kindLabel: inferSkillKindLabel(skill),
      sourcePath: skill.sourcePath,
      platform: skill.platform,
      scope: skill.scope,
      shared: false,
      consumers: [{ platform: skill.platform, scope: skill.scope, enabled: skill.context?.enabled, fixedTokens: 0, activationTokens: 0 }],
      description: skill.description,
      triggers: skill.triggers,
      enabled: skill.context?.enabled,
      controllable: skill.context?.controllable === true,
      fixedTokens: 0,
      activationTokens: 0,
      confidence: skill.provenance?.confidence,
      installSource: skill.provenance?.installSource,
      repository: skill.provenance?.repository,
      author: skill.provenance?.author,
      issueIds: issueIds.get(id) ?? [],
      status: statusFor(id, skill.context?.enabled, issueIds),
      controlMethod: skill.context?.controlMethod,
      estimateStatus: skill.context?.estimateStatus,
      installed: registry.find((entry) => entry.installedPath === skill.sourcePath),
    });
  }

  for (const server of mcpServers) {
    const id = resourceIdForMcp(server);
    const existing = byId.get(id);
    if (existing) {
      upsertConsumer(existing, { platform: server.platform, scope: server.scope, enabled: server.enabled, fixedTokens: 0, activationTokens: 0 });
      existing.shared = existing.consumers.length > 1;
      continue;
    }
    byId.set(id, {
      id,
      name: server.name,
      kind: 'mcp',
      kindLabel: 'MCP server',
      sourcePath: server.sourcePath,
      platform: server.platform,
      scope: server.scope,
      shared: false,
      consumers: [{ platform: server.platform, scope: server.scope, enabled: server.enabled, fixedTokens: 0, activationTokens: 0 }],
      description: server.toolDiscoveryStatus === 'failed' ? server.toolDiscoveryError : server.instructions,
      triggers: server.tools?.map((tool) => tool.name) ?? [],
      enabled: server.enabled,
      controllable: server.context?.controllable === true,
      fixedTokens: 0,
      activationTokens: 0,
      issueIds: issueIds.get(id) ?? [],
      status: statusFor(id, server.enabled, issueIds),
      controlMethod: server.context?.controlMethod,
      estimateStatus: server.context?.estimateStatus,
    });
  }

  for (const skill of consumerSkills) {
    const resource = byId.get(resourceIdForSkill(skill));
    if (!resource) continue;
    upsertConsumer(resource, { platform: skill.platform, scope: skill.scope, enabled: skill.context?.enabled });
    resource.shared = resource.consumers.length > 1;
  }
  for (const server of consumerMcpServers) {
    const resource = byId.get(resourceIdForMcp(server));
    if (!resource) continue;
    upsertConsumer(resource, { platform: server.platform, scope: server.scope, enabled: server.enabled });
    resource.shared = resource.consumers.length > 1;
  }

  for (const item of [...(context?.items ?? []), ...(context?.disabledItems ?? [])]) {
    const id = resourceIdForContextItem(item);
    const existing = findMatchingResource(byId, item);
    if (existing) {
      existing.controllable = existing.controllable || item.controllable === true;
      existing.activation = item.activation;
      existing.fixedTokens = fixedCost(item);
      existing.activationTokens = item.activationEstimatedTokens;
      existing.recommendation = item.recommendation;
      existing.controlMethod = item.controlMethod;
      existing.estimateStatus = item.estimateStatus;
      upsertConsumer(existing, { platform: item.platform, scope: item.scope, enabled: item.enabled, activation: item.activation, fixedTokens: fixedCost(item), activationTokens: item.activationEstimatedTokens });
      existing.shared = existing.consumers.length > 1;
      existing.fixedTokens = existing.consumers.reduce((sum, consumer) => sum + (consumer.fixedTokens ?? 0), 0);
      existing.activationTokens = existing.consumers.reduce((sum, consumer) => sum + (consumer.activationTokens ?? 0), 0);
      existing.enabled = combinedEnabled(existing);
      existing.issueIds = [...new Set([...existing.issueIds, ...(issueIds.get(id) ?? [])])];
      existing.status = existing.enabled === false ? 'disabled' : existing.issueIds.length > 0 ? 'attention' : 'healthy';
      continue;
    }
    byId.set(id, {
      id,
      name: item.name,
      kind: item.resource ?? kindFromContextItem(item),
      kindLabel: labelFromContextItem(item),
      sourcePath: item.sourcePath,
      ...(item.sourcePaths ? { sourcePaths: item.sourcePaths } : {}),
      platform: item.platform,
      scope: item.scope,
      shared: false,
      consumers: [{ platform: item.platform, scope: item.scope, enabled: item.enabled, activation: item.activation, fixedTokens: fixedCost(item), activationTokens: item.activationEstimatedTokens }],
      triggers: [],
      enabled: item.enabled,
      controllable: item.controllable === true,
      activation: item.activation,
      fixedTokens: fixedCost(item),
      activationTokens: item.activationEstimatedTokens,
      confidence: item.confidence,
      issueIds: issueIds.get(id) ?? [],
      status: statusFor(id, item.enabled, issueIds),
      recommendation: item.recommendation,
      controlMethod: item.controlMethod,
      estimateStatus: item.estimateStatus,
    });
  }

  for (const plugin of context?.catalog?.plugins ?? []) {
    const pluginId = stableId('resource', 'codex', 'cached-plugin', plugin.id, plugin.manifestPath);
    if (!byId.has(pluginId)) {
      byId.set(pluginId, {
        id: pluginId,
        name: plugin.displayName,
        kind: 'plugin',
        kindLabel: 'Cached plugin',
        sourcePath: plugin.manifestPath,
        platform: 'codex',
        scope: 'global',
        shared: false,
        consumers: [{ platform: 'codex', scope: 'global', fixedTokens: 0, activationTokens: 0 }],
        description: plugin.description,
        triggers: plugin.entries.map((entry) => entry.skillName),
        controllable: false,
        fixedTokens: 0,
        activationTokens: 0,
        issueIds: [],
        status: 'unknown',
        recommendation: '缓存 UI 元数据；可见不代表已经启用或进入模型上下文。',
        estimateStatus: 'unknown',
      });
    }
    for (const entry of plugin.entries) {
      const entryId = stableId('resource', 'codex', 'cached-plugin-entry', plugin.id, entry.id, entry.sourcePath);
      if (byId.has(entryId)) continue;
      byId.set(entryId, {
        id: entryId,
        name: entry.displayName,
        kind: 'plugin',
        kindLabel: 'Cached plugin skill',
        sourcePath: entry.sourcePath,
        platform: 'codex',
        scope: 'global',
        shared: false,
        consumers: [{ platform: 'codex', scope: 'global', fixedTokens: 0, activationTokens: 0 }],
        description: entry.description,
        triggers: entry.defaultPrompt ? [entry.defaultPrompt] : [],
        controllable: false,
        fixedTokens: 0,
        activationTokens: 0,
        issueIds: [],
        status: 'unknown',
        recommendation: `缓存目录条目 · ${entry.invocation === 'explicit-only' ? '仅显式调用' : entry.invocation === 'implicit' ? '允许隐式调用' : '调用策略未知'} · 不计入上下文成本。`,
        estimateStatus: 'unknown',
      });
    }
  }

  return [...byId.values()].sort((left, right) => {
    const statusRank = { attention: 0, unknown: 1, healthy: 2, disabled: 3 } as const;
    return statusRank[left.status] - statusRank[right.status] || left.name.localeCompare(right.name);
  });
}

export function resourceIdForSkill(skill: Pick<SkillRecord, 'sourcePath' | 'name' | 'platform' | 'scope'>): string {
  return stableId('resource', canonicalPath(skill.sourcePath), skill.name);
}

export function resourceIdForMcp(server: Pick<McpServerRecord, 'id' | 'sourcePath' | 'name' | 'platform' | 'scope'>): string {
  return stableId('resource', canonicalPath(server.sourcePath), server.name);
}

export function resourceIdForContextItem(item: Pick<ContextCostItem, 'id' | 'sourcePath' | 'name' | 'platform' | 'scope' | 'resource'>): string {
  return stableId('resource', canonicalPath(item.sourcePath), item.name);
}

function findMatchingResource(resources: Map<string, UiResource>, item: ContextCostItem): UiResource | undefined {
  const direct = resources.get(resourceIdForContextItem(item));
  if (direct) return direct;
  return [...resources.values()].find((resource) =>
    canonicalPath(resource.sourcePath) === canonicalPath(item.sourcePath) && resource.name === item.name,
  );
}

function canonicalPath(path: string): string {
  try { return normalize(existsSync(path) ? realpathSync(path) : path); }
  catch { return normalize(path); }
}

function upsertConsumer(resource: UiResource, consumer: UiResource['consumers'][number]): void {
  const index = resource.consumers.findIndex((entry) => entry.platform === consumer.platform && entry.scope === consumer.scope);
  if (index < 0) resource.consumers.push(consumer);
  else resource.consumers[index] = { ...resource.consumers[index], ...consumer };
}

function combinedEnabled(resource: UiResource): boolean | undefined {
  if (resource.consumers.every((consumer) => consumer.enabled === undefined)) return undefined;
  return resource.consumers.some((consumer) => consumer.enabled !== false);
}

function countResourceConsumers(resources: UiResource[]): Partial<Record<Platform, number>> {
  const counts: Partial<Record<Platform, number>> = {};
  for (const resource of resources) {
    for (const platform of new Set(resource.consumers.map((consumer) => consumer.platform))) {
      counts[platform] = (counts[platform] ?? 0) + 1;
    }
  }
  return counts;
}

function fixedCost(item: ContextCostItem): number {
  return item.budgetScope === 'startup-selection' || item.budgetScope === 'always-on' ? item.estimatedTokens : 0;
}

function statusFor(id: string, enabled: boolean | undefined, issues: Map<string, string[]>): UiResource['status'] {
  if (enabled === false) return 'disabled';
  if ((issues.get(id)?.length ?? 0) > 0) return 'attention';
  return enabled === undefined ? 'healthy' : 'healthy';
}

function inferSkillKind(skill: SkillRecord): UiResourceKind {
  const resource = skill.context?.resource;
  if (resource) return resource;
  const path = skill.sourcePath.toLowerCase();
  if (path.includes('instruction')) return 'instruction';
  if (path.includes('rules') || extname(path) === '.mdc') return 'rule';
  if (path.includes('prompt')) return 'prompt';
  return 'skill';
}

function inferSkillKindLabel(skill: SkillRecord): string {
  const kind = inferSkillKind(skill);
  const labels: Record<UiResourceKind, string> = {
    agents: 'AGENTS.md', skill: 'Skill', mcp: 'MCP server', plugin: 'Plugin', memory: 'Memory',
    instruction: 'Instruction', rule: 'Rule', prompt: 'Prompt', unknown: 'Resource',
  };
  return labels[kind] ?? basename(skill.sourcePath);
}

function kindFromContextItem(item: ContextCostItem): UiResourceKind {
  if (item.kind.includes('instruction')) return 'instruction';
  if (item.kind.includes('prompt')) return 'prompt';
  if (item.kind.includes('always-on') || item.kind === 'agents-chain') return 'agents';
  return item.resource ?? 'unknown';
}

function labelFromContextItem(item: ContextCostItem): string {
  const labels: Partial<Record<UiResourceKind, string>> = {
    agents: 'AGENTS.md', skill: 'Skill', mcp: 'MCP server', plugin: 'Plugin', memory: 'Memory',
    instruction: 'Instruction', rule: 'Rule', prompt: 'Prompt', unknown: 'Resource',
  };
  return labels[kindFromContextItem(item)] ?? item.kind;
}

function auditTitle(ruleId: string): string {
  return ({
    'shell-exec': '检查可能执行 Shell 的指令',
    destructive: '检查可能造成破坏的操作',
    'secret-leak': '避免输出或暴露敏感凭据',
    'network-call': '确认外部网络请求是否必要',
  } as Record<string, string>)[ruleId] ?? '检查可疑指令';
}

function auditRecommendation(ruleId: string): string {
  return ({
    'shell-exec': '限制可执行命令范围，并要求在执行高影响命令前获得用户确认。',
    destructive: '删除无保护的破坏性步骤，增加预览、备份与明确确认。',
    'secret-leak': '禁止输出密钥原文，只允许使用脱敏值或安全凭据引用。',
    'network-call': '说明目标地址和发送字段，上传前要求用户确认。',
  } as Record<string, string>)[ruleId] ?? '人工核对完整指令和实际使用场景。';
}

function compareIssues(left: UiIssue, right: UiIssue): number {
  const severityRank: Record<UiIssueSeverity, number> = { high: 4, med: 3, low: 2, info: 1 };
  const kindRank: Record<UiIssue['kind'], number> = { security: 4, duplicate: 3, conflict: 2, context: 1 };
  return severityRank[right.severity] - severityRank[left.severity]
    || kindRank[right.kind] - kindRank[left.kind]
    || left.title.localeCompare(right.title);
}
