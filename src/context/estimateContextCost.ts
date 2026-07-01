import { existsSync, readFileSync } from 'node:fs';
import { basename } from 'node:path';

import type { ContextCostGrade, ContextCostItem, ContextCostResult } from '../types/context';
import type { McpServerRecord } from '../types/mcp';
import type { Platform, SkillRecord } from '../types/skill';

const DEFAULT_BUDGET_TOKENS = 2000;

interface EstimateContextCostOptions {
  budgetTokens?: number;
  projectPath?: string;
}

export function estimateContextCost(
  entries: Array<SkillRecord | McpServerRecord>,
  options: EstimateContextCostOptions = {},
): ContextCostResult {
  const budgetTokens = options.budgetTokens ?? DEFAULT_BUDGET_TOKENS;
  const items = entries
    .map((entry) => isMcpServerRecord(entry) ? estimateMcpServerCost(entry) : estimateSkillCost(entry))
    .sort((left, right) => {
      if (right.estimatedTokens !== left.estimatedTokens) {
        return right.estimatedTokens - left.estimatedTokens;
      }
      return left.name.localeCompare(right.name);
    });
  const totalEstimatedTokens = items.reduce((sum, item) => sum + item.estimatedTokens, 0);
  const byPlatform = summarizeByPlatform(items);

  return {
    summary: {
      totalEstimatedTokens,
      budgetTokens,
      grade: gradeCost(totalEstimatedTokens, budgetTokens),
      overBudget: totalEstimatedTokens > budgetTokens,
      scanned: entries.length,
      ...(options.projectPath ? { projectPath: options.projectPath } : {}),
      byPlatform,
    },
    items,
  };
}

export function estimateTokens(text: string): number {
  const normalized = text.replace(/\s+/g, ' ').trim();
  if (!normalized) return 0;
  return Math.max(1, Math.ceil(normalized.length / 4));
}

function estimateSkillCost(skill: SkillRecord): ContextCostItem {
  const context = buildInjectedContext(skill);
  const estimatedTokens = estimateTokens(context.text);

  return {
    name: skill.name,
    sourcePath: skill.sourcePath,
    platform: skill.platform,
    scope: skill.scope,
    source: 'skill',
    kind: context.kind,
    estimatedTokens,
    estimatedChars: context.text.replace(/\s+/g, ' ').trim().length,
    recommendation: getRecommendation(skill, context.kind, estimatedTokens),
  };
}

function estimateMcpServerCost(server: McpServerRecord): ContextCostItem {
  const text = buildMcpConfigText(server);
  const estimatedTokens = estimateTokens(text);

  return {
    name: server.name,
    sourcePath: server.sourcePath,
    platform: server.platform,
    scope: server.scope,
    source: 'mcp',
    kind: 'mcp-server-config',
    estimatedTokens,
    estimatedChars: text.replace(/\s+/g, ' ').trim().length,
    recommendation: getMcpRecommendation(server, estimatedTokens),
  };
}

function isMcpServerRecord(entry: SkillRecord | McpServerRecord): entry is McpServerRecord {
  return 'source' in entry && entry.source === 'mcp';
}

function buildInjectedContext(skill: SkillRecord): { kind: ContextCostItem['kind']; text: string } {
  if (isSkillEntryFile(skill)) {
    if (skill.platform === 'claude') {
      return {
        kind: 'claude-skill-description',
        text: buildMetadataText(skill),
      };
    }

    if (isAgentSkillPlatform(skill.platform)) {
      return {
        kind: 'agent-skill-description',
        text: buildMetadataText(skill),
      };
    }
  }

  if (isAlwaysOnInstructionFile(skill)) {
    return {
      kind: 'always-on-file',
      text: readRawFile(skill.sourcePath) ?? buildMetadataText(skill),
    };
  }

  if (isCursorRuleFile(skill)) {
    return {
      kind: 'cursor-rule-file',
      text: readRawFile(skill.sourcePath) ?? buildMetadataText(skill),
    };
  }

  if (isCopilotInstructionFile(skill)) {
    return {
      kind: 'copilot-instruction-file',
      text: readRawFile(skill.sourcePath) ?? buildMetadataText(skill),
    };
  }

  if (isAlwaysOnFile(skill)) {
    return {
      kind: 'always-on-file',
      text: readRawFile(skill.sourcePath) ?? buildMetadataText(skill),
    };
  }

  return {
    kind: 'skill-metadata',
    text: buildMetadataText(skill),
  };
}

