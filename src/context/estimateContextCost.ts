import { existsSync, readFileSync } from 'node:fs';
import { basename, dirname, sep } from 'node:path';

import { getPlatformAdapter } from '../platforms/registry';
import type { PlatformCostPolicyMatch, PlatformCostPolicyProfile } from '../platforms/registry';
import type {
  ContextActivation,
  ContextBudgetScope,
  ContextCostGrade,
  ContextCostItem,
  ContextCostOfficialLimit,
  ContextCostResult,
  ContextInjectionKind,
  ContextResourceRecord,
} from '../types/context';
import type { McpServerRecord, McpToolRecord } from '../types/mcp';
import type { Platform, SkillRecord } from '../types/skill';

const DEFAULT_BUDGET_TOKENS = 2000;
const CODEX_SKILL_LIST_UNKNOWN_WINDOW_MAX_CHARS = 8000;

interface EstimateContextCostOptions {
  budgetTokens?: number;
  platformBudgets?: Partial<Record<Platform, number>>;
  projectPath?: string;
}

interface CostProfile {
  kind: ContextInjectionKind;
  activation: ContextActivation;
  budgetScope: ContextBudgetScope;
  budgetText: string;
  activationText: string;
  officialLimit?: ContextCostOfficialLimit;
}

export function estimateContextCost(
  entries: Array<SkillRecord | McpServerRecord | ContextResourceRecord>,
  options: EstimateContextCostOptions = {},
): ContextCostResult {
  const budgetTokens = options.budgetTokens ?? DEFAULT_BUDGET_TOKENS;
  const platformBudgets = options.platformBudgets ?? {};
  const estimatedEntries = entries
    .map((entry) => {
      if (isContextResourceRecord(entry)) return estimateContextResourceCost(entry);
      return isMcpServerRecord(entry) ? estimateMcpServerCost(entry) : estimateSkillCost(entry);
    });
  const items = appendCodexSkillListAggregates(estimatedEntries, options.projectPath)
    .sort((left, right) => {
      if (right.estimatedTokens !== left.estimatedTokens) {
        return right.estimatedTokens - left.estimatedTokens;
      }
      if (right.activationEstimatedTokens !== left.activationEstimatedTokens) {
        return right.activationEstimatedTokens - left.activationEstimatedTokens;
      }
      return left.name.localeCompare(right.name);
    });
  const totalEstimatedTokens = items.reduce((sum, item) => item.enabled === false ? sum : sum + chargeableEstimatedTokens(item), 0);
  const disabledEstimatedTokens = items.reduce((sum, item) => item.enabled === false ? sum + chargeableEstimatedTokens(item) : sum, 0);
  const byPlatform = summarizeByPlatform(items, budgetTokens, platformBudgets);

  return {
    summary: {
      totalEstimatedTokens,
      ...(disabledEstimatedTokens > 0 ? { disabledEstimatedTokens } : {}),
      budgetTokens,
      grade: gradeCost(totalEstimatedTokens, budgetTokens),
      overBudget: totalEstimatedTokens > budgetTokens || byPlatform.some((entry) => entry.overBudget),
      scanned: entries.length,
      ...(options.projectPath ? { projectPath: options.projectPath } : {}),
      byPlatform,
    },
    items,
  };
}

