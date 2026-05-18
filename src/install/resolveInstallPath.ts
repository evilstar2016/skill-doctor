import { join } from 'node:path';

export function resolveInstallPath(
  globalDir: string,
  layout: 'skill-dirs' | 'files',
  skillName: string,
): string {
  if (layout === 'skill-dirs') {
    return join(globalDir, skillName, 'SKILL.md');
  }
  return join(globalDir, `${skillName}.md`);
}