function isSkillEntryFile(skill: SkillRecord): boolean {
  return basename(skill.sourcePath).toLowerCase() === 'skill.md';
}

function isAgentSkillPlatform(platform: Platform): boolean {
  return [
    'codex',
    'copilot',
    'gemini',
    'windsurf',
    'trae',
    'opencode',
    'kiro',
    'openclaw',
    'hermes',
  ].includes(platform);
}

function isCursorRuleFile(skill: SkillRecord): boolean {
  return skill.platform === 'cursor';
}

function isCopilotInstructionFile(skill: SkillRecord): boolean {
  const fileName = basename(skill.sourcePath).toLowerCase();
  return skill.platform === 'copilot' && fileName.endsWith('.instructions.md');
}

function isAlwaysOnInstructionFile(skill: SkillRecord): boolean {
  const fileName = basename(skill.sourcePath).toLowerCase();

  if (skill.platform === 'codex' && fileName === 'agents.md') return true;
  if (skill.platform === 'opencode' && fileName === 'agents.md') return true;
  if (skill.platform === 'gemini' && fileName === 'gemini.md') return true;
  if (skill.platform === 'windsurf' && fileName === '.windsurfrules') return true;
  if (skill.platform === 'cursor' && fileName === '.cursorrules') return true;
  if (skill.platform === 'copilot' && fileName === 'copilot-instructions.md') return true;

  return false;
}

function isAlwaysOnFile(skill: SkillRecord): boolean {
  return basename(skill.sourcePath).toLowerCase() !== 'skill.md';
}

function readRawFile(filePath: string): string | null {
  if (!existsSync(filePath)) return null;
  try {
    return readFileSync(filePath, 'utf8');
  } catch {
    return null;
  }
}

function buildMetadataText(skill: SkillRecord): string {
  return [
    `Skill: ${skill.name}`,
    `Description: ${skill.description}`,
    skill.triggers.length > 0 ? `Triggers: ${skill.triggers.join('; ')}` : '',
  ].filter(Boolean).join('\n');
}

export function buildMcpConfigText(server: McpServerRecord): string {
  return [
    `MCP server: ${server.name}`,
    `Platform: ${server.platform}`,
    `Scope: ${server.scope}`,
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

function summarizeByPlatform(items: ContextCostItem[]): ContextCostResult['summary']['byPlatform'] {
  const summaries = new Map<Platform, { items: number; estimatedTokens: number; estimatedChars: number }>();

  for (const item of items) {
    const current = summaries.get(item.platform) ?? { items: 0, estimatedTokens: 0, estimatedChars: 0 };
    current.items += 1;
    current.estimatedTokens += item.estimatedTokens;
    current.estimatedChars += item.estimatedChars;
    summaries.set(item.platform, current);
  }

  return [...summaries.entries()]
    .map(([platform, summary]) => ({ platform, ...summary }))
    .sort((left, right) => {
      if (right.estimatedTokens !== left.estimatedTokens) {
        return right.estimatedTokens - left.estimatedTokens;
      }
      return left.platform.localeCompare(right.platform);
    });
}

function getRecommendation(
  skill: SkillRecord,
  kind: ContextCostItem['kind'],
  estimatedTokens: number,
): string {
  if (estimatedTokens <= 120) {
    return 'OK';
  }

  if (kind === 'claude-skill-description') {
    if (skill.description.length > 280) {
      return 'Shorten the Claude skill description; every turn pays for it.';
    }
    return 'Trim triggers or split broad activation language.';
  }

  if (kind === 'agent-skill-description') {
    if (skill.description.length > 280) {
      return `Shorten the ${skill.platform} skill description metadata.`;
    }
    return 'Keep activation metadata narrow and specific.';
  }

  if (kind === 'cursor-rule-file') {
    return 'Narrow rule globs or convert broad guidance into a manual rule.';
  }

  if (kind === 'copilot-instruction-file') {
    return 'Narrow applyTo globs or split broad guidance into smaller instruction files.';
  }

  if (kind === 'always-on-file') {
    return 'Move rarely needed guidance into a skill or narrower rule.';
  }

  if (kind === 'mcp-server-config') {
    return 'Narrow exposed MCP tools or move rarely used servers out of the active config.';
  }

  return 'Compress metadata and keep only activation-critical wording.';
}

function getMcpRecommendation(server: McpServerRecord, estimatedTokens: number): string {
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
