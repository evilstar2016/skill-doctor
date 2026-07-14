import { readFileSync } from 'fs';
import { scanSkills } from '../discovery/scanSkills';
import type { LlmExplainOptions } from '../types/explain';
import type { SkillRecord } from '../types/skill';
import { analyzeDiff } from './analyzeDiff';
import type { DiffResult, SkillProfile } from './types';

export interface RunDiffOptions {
  llmOptions?: LlmExplainOptions;
}

export class DiffError extends Error {}

export async function runDiff(
  nameA: string,
  nameB: string,
  skills: SkillRecord[],
  options: RunDiffOptions = {},
): Promise<DiffResult> {
  if (nameA === nameB) {
    throw new DiffError(`Both skill names are the same: "${nameA}". Provide two different skills.`);
  }

  const recordA = skills.find((s) => s.name === nameA);
  const recordB = skills.find((s) => s.name === nameB);

  const missing: string[] = [];
  if (!recordA) missing.push(nameA);
  if (!recordB) missing.push(nameB);

  if (missing.length > 0) {
    const available = skills.map((s) => s.name).join(', ');
    throw new DiffError(
      `Skill(s) not found: ${missing.map((n) => `"${n}"`).join(', ')}.\nAvailable skills: ${available}`,
    );
  }

  const skillA = extractSkillProfile(recordA!.name, recordA!.sourcePath, recordA!.triggers, recordA!.description);
  const skillB = extractSkillProfile(recordB!.name, recordB!.sourcePath, recordB!.triggers, recordB!.description);

  let analysis: DiffResult['analysis'] = null;
  if (options.llmOptions) {
    analysis = await analyzeDiff(skillA, skillB, options.llmOptions);
  }

  return { skillA, skillB, analysis };
}

export async function runDiffForCwd(
  nameA: string,
  nameB: string,
  cwd: string,
  options: RunDiffOptions = {},
): Promise<DiffResult> {
  return runDiff(nameA, nameB, await scanSkills(cwd), options);
}

function extractSkillProfile(
  name: string,
  sourcePath: string,
  triggers: string[],
  description: string,
): SkillProfile {
  let rawContent = '';
  try {
    rawContent = readFileSync(sourcePath, 'utf8');
  } catch {
    rawContent = '';
  }

  const whenToUse = extractSection(rawContent, ['When to Use', 'When To Use', 'Trigger', 'Use when']) ?? '';
  const checklistItems = extractChecklist(rawContent);

  return { name, description, whenToUse, triggers, checklistItems, rawContent };
}

function extractSection(content: string, headings: string[]): string | null {
  const lines = content.split(/\r?\n/);
  for (const heading of headings) {
    const startIdx = lines.findIndex((l) => /^#{1,3}\s/.test(l) && l.toLowerCase().includes(heading.toLowerCase()));
    if (startIdx === -1) continue;
    const sectionLines: string[] = [];
    for (let i = startIdx + 1; i < lines.length; i++) {
      if (/^#{1,3}\s/.test(lines[i])) break;
      sectionLines.push(lines[i]);
    }
    const result = sectionLines.join('\n').trim();
    if (result) return result;
  }
  return null;
}

function extractChecklist(content: string): string[] {
  const section = extractSection(content, ['Checklist', 'Steps', 'Process']);
  if (!section) return [];
  return section
    .split(/\r?\n/)
    .filter((l) => /^[\s]*[-*]\s/.test(l) || /^[\s]*\d+\.\s/.test(l))
    .map((l) => l.replace(/^[\s]*[-*\d.]+\s+/, '').trim())
    .filter(Boolean);
}
