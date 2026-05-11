import { resolvePaths } from './resolvePaths';
import { parseSkill } from '../parsing/parseSkill';
import type { SkillRecord } from '../types/skill';

export function scanSkills(cwd: string): SkillRecord[] {
  return resolvePaths(cwd)
    .map((file) => parseSkill(file))
    .filter((skill): skill is SkillRecord => skill !== null);
}