function appendCodexSkillListAggregates(items: ContextCostItem[], projectPath: string | undefined): ContextCostItem[] {
  const aggregateItems: ContextCostItem[] = [];
  const groups = new Map<string, ContextCostItem[]>();

  for (const item of items) {
    if (!isCodexSkillListMember(item)) continue;
    const enabledKey = item.enabled === false ? 'disabled' : 'enabled';
    const resource = item.resource === 'plugin' ? 'plugin' : 'skill';
    groups.set(`${resource}:${enabledKey}`, [...(groups.get(`${resource}:${enabledKey}`) ?? []), item]);
  }

  for (const [key, groupItems] of groups) {
    const [resource, enabledKey] = key.split(':') as ['skill' | 'plugin', 'enabled' | 'disabled'];
    if (groupItems.length === 0) continue;
    const estimatedChars = Math.min(
      groupItems.reduce((sum, item) => sum + item.estimatedChars, 0),
      CODEX_SKILL_LIST_UNKNOWN_WINDOW_MAX_CHARS,
    );
    const estimatedTokens = estimateTokens('x'.repeat(estimatedChars));
    const sourcePath = projectPath ?? commonParentPath(groupItems.map((item) => item.sourcePath));

    aggregateItems.push({
      id: `codex:${resource}-list:${enabledKey}`,
      name: resource === 'plugin' ? 'Codex plugin skill list' : 'Codex skill list',
      sourcePath,
      platform: 'codex',
      scope: groupItems.some((item) => item.scope === 'project') ? 'project' : 'global',
      source: resource,
      resource,
      kind: resource === 'plugin' ? 'plugin-skill-list' : 'codex-skill-list',
      estimatedTokens,
      estimatedChars,
      activationEstimatedTokens: estimatedTokens,
      activationEstimatedChars: estimatedChars,
      activation: 'startup',
      budgetScope: 'startup-selection',
      confidence: 'high',
      enabled: enabledKey === 'enabled',
      controllable: resource === 'skill' ? true : groupItems.every((item) => item.controllable !== false),
      controlPath: firstDefined(groupItems.map((item) => item.controlPath)),
      controlMethod: resource === 'skill' ? 'skills.config' : 'plugins.<id>.enabled',
      estimateStatus: 'estimated',
      officialLimit: codexSkillListOfficialLimit(),
      recommendation: estimatedChars >= CODEX_SKILL_LIST_UNKNOWN_WINDOW_MAX_CHARS
        ? 'Codex skill list metadata reaches the unknown-window cap; disable or shorten low-value skills.'
        : 'OK',
    });
  }

  return [...items, ...aggregateItems];
}

function isCodexSkillListMember(item: ContextCostItem): boolean {
  return item.platform === 'codex'
    && item.kind === 'agent-skill-description'
    && (item.resource === 'skill' || item.resource === 'plugin');
}

function chargeableEstimatedTokens(item: ContextCostItem): number {
  if (isCodexSkillListMember(item)) return 0;
  return item.estimatedTokens;
}

function codexSkillListOfficialLimit(): ContextCostOfficialLimit {
  return {
    kind: 'chars',
    value: CODEX_SKILL_LIST_UNKNOWN_WINDOW_MAX_CHARS,
    appliesTo: 'combined Codex skill list, capped at 2% of context or 8000 chars when context window is unknown',
  };
}

export function estimateTokens(text: string): number {
  const normalized = normalizeForEstimate(text);
  if (!normalized) return 0;
  return Math.max(1, Math.ceil(normalized.length / 4));
}

function estimateSkillCost(skill: SkillRecord): ContextCostItem {
  const raw = readRawFile(skill.sourcePath);
  const frontmatter = parseFrontmatter(raw ?? '');
  const profile = classifySkillCost(skill, raw, frontmatter);
  const budgetText = applyOfficialBudgetLimit(profile.budgetText, profile.officialLimit);
  const estimatedTokens = estimateTokens(budgetText);
  const activationEstimatedTokens = estimateTokens(profile.activationText);

  return {
    ...(skill.id ? { id: skill.id } : {}),
    name: skill.name,
    sourcePath: skill.sourcePath,
    platform: skill.platform,
    scope: skill.scope,
    source: skill.context?.resource === 'agents' ? 'agents' : skill.context?.resource === 'plugin' ? 'plugin' : 'skill',
    ...(skill.context?.resource ? { resource: skill.context.resource } : {}),
    ...(skill.context?.configSource ? { configSource: skill.context.configSource } : {}),
    kind: profile.kind,
    estimatedTokens,
    estimatedChars: normalizeForEstimate(budgetText).length,
    activationEstimatedTokens,
    activationEstimatedChars: normalizeForEstimate(profile.activationText).length,
    activation: profile.activation,
    budgetScope: profile.budgetScope,
    confidence: skill.provenance?.confidence ?? 'low',
    ...(typeof skill.context?.enabled === 'boolean' ? { enabled: skill.context.enabled } : {}),
    ...(typeof skill.context?.controllable === 'boolean' ? { controllable: skill.context.controllable } : {}),
    ...(skill.context?.controlPath ? { controlPath: skill.context.controlPath } : {}),
    ...(skill.context?.controlMethod ? { controlMethod: skill.context.controlMethod } : {}),
    ...(skill.context?.estimateStatus ? { estimateStatus: skill.context.estimateStatus } : {}),
    ...(profile.officialLimit ? { officialLimit: profile.officialLimit } : {}),
    recommendation: getRecommendation(skill, profile, estimatedTokens, activationEstimatedTokens),
  };
}

