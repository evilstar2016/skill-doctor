import { existsSync, readFileSync } from 'node:fs';
import { basename } from 'node:path';

import type { ContextCostGrade, ContextCostItem, ContextCostResult } from '../types/context';
import type { SkillRecord } from '../types/skill';

const DEFAULT_BUDGET_TOKENS = 2000;

interface EstimateContextCostOptions {
  budgetTokens?: number;
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

  return {
    summary: {
      totalEstimatedTokens,
      budgetTokens,
      grade: gradeCost(totalEstimatedTokens, budgetTokens),
      overBudget: totalEstimatedTokens > budgetTokens,
      scanned: skills.length,
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
  if (isClaudeSkill(skill)) {
    return {
      kind: 'claude-skill-description',
      text: [
        `Skill: ${skill.name}`,
        `Description: ${skill.description}`,
        skill.triggers.length > 0 ? `Triggers: ${skill.triggers.join('; ')}` : '',
      ].filter(Boolean).join('\n'),
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

function isClaudeSkill(skill: SkillRecord): boolean {
  return skill.platform === 'claude' && basename(skill.sourcePath).toLowerCase() === 'skill.md';
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
