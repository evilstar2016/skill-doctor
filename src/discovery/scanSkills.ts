import { parseSkill } from '../parsing/parseSkill';
import type { ProvenanceCache } from '../parsing/provenanceCache';
import type { LlmExplainOptions } from '../types/explain';
import type { SkillRecord } from '../types/skill';
import { resolvePaths } from './resolvePaths';

interface ScanSkillsOptions {
  homeDir?: string;
  appDataDir?: string;
  llmOptions?: LlmExplainOptions;
  provenanceCache?: ProvenanceCache;
  extraPaths?: string[];
  includeCostPaths?: boolean;
}

export async function scanSkills(cwd: string, options: ScanSkillsOptions = {}): Promise<SkillRecord[]> {
  const skills: SkillRecord[] = [];

  for (const file of resolvePaths(cwd, {
    homeDir: options.homeDir,
    appDataDir: options.appDataDir,
    extraPaths: options.extraPaths,
    includeCostPaths: options.includeCostPaths,
  })) {
    const skill = await parseSkill(file, {
      llmOptions: options.llmOptions,
      provenanceCache: options.provenanceCache,
    });
    if (skill) {
      skills.push(skill);
    }
  }

  return skills;
}