function estimateMcpServerCost(server: McpServerRecord): ContextCostItem {
  const text = buildMcpToolListText(server);
  const estimatedTokens = estimateTokens(text);
  const normalizedLength = normalizeForEstimate(text).length;

  return {
    ...(server.id ? { id: server.id } : {}),
    name: server.name,
    sourcePath: server.sourcePath,
    platform: server.platform,
    scope: server.scope,
    source: 'mcp',
    resource: server.context?.resource ?? 'mcp',
    ...(server.context?.configSource ? { configSource: server.context.configSource } : {}),
    kind: 'mcp-tool-list',
    estimatedTokens,
    estimatedChars: normalizedLength,
    activationEstimatedTokens: estimatedTokens,
    activationEstimatedChars: normalizedLength,
    activation: 'startup',
    budgetScope: 'startup-selection',
    confidence: 'low',
    ...(typeof server.context?.enabled === 'boolean' ? { enabled: server.context.enabled } : typeof server.enabled === 'boolean' ? { enabled: server.enabled } : {}),
    ...(typeof server.context?.controllable === 'boolean' ? { controllable: server.context.controllable } : {}),
    ...(server.context?.controlPath ? { controlPath: server.context.controlPath } : {}),
    ...(server.context?.controlMethod ? { controlMethod: server.context.controlMethod } : {}),
    ...(server.context?.estimateStatus ? { estimateStatus: server.context.estimateStatus } : {}),
    recommendation: getMcpRecommendation(server, estimatedTokens),
  };
}

function estimateContextResourceCost(entry: ContextResourceRecord): ContextCostItem {
  const budgetText = applyOfficialBudgetLimit(entry.text, entry.officialLimit);
  const activationText = entry.activationText ?? entry.text;
  const estimatedTokens = entry.estimateStatus === 'unknown' ? 0 : estimateTokens(budgetText);
  const estimatedChars = entry.estimateStatus === 'unknown' ? 0 : normalizeForEstimate(budgetText).length;
  const activationEstimatedTokens = entry.estimateStatus === 'unknown' ? 0 : estimateTokens(activationText);
  const activationEstimatedChars = entry.estimateStatus === 'unknown' ? 0 : normalizeForEstimate(activationText).length;

  return {
    id: entry.id,
    name: entry.name,
    sourcePath: entry.sourcePath,
    platform: entry.platform,
    scope: entry.scope,
    source: entry.source,
    resource: entry.resource,
    kind: entry.kind,
    estimatedTokens,
    estimatedChars,
    activationEstimatedTokens,
    activationEstimatedChars,
    activation: entry.activation,
    budgetScope: entry.budgetScope,
    confidence: entry.confidence,
    ...(typeof entry.enabled === 'boolean' ? { enabled: entry.enabled } : {}),
    ...(entry.configSource ? { configSource: entry.configSource } : {}),
    ...(typeof entry.controllable === 'boolean' ? { controllable: entry.controllable } : {}),
    ...(entry.controlPath ? { controlPath: entry.controlPath } : {}),
    ...(entry.controlMethod ? { controlMethod: entry.controlMethod } : {}),
    ...(entry.estimateStatus ? { estimateStatus: entry.estimateStatus } : {}),
    ...(entry.officialLimit ? { officialLimit: entry.officialLimit } : {}),
    recommendation: entry.recommendation,
  };
}

function isMcpServerRecord(entry: SkillRecord | McpServerRecord | ContextResourceRecord): entry is McpServerRecord {
  return 'source' in entry && entry.source === 'mcp';
}

function isContextResourceRecord(entry: SkillRecord | McpServerRecord | ContextResourceRecord): entry is ContextResourceRecord {
  return 'text' in entry && 'resource' in entry;
}

function classifySkillCost(skill: SkillRecord, raw: string | null, frontmatter: Record<string, string>): CostProfile {
  const policy = getPlatformAdapter(skill.platform)?.costPolicy;
  const profile = policy?.rules.find((rule) => costPolicyRuleMatches(rule.match, skill, frontmatter))?.profile
    ?? policy?.defaultProfile
    ?? { mode: 'always-on', kind: 'always-on-file' as const };

  return costProfileFromPolicy(skill, raw, profile);
}

