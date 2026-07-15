import { existsSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

import type { PlatformAdapter } from '../types';

const IGNORED_RECURSIVE_DIRS = new Set([
  '.git',
  '.hg',
  '.svn',
  'node_modules',
  'vendor',
  'dist',
  'build',
  'coverage',
]);

export const copilotAdapter: PlatformAdapter = {
  platform: 'copilot',
  displayName: 'GitHub Copilot',
  aliases: [],
  confidence: 'high',
  global: [
    { path: '~/.copilot/skills', mode: 'recursive-dir', layout: 'skill-dirs' },
    { path: '~/.agents/skills', mode: 'recursive-dir', layout: 'skill-dirs' },
  ],
  project: [
    { path: '.github/copilot-instructions.md', mode: 'single-file' },
    { path: '.github/instructions', mode: 'recursive-dir', layout: 'files' },
    { path: '.github/prompts', mode: 'recursive-dir', layout: 'files', includeFileNameSuffixes: ['.prompt.md'] },
    { path: '.github/skills', mode: 'recursive-dir', layout: 'skill-dirs' },
    { path: '.claude/skills', mode: 'recursive-dir', layout: 'skill-dirs', costOnly: true },
    { path: '.agents/skills', mode: 'recursive-dir', layout: 'skill-dirs' },
    { path: 'AGENTS.md', mode: 'single-file', costOnly: true },
    { path: 'CLAUDE.md', mode: 'single-file', costOnly: true },
    { path: 'GEMINI.md', mode: 'single-file', costOnly: true },
  ],
  extensions: ['.md'],
  installTargets: [
    { targetId: 'copilot-global-skills', scope: 'global', path: '~/.copilot/skills', layout: 'skill-dirs' },
    { targetId: 'copilot-global-agents-skills', scope: 'global', path: '~/.agents/skills', layout: 'skill-dirs' },
    { targetId: 'copilot-project-skills', scope: 'project', path: '.github/skills', layout: 'skill-dirs' },
    { targetId: 'copilot-project-agents-skills', scope: 'project', path: '.agents/skills', layout: 'skill-dirs' },
  ],
  mcpConfigFiles: [
    { scope: 'project', path: '.vscode/mcp.json', format: 'json' },
    { scope: 'project', path: '.github/mcp.json', format: 'json' },
  ],
  costPolicy: {
    rules: [
      {
        match: { entryFile: true },
        profile: { mode: 'metadata', kind: 'agent-skill-description' },
      },
      {
        match: { fileNameSuffix: '.prompt.md' },
        profile: { mode: 'manual', kind: 'copilot-prompt-file' },
      },
      {
        match: { fileNameSuffix: '.instructions.md' },
        profile: { mode: 'file-scoped', kind: 'copilot-instruction-file' },
      },
      {
        match: { fileNameIn: ['agents.md', 'claude.md', 'gemini.md'] },
        profile: { mode: 'always-on', kind: 'always-on-file' },
      },
    ],
    defaultProfile: { mode: 'always-on', kind: 'copilot-instruction-file' },
  },
  discoverAdditionalInstructions: ({ projectDir }) => findNamedFiles(projectDir, 'AGENTS.md').map((filePath) => ({
    filePath,
    installSource: 'AGENTS.md',
    scope: 'project',
  })),
};

function findNamedFiles(root: string, fileName: string): string[] {
  if (!existsSync(root)) return [];

  const results: string[] = [];
  const visit = (dir: string): void => {
    let entries: string[];
    try {
      entries = readdirSync(dir);
    } catch {
      return;
    }

    for (const entry of entries) {
      if (entry.startsWith('.') || IGNORED_RECURSIVE_DIRS.has(entry)) continue;
      const entryPath = join(dir, entry);
      let stats;
      try {
        stats = statSync(entryPath);
      } catch {
        continue;
      }
      if (stats.isDirectory()) {
        visit(entryPath);
      } else if (entry === fileName) {
        results.push(entryPath);
      }
    }
  };

  visit(root);
  return results;
}
