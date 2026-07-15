import type { PlatformCostPolicy } from './types';

export const CODEX_AGENTS_LIMIT_CHARS = 32 * 1024;
export const CODEX_SKILL_LIST_LIMIT_CHARS = 8000;
export const CLAUDE_SKILL_LIST_LIMIT_CHARS = 1536;

export const DEFAULT_SKILL_COST_POLICY: PlatformCostPolicy = {
  rules: [
    {
      match: { entryFile: true },
      profile: { mode: 'metadata', kind: 'agent-skill-description' },
    },
  ],
  defaultProfile: { mode: 'always-on', kind: 'always-on-file' },
};