function costPolicyRuleMatches(
  match: PlatformCostPolicyMatch,
  skill: SkillRecord,
  frontmatter: Record<string, string>,
): boolean {
  const fileName = basename(skill.sourcePath).toLowerCase();
  const normalizedPath = skill.sourcePath.split(sep).join('/').toLowerCase();

  if (match.entryFile !== undefined && match.entryFile !== isSkillEntryFile(skill)) {
    return false;
  }
  if (match.fileName && fileName !== match.fileName.toLowerCase()) {
    return false;
  }
  if (match.fileNameIn && !match.fileNameIn.map((name) => name.toLowerCase()).includes(fileName)) {
    return false;
  }
  if (match.fileNameSuffix && !fileName.endsWith(match.fileNameSuffix.toLowerCase())) {
    return false;
  }
  if (match.pathIncludes && !normalizedPath.includes(match.pathIncludes.toLowerCase())) {
    return false;
  }
  if (match.frontmatterTruthy && !isTruthy(frontmatter[match.frontmatterTruthy])) {
    return false;
  }
  if (match.frontmatterExists && !frontmatter[match.frontmatterExists]) {
    return false;
  }
  if (match.frontmatterEquals) {
    for (const [key, value] of Object.entries(match.frontmatterEquals)) {
      if (frontmatter[key] !== value) return false;
    }
  }

  return true;
}

function costProfileFromPolicy(
  skill: SkillRecord,
  raw: string | null,
  policyProfile: PlatformCostPolicyProfile,
): CostProfile {
  if (policyProfile.mode === 'metadata') {
    return skillMetadataProfile(skill, raw, policyProfile.kind, {
      includePath: policyProfile.includePath,
      officialLimit: policyProfile.officialLimit,
    });
  }

  if (policyProfile.mode === 'always-on') {
    return alwaysOnProfile(skill, raw, policyProfile.kind, {
      officialLimit: policyProfile.officialLimit,
    });
  }

  if (policyProfile.mode === 'file-scoped') {
    return fileScopedProfile(skill, raw, policyProfile.kind);
  }

  return manualProfile(skill, raw, policyProfile.kind);
}

function skillMetadataProfile(
  skill: SkillRecord,
  raw: string | null,
  kind: ContextInjectionKind,
  options: { includePath?: boolean; officialLimit?: ContextCostOfficialLimit } = {},
): CostProfile {
  return {
    kind,
    activation: 'startup',
    budgetScope: 'startup-selection',
    budgetText: buildMetadataText(skill, { includePath: options.includePath }),
    activationText: raw ?? buildMetadataText(skill, { includePath: options.includePath }),
    ...(options.officialLimit ? { officialLimit: options.officialLimit } : {}),
  };
}

function alwaysOnProfile(
  skill: SkillRecord,
  raw: string | null,
  kind: ContextInjectionKind,
  options: { officialLimit?: ContextCostOfficialLimit } = {},
): CostProfile {
  const text = raw ?? buildMetadataText(skill);
  return {
    kind,
    activation: 'always-on',
    budgetScope: 'always-on',
    budgetText: text,
    activationText: text,
    ...(options.officialLimit ? { officialLimit: options.officialLimit } : {}),
  };
}

function fileScopedProfile(skill: SkillRecord, raw: string | null, kind: ContextInjectionKind): CostProfile {
  return {
    kind,
    activation: 'file-scoped',
    budgetScope: 'activation',
    budgetText: '',
    activationText: raw ?? buildMetadataText(skill),
  };
}

function manualProfile(skill: SkillRecord, raw: string | null, kind: ContextInjectionKind): CostProfile {
  return {
    kind,
    activation: 'manual',
    budgetScope: 'none',
    budgetText: '',
    activationText: raw ?? buildMetadataText(skill),
  };
}

function isSkillEntryFile(skill: SkillRecord): boolean {
  return basename(skill.sourcePath).toLowerCase() === 'skill.md';
}

function readRawFile(filePath: string): string | null {
  if (!existsSync(filePath)) return null;
  try {
    return readFileSync(filePath, 'utf8');
  } catch {
    return null;
  }
}

function parseFrontmatter(content: string): Record<string, string> {
  if (!content.startsWith('---\n') && !content.startsWith('---\r\n')) {
    return {};
  }

  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!match) return {};

  const result: Record<string, string> = {};
  const lines = match[1].split(/\r?\n/);

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith('- ')) continue;

    const separatorIndex = trimmed.indexOf(':');
    if (separatorIndex === -1) continue;

    const key = trimmed.slice(0, separatorIndex).trim();
    const rawValue = trimmed.slice(separatorIndex + 1).trim();

    if (rawValue === '') {
      const listValues: string[] = [];
      for (let listIndex = index + 1; listIndex < lines.length; listIndex += 1) {
        const listLine = lines[listIndex].trim();
        if (!listLine.startsWith('- ')) break;
        listValues.push(stripQuotes(listLine.slice(2).trim()));
        index = listIndex;
      }
      if (listValues.length > 0) result[key] = listValues.join(', ');
      continue;
    }

    result[key] = stripQuotes(rawValue);
  }

  return result;
}

