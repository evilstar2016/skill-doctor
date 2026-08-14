import { basename } from 'node:path';

import type { SkillRecord } from '../../types/skill';
import type { PlatformAdapter } from '../types';

const WORKBUDDY_MEMORY_FILES = new Set(['IDENTITY.md', 'USER.md', 'SOUL.md', 'MEMORY.md']);

export const workbuddyAdapter: PlatformAdapter = {
  platform: 'workbuddy',
  displayName: 'WorkBuddy',
  aliases: [],
  confidence: 'high',
  global: [
    { path: '~/.workbuddy/skills', mode: 'recursive-dir', layout: 'skill-dirs', maxDepth: 5 },
    { path: '~/.workbuddy/connectors/skills', mode: 'recursive-dir', layout: 'skill-dirs', maxDepth: 5 },
    ...[...WORKBUDDY_MEMORY_FILES].map((fileName) => ({
      path: `~/.workbuddy/${fileName}`,
      mode: 'single-file' as const,
    })),
  ],
  project: [
    { path: '.workbuddy/skills', mode: 'recursive-dir', layout: 'skill-dirs', maxDepth: 5 },
  ],
  extensions: ['.md'],
  installTargets: [
    { targetId: 'workbuddy-global-skills', scope: 'global', path: '~/.workbuddy/skills', layout: 'skill-dirs' },
    { targetId: 'workbuddy-project-skills', scope: 'project', path: '.workbuddy/skills', layout: 'skill-dirs' },
  ],
  mcpConfigFiles: [
    { scope: 'global', path: '~/.workbuddy/mcp.json', format: 'json' },
    { scope: 'project', path: '.workbuddy/mcp.json', format: 'json' },
  ],
  costPolicy: {
    rules: [
      {
        match: { entryFile: true },
        profile: { mode: 'metadata', kind: 'agent-skill-description', includePath: true },
      },
    ],
    defaultProfile: { mode: 'always-on', kind: 'always-on-file' },
  },
  postProcessSkills: postProcessWorkbuddySkills,
};

function postProcessWorkbuddySkills(skills: SkillRecord[]): SkillRecord[] {
  const workbuddySkills = skills.filter((skill) => skill.platform === 'workbuddy');
  const seenNames = new Set<string>();
  const sorted = [...workbuddySkills].sort((left, right) => {
    const rankDifference = workbuddyRank(left) - workbuddyRank(right);
    return rankDifference || left.sourcePath.localeCompare(right.sourcePath);
  });

  const processed = new Map<string, SkillRecord>();
  for (const skill of sorted) {
    const memory = isMemoryFile(skill);
    const sourceKind = memory
      ? 'workbuddy-memory'
      : isConnectorSkill(skill)
        ? 'workbuddy-connector-skills'
        : skill.scope === 'project'
          ? 'workbuddy-project-skills'
          : 'workbuddy-global-skills';
    const context = {
      ...skill.context,
      ...(memory ? {
        resource: 'memory' as const,
        controllable: false,
        estimateStatus: 'estimated' as const,
        controlMethod: 'workbuddy-context-file',
      } : {
        resource: 'skill' as const,
        configSource: sourceKind,
      }),
    };

    let next: SkillRecord = memory
      ? { ...skill, name: basename(skill.sourcePath), context }
      : { ...skill, context };
    if (!memory) {
      // WorkBuddy resolves duplicate names by precedence before enablement; a disabled
      // higher-priority copy therefore shadows lower-priority copies instead of falling back.
      const key = skill.name.trim();
      if (seenNames.has(key)) {
        next = {
          ...next,
          context: {
            ...context,
            enabled: false,
            controllable: false,
            controlMethod: 'workbuddy-precedence',
          },
        };
      } else {
        seenNames.add(key);
      }
    }
    processed.set(skill.sourcePath, next);
  }

  return skills.map((skill) => processed.get(skill.sourcePath) ?? skill);
}

function workbuddyRank(skill: SkillRecord): number {
  if (isMemoryFile(skill)) return 3;
  if (skill.scope === 'project') return 0;
  return isConnectorSkill(skill) ? 2 : 1;
}

function isMemoryFile(skill: SkillRecord): boolean {
  return WORKBUDDY_MEMORY_FILES.has(basename(skill.sourcePath));
}

function isConnectorSkill(skill: SkillRecord): boolean {
  return skill.sourcePath.replace(/\\/g, '/').includes('/.workbuddy/connectors/skills/');
}
