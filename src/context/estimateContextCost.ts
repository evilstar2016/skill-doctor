import { existsSync, readFileSync } from 'node:fs';
import { basename } from 'node:path';

import type { ContextCostGrade, ContextCostItem, ContextCostResult } from '../types/context';
import type { Platform, SkillRecord } from '../types/skill';

const DEFAULT_BUDGET_TOKENS = 2000;

interface EstimateContextCostOptions {
  budgetTokens?: number;
  projectPath?: string;
}

export function estimateContextCost(
  skills: SkillRecord[],
  options: EstimateContextCostOptions = {},
): ContextCostResult {
  const budgetTokens = options.budgetTokens ?? DEFAULT_BUDGET_TOKENS;
  const items = skills
    .map((skill) => estimateSkillCost(skill))
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
      scanned: skills.length,
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
    kind: context.kind,
    estimatedTokens,
    estimatedChars: context.text.replace(/\s+/g, ' ').trim().length,
    recommendation: getRecommendation(skill, context.kind, estimatedTokens),
  };
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

  return 'Compress metadata and keep only activation-critical wording.';
}

function gradeCost(totalTokens: number, budgetTokens: number): ContextCostGrade {
  const ratio = budgetTokens > 0 ? totalTokens / budgetTokens : Number.POSITIVE_INFINITY;
  if (ratio <= 0.25) return 'A';
  if (ratio <= 0.5) return 'B';
  if (ratio <= 1) return 'C';
  if (ratio <= 1.5) return 'D';
  return 'F';
}