function stripQuotes(value: string): string {
  return value.replace(/^['"]|['"]$/g, '');
}

function isTruthy(value: string | undefined): boolean {
  return value === 'true' || value === 'yes' || value === '1';
}

function buildMetadataText(skill: SkillRecord, options: { includePath?: boolean } = {}): string {
  return [
    `Skill: ${skill.name}`,
    `Description: ${skill.description}`,
    skill.triggers.length > 0 ? `Triggers: ${skill.triggers.join('; ')}` : '',
    options.includePath ? `Path: ${skill.sourcePath}` : '',
  ].filter(Boolean).join('\n');
}

export function buildMcpConfigText(server: McpServerRecord): string {
  return buildMcpToolListText(server);
}

function buildMcpToolListText(server: McpServerRecord): string {
  if (server.toolDiscoveryStatus === 'failed') {
    return '';
  }

  const tools = server.tools ?? [];
  if (tools.length > 0) {
    return [
      `MCP server: ${server.name}`,
      `Platform: ${server.platform}`,
      `Scope: ${server.scope}`,
      server.instructions ? `Instructions: ${server.instructions}` : '',
      ...tools.flatMap((tool) => buildMcpToolText(tool)),
    ].filter(Boolean).join('\n');
  }

  return [
    `MCP server: ${server.name}`,
    `Platform: ${server.platform}`,
    `Scope: ${server.scope}`,
    server.instructions ? `Instructions: ${server.instructions}` : '',
    server.transport ? `Transport: ${server.transport}` : '',
    server.command ? `Command: ${server.command}` : '',
    server.args.length > 0 ? `Args: ${server.args.join(' ')}` : '',
    server.url ? `URL: ${server.url}` : '',
    server.envKeys.length > 0 ? `Env keys: ${server.envKeys.map((key) => `${key}=<masked>`).join(', ')}` : '',
    server.headerKeys.length > 0 ? `Header keys: ${server.headerKeys.map((key) => `${key}=<masked>`).join(', ')}` : '',
    server.toolAllowlist.length > 0 ? `Allowed tools: ${server.toolAllowlist.join(', ')}` : '',
    server.toolDenylist.length > 0 ? `Denied tools: ${server.toolDenylist.join(', ')}` : '',
    server.approvalMode ? `Approval mode: ${server.approvalMode}` : '',
    typeof server.trusted === 'boolean' ? `Trusted: ${server.trusted}` : '',
    typeof server.timeoutMs === 'number' ? `Timeout ms: ${server.timeoutMs}` : '',
    `Source path: ${server.sourcePath}`,
  ].filter(Boolean).join('\n');
}

function buildMcpToolText(tool: McpToolRecord): string[] {
  return [
    `Tool: ${tool.name}`,
    tool.title ? `Title: ${tool.title}` : '',
    tool.description ? `Description: ${tool.description}` : '',
    tool.inputSchema ? `Input schema: ${stableJson(tool.inputSchema)}` : '',
    tool.outputSchema ? `Output schema: ${stableJson(tool.outputSchema)}` : '',
    tool.annotations ? `Annotations: ${stableJson(tool.annotations)}` : '',
  ].filter(Boolean);
}

function stableJson(value: unknown): string {
  return JSON.stringify(value);
}

function applyOfficialBudgetLimit(text: string, limit: ContextCostOfficialLimit | undefined): string {
  if (!limit || limit.kind !== 'chars' || text.length <= limit.value) return text;
  return text.slice(0, limit.value);
}

function normalizeForEstimate(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

function summarizeByPlatform(
  items: ContextCostItem[],
  defaultBudgetTokens: number,
  platformBudgets: Partial<Record<Platform, number>>,
): ContextCostResult['summary']['byPlatform'] {
  const summaries = new Map<
    Platform,
    {
      items: number;
      estimatedTokens: number;
      estimatedChars: number;
      startupSelectionTokens: number;
      alwaysOnTokens: number;
      activationTokens: number;
    }
  >();

  for (const item of items) {
    if (item.enabled === false) continue;
    const current = summaries.get(item.platform) ?? {
      items: 0,
      estimatedTokens: 0,
      estimatedChars: 0,
      startupSelectionTokens: 0,
      alwaysOnTokens: 0,
      activationTokens: 0,
    };
    current.items += 1;
    const chargeableTokens = chargeableEstimatedTokens(item);
    current.estimatedTokens += chargeableTokens;
    current.estimatedChars += chargeableTokens === 0 ? 0 : item.estimatedChars;
    current.activationTokens += item.activationEstimatedTokens;
    if (item.budgetScope === 'startup-selection') {
      current.startupSelectionTokens += chargeableTokens;
    }
    if (item.budgetScope === 'always-on') {
      current.alwaysOnTokens += chargeableTokens;
    }
    summaries.set(item.platform, current);
  }

  return [...summaries.entries()]
    .map(([platform, summary]) => {
      const budgetTokens = platformBudgets[platform] ?? defaultBudgetTokens;
      return {
        platform,
        ...summary,
        budgetTokens,
        grade: gradeCost(summary.estimatedTokens, budgetTokens),
        overBudget: summary.estimatedTokens > budgetTokens,
      };
    })
    .sort((left, right) => {
      if (right.estimatedTokens !== left.estimatedTokens) {
        return right.estimatedTokens - left.estimatedTokens;
      }
      return left.platform.localeCompare(right.platform);
    });
}

function firstDefined(values: Array<string | undefined>): string | undefined {
  return values.find((value): value is string => typeof value === 'string' && value.length > 0);
}

function commonParentPath(paths: string[]): string {
  if (paths.length === 0) return '';
  let current = dirname(paths[0]);
  while (current && current !== dirname(current)) {
    if (paths.every((path) => path === current || path.startsWith(`${current}${sep}`))) {
      return current;
    }
    current = dirname(current);
  }
  return dirname(paths[0]);
}

function getRecommendation(
  skill: SkillRecord,
  profile: CostProfile,
  estimatedTokens: number,
  activationEstimatedTokens: number,
): string {
  if (profile.budgetScope === 'none') {
    return 'Manual-only; does not add startup token tax.';
  }

  if (profile.budgetScope === 'activation') {
    return 'Conditional; keep the full instructions concise for when it activates.';
  }

  if (estimatedTokens <= 120 && activationEstimatedTokens <= 1200) {
    return 'OK';
  }

  if (profile.kind === 'claude-skill-description') {
    if (skill.description.length > 280) {
      return 'Shorten the Claude skill description; every session sees it.';
    }
    return 'Trim triggers or split broad activation language.';
  }

  if (profile.kind === 'agent-skill-description') {
    if (skill.description.length > 280) {
      return `Shorten the ${skill.platform} skill description metadata.`;
    }
    if (activationEstimatedTokens > 5000) {
      return 'Move detailed skill instructions into referenced files loaded on demand.';
    }
    return 'Keep activation metadata narrow and specific.';
  }

  if (profile.kind === 'cursor-rule-file') {
    return 'Use globs or description-based activation unless this rule must always apply.';
  }

  if (profile.kind === 'copilot-instruction-file') {
    return 'Keep repository-wide instructions short; move specialized guidance into path-specific files or skills.';
  }

  if (profile.kind === 'always-on-file') {
    return 'Move rarely needed guidance into a skill or narrower rule.';
  }

  return 'Compress metadata and keep only activation-critical wording.';
}

function getMcpRecommendation(server: McpServerRecord, estimatedTokens: number): string {
  if (server.toolDiscoveryStatus === 'failed') {
    return `Unable to inspect MCP tools: ${server.toolDiscoveryError ?? 'server did not respond'}`;
  }

  if (estimatedTokens <= 120) {
    return 'OK';
  }

  if (server.toolAllowlist.length === 0) {
    return 'Add an MCP tool allowlist so only needed tools contribute to agent context.';
  }

  return 'Narrow exposed MCP tools or move rarely used servers out of the active config.';
}

function gradeCost(totalTokens: number, budgetTokens: number): ContextCostGrade {
  const ratio = budgetTokens > 0 ? totalTokens / budgetTokens : Number.POSITIVE_INFINITY;
  if (ratio <= 0.25) return 'A';
  if (ratio <= 0.5) return 'B';
  if (ratio <= 1) return 'C';
  if (ratio <= 1.5) return 'D';
  return 'F';
}
