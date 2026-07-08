import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';

import { afterEach, describe, expect, it } from 'vitest';

import { resolvePaths } from '../../src/discovery/resolvePaths';

function createTempRoot(): string {
  return mkdtempSync(join(tmpdir(), 'skill-doctor-'));
}

function writeFile(filePath: string, content = '# fixture\n'): void {
  mkdirSync(dirname(filePath), { recursive: true });
  writeFileSync(filePath, content, 'utf8');
}

const tempRoots: string[] = [];

afterEach(() => {
  for (const root of tempRoots) {
    rmSync(root, { recursive: true, force: true });
  }
  tempRoots.length = 0;
});

describe('resolvePaths', () => {
  it('finds claude global skill files with the correct scope and platform', () => {
    const tempRoot = createTempRoot();
    tempRoots.push(tempRoot);

    const homeDir = join(tempRoot, 'home');
    const cwd = join(tempRoot, 'workspace');

    writeFile(join(homeDir, '.claude', 'skills', 'alpha', 'SKILL.md'));
    writeFile(join(homeDir, '.claude', 'skills', 'beta', 'SKILL.md'));

    const result = resolvePaths(cwd, { homeDir });
    const claudeFiles = result.filter((entry) => entry.platform === 'claude');

    expect(claudeFiles).toHaveLength(2);
    expect(claudeFiles.every((entry) => entry.scope === 'global')).toBe(true);
    expect(claudeFiles.every((entry) => entry.installSource === '~/.claude/skills')).toBe(true);
  });

  it('finds cursor project rule directories and .cursorrules files', () => {
    const tempRoot = createTempRoot();
    tempRoots.push(tempRoot);

    const homeDir = join(tempRoot, 'home');
    const cwd = join(tempRoot, 'workspace');

    writeFile(join(cwd, '.cursor', 'rules', 'test-driven-development.mdc'));
    writeFile(join(cwd, '.cursor', 'rules', 'reviews', 'pull-request.mdc'));
    writeFile(join(cwd, '.cursorrules'));

    const result = resolvePaths(cwd, { homeDir, includeCostPaths: true });
    const cursorFiles = result.filter((entry) => entry.platform === 'cursor');

    expect(cursorFiles).toHaveLength(3);
    expect(cursorFiles.every((entry) => entry.scope === 'project')).toBe(true);
    expect(cursorFiles.some((entry) => entry.filePath.includes(join('reviews', 'pull-request.mdc')))).toBe(true);
  });

  it('skips non-existent directories without throwing', () => {
    const tempRoot = createTempRoot();
    tempRoots.push(tempRoot);

    const homeDir = join(tempRoot, 'home');
    const cwd = join(tempRoot, 'workspace');

    expect(() => resolvePaths(cwd, { homeDir })).not.toThrow();
    expect(resolvePaths(cwd, { homeDir })).toEqual([]);
  });

  it('finds global copilot skills from the .copilot/skills directory', () => {
    const tempRoot = createTempRoot();
    tempRoots.push(tempRoot);

    const homeDir = join(tempRoot, 'home');
    const cwd = join(tempRoot, 'workspace');

    writeFile(join(homeDir, '.copilot', 'skills', 'review-pr', 'SKILL.md'));

    const result = resolvePaths(cwd, { homeDir, includeCostPaths: true });
    const copilotFiles = result.filter((entry) => entry.platform === 'copilot' && entry.scope === 'global');

    expect(copilotFiles).toHaveLength(1);
    expect(copilotFiles[0]?.filePath).toContain(join('.copilot', 'skills', 'review-pr', 'SKILL.md'));
  });

  it('finds global opencode skills from the AppData directory', () => {
    const tempRoot = createTempRoot();
    tempRoots.push(tempRoot);

    const homeDir = join(tempRoot, 'home');
    const appDataDir = join(tempRoot, 'appdata');
    const cwd = join(tempRoot, 'workspace');

    writeFile(join(appDataDir, 'opencode', 'skills', 'review-pr', 'SKILL.md'));

    const result = resolvePaths(cwd, { homeDir, appDataDir });
    const opencodeFiles = result.filter((entry) => entry.platform === 'opencode' && entry.scope === 'global');

    expect(opencodeFiles).toHaveLength(1);
    expect(opencodeFiles[0]?.filePath).toContain(join('opencode', 'skills', 'review-pr', 'SKILL.md'));
    expect(opencodeFiles[0]?.installSource).toBe('%APPDATA%/opencode/skills');
    expect(opencodeFiles[0]?.confidence).toBe('low');
  });

  it('finds the project .windsurfrules file', () => {
    const tempRoot = createTempRoot();
    tempRoots.push(tempRoot);

    const homeDir = join(tempRoot, 'home');
    const cwd = join(tempRoot, 'workspace');

    writeFile(join(cwd, '.windsurfrules'));

    const result = resolvePaths(cwd, { homeDir });
    const windsurfFiles = result.filter((entry) => entry.platform === 'windsurf');

    expect(windsurfFiles).toHaveLength(1);
    expect(windsurfFiles[0]?.filePath).toContain('.windsurfrules');
  });

  it('returns AGENTS.md once for codex and once for opencode by default', () => {
    const tempRoot = createTempRoot();
    tempRoots.push(tempRoot);

    const homeDir = join(tempRoot, 'home');
    const cwd = join(tempRoot, 'workspace');

    writeFile(join(cwd, 'AGENTS.md'));

    const result = resolvePaths(cwd, { homeDir });
    const agentsEntries = result.filter((entry) => entry.filePath.endsWith('AGENTS.md'));

    expect(agentsEntries).toHaveLength(2);
    expect(agentsEntries.map((entry) => entry.platform).sort()).toEqual(['codex', 'opencode']);
  });

  it('includes AGENTS.md for Copilot and Windsurf in cost discovery mode', () => {
    const tempRoot = createTempRoot();
    tempRoots.push(tempRoot);

    const homeDir = join(tempRoot, 'home');
    const cwd = join(tempRoot, 'workspace');

    writeFile(join(cwd, 'AGENTS.md'));

    const result = resolvePaths(cwd, { homeDir, includeCostPaths: true });
    const agentsEntries = result.filter((entry) => entry.filePath.endsWith('AGENTS.md'));

    expect(agentsEntries.map((entry) => entry.platform).sort()).toEqual(['codex', 'copilot', 'opencode', 'windsurf']);
  });

  it('prefers Codex AGENTS.override.md over AGENTS.md in the same directory', () => {
    const tempRoot = createTempRoot();
    tempRoots.push(tempRoot);

    const homeDir = join(tempRoot, 'home');
    const cwd = join(tempRoot, 'workspace');

    writeFile(join(cwd, 'AGENTS.md'));
    writeFile(join(cwd, 'AGENTS.override.md'));
    writeFile(join(homeDir, '.codex', 'AGENTS.md'));
    writeFile(join(homeDir, '.codex', 'AGENTS.override.md'));

    const result = resolvePaths(cwd, { homeDir, includeCostPaths: true });
    const codexFiles = result.filter((entry) => entry.platform === 'codex');

    expect(codexFiles.some((entry) => entry.filePath.endsWith(join(cwd, 'AGENTS.md')))).toBe(false);
    expect(codexFiles.some((entry) => entry.filePath.endsWith(join(cwd, 'AGENTS.override.md')))).toBe(true);
    expect(codexFiles.some((entry) => entry.filePath.endsWith(join(homeDir, '.codex', 'AGENTS.md')))).toBe(false);
    expect(codexFiles.some((entry) => entry.filePath.endsWith(join(homeDir, '.codex', 'AGENTS.override.md')))).toBe(true);
  });

  it('ignores direct markdown files at the root of skill-dir platforms', () => {
    const tempRoot = createTempRoot();
    tempRoots.push(tempRoot);

    const homeDir = join(tempRoot, 'home');
    const cwd = join(tempRoot, 'workspace');

    writeFile(join(homeDir, '.claude', 'skills', 'README.md'));
    writeFile(join(homeDir, '.claude', 'skills', 'review-pr', 'SKILL.md'));

    const result = resolvePaths(cwd, { homeDir });
    const claudeFiles = result.filter((entry) => entry.platform === 'claude');

    expect(claudeFiles).toHaveLength(1);
    expect(claudeFiles[0]?.filePath).toContain(join('review-pr', 'SKILL.md'));
  });

  it('finds nested copilot instruction files in .github/instructions', () => {
    const tempRoot = createTempRoot();
    tempRoots.push(tempRoot);

    const homeDir = join(tempRoot, 'home');
    const cwd = join(tempRoot, 'workspace');

    writeFile(join(cwd, '.github', 'instructions', 'reviews', 'pull-request.instructions.md'));

    const result = resolvePaths(cwd, { homeDir });
    const copilotFiles = result.filter((entry) => entry.platform === 'copilot' && entry.scope === 'project');

    expect(copilotFiles).toHaveLength(1);
    expect(copilotFiles[0]?.filePath).toContain(join('reviews', 'pull-request.instructions.md'));
  });

  it('finds every Copilot instruction and prompt file in nested collection dirs', () => {
    const tempRoot = createTempRoot();
    tempRoots.push(tempRoot);

    const homeDir = join(tempRoot, 'home');
    const cwd = join(tempRoot, 'workspace');

    writeFile(join(cwd, '.github', 'instructions', 'reviews', 'pull-request.instructions.md'));
    writeFile(join(cwd, '.github', 'instructions', 'reviews', 'security.instructions.md'));
    writeFile(join(cwd, '.github', 'instructions', 'reviews', 'nested', 'api.instructions.md'));
    writeFile(join(cwd, '.github', 'prompts', 'review.prompt.md'));
    writeFile(join(cwd, '.github', 'prompts', 'docs', 'readme.prompt.md'));
    writeFile(join(cwd, '.github', 'prompts', 'docs', 'notes.md'));

    const result = resolvePaths(cwd, { homeDir });
    const relativeCopilotFiles = result
      .filter((entry) => entry.platform === 'copilot' && entry.scope === 'project')
      .map((entry) => entry.filePath.slice(cwd.length + 1).split('/').join('/'))
      .sort();

    expect(relativeCopilotFiles).toEqual([
      '.github/instructions/reviews/nested/api.instructions.md',
      '.github/instructions/reviews/pull-request.instructions.md',
      '.github/instructions/reviews/security.instructions.md',
      '.github/prompts/docs/readme.prompt.md',
      '.github/prompts/review.prompt.md',
    ]);
  });

  it('finds nested Copilot AGENTS.md files in cost discovery mode', () => {
    const tempRoot = createTempRoot();
    tempRoots.push(tempRoot);

    const homeDir = join(tempRoot, 'home');
    const cwd = join(tempRoot, 'workspace');

    writeFile(join(cwd, 'AGENTS.md'));
    writeFile(join(cwd, 'packages', 'api', 'AGENTS.md'));
    writeFile(join(cwd, 'node_modules', 'dependency', 'AGENTS.md'));

    const result = resolvePaths(cwd, { homeDir, includeCostPaths: true });
    const copilotAgentsFiles = result
      .filter((entry) => entry.platform === 'copilot' && entry.filePath.endsWith('AGENTS.md'))
      .map((entry) => entry.filePath.slice(cwd.length + 1).split('/').join('/'))
      .sort();

    expect(copilotAgentsFiles).toEqual(['AGENTS.md', 'packages/api/AGENTS.md']);
  });

  it('does not recursively ingest arbitrary markdown from the codex home directory', () => {
    const tempRoot = createTempRoot();
    tempRoots.push(tempRoot);

    const homeDir = join(tempRoot, 'home');
    const cwd = join(tempRoot, 'workspace');

    writeFile(join(homeDir, '.codex', 'AGENTS.md'));
    writeFile(join(homeDir, '.codex', 'skills', 'review-pr', 'SKILL.md'));
    writeFile(join(homeDir, '.agent', 'skills', 'agent-review', 'SKILL.md'));
    writeFile(join(homeDir, '.codex', 'notes', 'reference.md'));
    writeFile(join(homeDir, '.codex', 'examples', 'workflow.md'));

    const result = resolvePaths(cwd, { homeDir });
    const codexFiles = result.filter((entry) => entry.platform === 'codex');

    expect(codexFiles).toHaveLength(3);
    expect(codexFiles.some((entry) => entry.filePath.endsWith(join('.codex', 'AGENTS.md')))).toBe(true);
    expect(codexFiles.some((entry) => entry.filePath.endsWith(join('.codex', 'skills', 'review-pr', 'SKILL.md')))).toBe(true);
    expect(codexFiles.some((entry) => entry.filePath.endsWith(join('.agent', 'skills', 'agent-review', 'SKILL.md')))).toBe(true);
    expect(codexFiles.some((entry) => entry.filePath.includes(join('.codex', 'notes')))).toBe(false);
  });

  it('finds project-local codex AGENTS and skills under .codex and .agent', () => {
    const tempRoot = createTempRoot();
    tempRoots.push(tempRoot);

    const homeDir = join(tempRoot, 'home');
    const cwd = join(tempRoot, 'workspace');

    writeFile(join(cwd, '.codex', 'AGENTS.md'));
    writeFile(join(cwd, '.codex', 'skills', 'review-pr', 'SKILL.md'));
    writeFile(join(cwd, '.agent', 'skills', 'agent-review', 'SKILL.md'));
    writeFile(join(cwd, '.agents', 'skills', 'agents-review', 'SKILL.md'));
    writeFile(join(cwd, '.codex', 'notes', 'reference.md'));

    const result = resolvePaths(cwd, { homeDir });
    const codexFiles = result.filter((entry) => entry.platform === 'codex' && entry.scope === 'project');

    expect(codexFiles).toHaveLength(4);
    expect(codexFiles.some((entry) => entry.filePath.endsWith(join('.codex', 'AGENTS.md')))).toBe(true);
    expect(codexFiles.some((entry) => entry.filePath.endsWith(join('.codex', 'skills', 'review-pr', 'SKILL.md')))).toBe(true);
    expect(codexFiles.some((entry) => entry.filePath.endsWith(join('.agent', 'skills', 'agent-review', 'SKILL.md')))).toBe(true);
    expect(codexFiles.some((entry) => entry.filePath.endsWith(join('.agents', 'skills', 'agents-review', 'SKILL.md')))).toBe(true);
    expect(codexFiles.some((entry) => entry.filePath.includes(join('.codex', 'notes')))).toBe(false);
  });

  it('finds mainstream Copilot skill locations', () => {
    const tempRoot = createTempRoot();
    tempRoots.push(tempRoot);

    const homeDir = join(tempRoot, 'home');
    const cwd = join(tempRoot, 'workspace');

    writeFile(join(cwd, '.github', 'skills', 'project-copilot', 'SKILL.md'));
    writeFile(join(cwd, '.agents', 'skills', 'project-agent', 'SKILL.md'));
    writeFile(join(homeDir, '.agents', 'skills', 'global-agent', 'SKILL.md'));

    const result = resolvePaths(cwd, { homeDir });
    const copilotFiles = result.filter((entry) => entry.platform === 'copilot');

    expect(copilotFiles.some((entry) => entry.filePath.endsWith(join('.github', 'skills', 'project-copilot', 'SKILL.md')))).toBe(true);
    expect(copilotFiles.some((entry) => entry.filePath.endsWith(join('.agents', 'skills', 'project-agent', 'SKILL.md')))).toBe(true);
    expect(copilotFiles.some((entry) => entry.filePath.endsWith(join('.agents', 'skills', 'global-agent', 'SKILL.md')))).toBe(true);
  });

  it('finds Windsurf skills and rule files', () => {
    const tempRoot = createTempRoot();
    tempRoots.push(tempRoot);

    const homeDir = join(tempRoot, 'home');
    const cwd = join(tempRoot, 'workspace');

    writeFile(join(cwd, '.windsurf', 'skills', 'workspace-skill', 'SKILL.md'));
    writeFile(join(cwd, '.devin', 'rules', 'tests.md'));
    writeFile(join(cwd, '.windsurf', 'rules', 'legacy.md'));
    writeFile(join(homeDir, '.codeium', 'windsurf', 'memories', 'global_rules.md'));

    const result = resolvePaths(cwd, { homeDir });
    const windsurfFiles = result.filter((entry) => entry.platform === 'windsurf');

    expect(windsurfFiles.some((entry) => entry.filePath.endsWith(join('.windsurf', 'skills', 'workspace-skill', 'SKILL.md')))).toBe(true);
    expect(windsurfFiles.some((entry) => entry.filePath.endsWith(join('.devin', 'rules', 'tests.md')))).toBe(true);
    expect(windsurfFiles.some((entry) => entry.filePath.endsWith(join('.windsurf', 'rules', 'legacy.md')))).toBe(true);
    expect(windsurfFiles.some((entry) => entry.filePath.endsWith(join('.codeium', 'windsurf', 'memories', 'global_rules.md')))).toBe(true);
  });

  it('honors Gemini contextFileName settings', () => {
    const tempRoot = createTempRoot();
    tempRoots.push(tempRoot);

    const homeDir = join(tempRoot, 'home');
    const cwd = join(tempRoot, 'workspace');

    writeFile(join(cwd, '.gemini', 'settings.json'), JSON.stringify({ contextFileName: ['GEMINI.md', 'AGENTS.md'] }));
    writeFile(join(cwd, 'AGENTS.md'));

    const result = resolvePaths(cwd, { homeDir, includeCostPaths: true });
    const geminiFiles = result.filter((entry) => entry.platform === 'gemini');

    expect(geminiFiles.some((entry) => entry.filePath.endsWith(join(cwd, 'AGENTS.md')))).toBe(true);
  });

  it('picks SKILL.md when a skill dir contains multiple md files', () => {
    const tempRoot = createTempRoot();
    tempRoots.push(tempRoot);

    const homeDir = join(tempRoot, 'home');
    const cwd = join(tempRoot, 'workspace');

    writeFile(join(homeDir, '.claude', 'skills', 'my-skill', 'SKILL.md'));
    writeFile(join(homeDir, '.claude', 'skills', 'my-skill', 'README.md'));
    writeFile(join(homeDir, '.claude', 'skills', 'my-skill', 'README.en.md'));

    const result = resolvePaths(cwd, { homeDir });
    const claudeFiles = result.filter((entry) => entry.platform === 'claude');

    expect(claudeFiles).toHaveLength(1);
    expect(claudeFiles[0]?.filePath).toContain('SKILL.md');
  });

  it('does not recurse into support subdirs of a skill dir (references, assets, node_modules)', () => {
    const tempRoot = createTempRoot();
    tempRoots.push(tempRoot);

    const homeDir = join(tempRoot, 'home');
    const cwd = join(tempRoot, 'workspace');

    writeFile(join(homeDir, '.claude', 'skills', 'my-skill', 'SKILL.md'));
    // support subdirs should not produce extra skill entries
    writeFile(join(homeDir, '.claude', 'skills', 'my-skill', 'references', 'ref.md'));
    writeFile(join(homeDir, '.claude', 'skills', 'my-skill', 'assets', 'guide.md'));
    writeFile(join(homeDir, '.claude', 'skills', 'my-skill', 'scripts', 'node_modules', 'pkg', 'README.md'));

    const result = resolvePaths(cwd, { homeDir });
    const claudeFiles = result.filter((entry) => entry.platform === 'claude');

    expect(claudeFiles).toHaveLength(1);
    expect(claudeFiles[0]?.filePath).toContain('SKILL.md');
  });

  it('skips hidden subdirectories but recurses into non-hidden collection dirs', () => {
    const tempRoot = createTempRoot();
    tempRoots.push(tempRoot);

    const homeDir = join(tempRoot, 'home');
    const cwd = join(tempRoot, 'workspace');

    // non-standard but non-hidden collection dir — skills inside should be found
    writeFile(join(homeDir, '.claude', 'skills', 'skills', 'nested-skill', 'SKILL.md'));
    // hidden dir — should be skipped entirely
    writeFile(join(homeDir, '.claude', 'skills', '.windsurf', 'skills', 'hidden-skill', 'SKILL.md'));

    const result = resolvePaths(cwd, { homeDir });
    const claudeFiles = result.filter((entry) => entry.platform === 'claude');
    const paths = claudeFiles.map((f) => f.filePath);

    expect(paths.some((p) => p.includes('nested-skill'))).toBe(true);
    expect(paths.some((p) => p.includes('hidden-skill'))).toBe(false);
  });

  it('does not treat reference sub-subdirectories as skills when skill dir has no main file', () => {
    const tempRoot = createTempRoot();
    tempRoots.push(tempRoot);

    const homeDir = join(tempRoot, 'home');
    const cwd = join(tempRoot, 'workspace');

    // skill dir with no top-level .md — only a references/ subdir with multiple step files
    writeFile(join(homeDir, '.claude', 'skills', 'project-analysis', 'references', 'step-1.md'));
    writeFile(join(homeDir, '.claude', 'skills', 'project-analysis', 'references', 'step-2.md'));
    writeFile(join(homeDir, '.claude', 'skills', 'project-analysis', 'references', 'step-3.md'));

    const result = resolvePaths(cwd, { homeDir });
    const claudeFiles = result.filter((entry) => entry.platform === 'claude');

    // references/ files are not named SKILL.md — with strict entry enforcement, none qualify
    expect(claudeFiles).toHaveLength(0);
  });

  it('skips a skill dir that has .md files but none named SKILL.md', () => {
    const tempRoot = createTempRoot();
    tempRoots.push(tempRoot);

    const homeDir = join(tempRoot, 'home');
    const cwd = join(tempRoot, 'workspace');

    // dir with README.md but no SKILL.md → should not be picked as a skill
    writeFile(join(homeDir, '.claude', 'skills', 'my-skill', 'README.md'));
    writeFile(join(homeDir, '.claude', 'skills', 'my-skill', 'README.en.md'));

    const result = resolvePaths(cwd, { homeDir });
    const claudeFiles = result.filter((entry) => entry.platform === 'claude');

    expect(claudeFiles).toHaveLength(0);
  });

  it('does not recurse into sub-subdirectories of support dirs when skill has no main file', () => {
    const tempRoot = createTempRoot();
    tempRoots.push(tempRoot);

    const homeDir = join(tempRoot, 'home');
    const cwd = join(tempRoot, 'workspace');

    // references/ has no direct .md — only sub-subdirs with individual step files
    writeFile(join(homeDir, '.claude', 'skills', 'project-analysis', 'references', 'step-1', 'guide.md'));
    writeFile(join(homeDir, '.claude', 'skills', 'project-analysis', 'references', 'step-2', 'guide.md'));
    writeFile(join(homeDir, '.claude', 'skills', 'project-analysis', 'references', 'step-3', 'guide.md'));

    const result = resolvePaths(cwd, { homeDir });
    const claudeFiles = result.filter((entry) => entry.platform === 'claude');

    // depth >= 2 with no direct .md → skipped entirely; no step sub-dirs should produce skills
    expect(claudeFiles).toHaveLength(0);
  });

  it('finds openclaw global skills', () => {
    const tempRoot = createTempRoot();
    tempRoots.push(tempRoot);

    const homeDir = join(tempRoot, 'home');
    const cwd = join(tempRoot, 'workspace');

    writeFile(join(homeDir, '.openclaw', 'skills', 'git-automation', 'SKILL.md'));
    writeFile(join(homeDir, '.openclaw', 'skills', 'code-review', 'SKILL.md'));

    const result = resolvePaths(cwd, { homeDir });
    const clawFiles = result.filter((entry) => entry.platform === 'openclaw');

    expect(clawFiles).toHaveLength(2);
    expect(clawFiles.every((entry) => entry.scope === 'global')).toBe(true);
    expect(clawFiles.every((entry) => entry.installSource === '~/.openclaw/skills')).toBe(true);
  });

  it('finds hermes global skills', () => {
    const tempRoot = createTempRoot();
    tempRoots.push(tempRoot);

    const homeDir = join(tempRoot, 'home');
    const cwd = join(tempRoot, 'workspace');

    writeFile(join(homeDir, '.config', 'hermes', 'skills', 'my-workflow', 'SKILL.md'));

    const result = resolvePaths(cwd, { homeDir });
    const hermesFiles = result.filter((entry) => entry.platform === 'hermes');

    expect(hermesFiles).toHaveLength(1);
    expect(hermesFiles[0]?.scope).toBe('global');
    expect(hermesFiles[0]?.installSource).toBe('~/.config/hermes/skills');
  });

  it('scans extra paths from config as unknown platform', () => {
    const tempRoot = createTempRoot();
    tempRoots.push(tempRoot);

    const homeDir = join(tempRoot, 'home');
    const cwd = join(tempRoot, 'workspace');
    const customDir = join(tempRoot, 'my-custom-skills');

    writeFile(join(customDir, 'super-tool', 'SKILL.md'));
    writeFile(join(customDir, 'another-tool', 'SKILL.md'));

    const result = resolvePaths(cwd, { homeDir, extraPaths: [customDir] });
    const customFiles = result.filter((entry) => entry.platform === 'unknown');

    expect(customFiles).toHaveLength(2);
    expect(customFiles.every((entry) => entry.scope === 'global')).toBe(true);
    expect(customFiles.every((entry) => entry.confidence === 'low')).toBe(true);
  });

  it('resolves tilde in extra paths', () => {
    const tempRoot = createTempRoot();
    tempRoots.push(tempRoot);

    const homeDir = join(tempRoot, 'home');
    const cwd = join(tempRoot, 'workspace');

    writeFile(join(homeDir, 'my-skills', 'tool-a', 'SKILL.md'));

    const result = resolvePaths(cwd, { homeDir, extraPaths: ['~/my-skills'] });
    const customFiles = result.filter((entry) => entry.platform === 'unknown');

    expect(customFiles).toHaveLength(1);
    expect(customFiles[0]?.filePath).toContain('tool-a');
  });

  it('expands wildcard in extra paths and scans each match', () => {
    const tempRoot = createTempRoot();
    tempRoots.push(tempRoot);

    const homeDir = join(tempRoot, 'home');
    const cwd = join(tempRoot, 'workspace');

    writeFile(join(homeDir, '.openclaw', 'workspace-alpha', 'skills', 'deploy', 'SKILL.md'));
    writeFile(join(homeDir, '.openclaw', 'workspace-beta', 'skills', 'monitor', 'SKILL.md'));
    writeFile(join(homeDir, '.openclaw', 'config', 'skills', 'should-not-match', 'SKILL.md'));

    const result = resolvePaths(cwd, { homeDir, extraPaths: ['~/.openclaw/workspace-*/skills'] });
    const customFiles = result.filter((entry) => entry.platform === 'unknown');

    expect(customFiles).toHaveLength(2);
    expect(customFiles.some((f) => f.filePath.includes('deploy'))).toBe(true);
    expect(customFiles.some((f) => f.filePath.includes('monitor'))).toBe(true);
    expect(customFiles.some((f) => f.filePath.includes('should-not-match'))).toBe(false);
  });

  it('returns nothing for a glob that matches no directories', () => {
    const tempRoot = createTempRoot();
    tempRoots.push(tempRoot);

    const homeDir = join(tempRoot, 'home');
    const cwd = join(tempRoot, 'workspace');

    const result = resolvePaths(cwd, { homeDir, extraPaths: ['~/nonexistent-*/skills'] });
    const customFiles = result.filter((entry) => entry.platform === 'unknown');

    expect(customFiles).toHaveLength(0);
  });

  it('expands multiple wildcards in a single extra path', () => {
    const tempRoot = createTempRoot();
    tempRoots.push(tempRoot);

    const homeDir = join(tempRoot, 'home');
    const cwd = join(tempRoot, 'workspace');

    writeFile(join(homeDir, 'agents', 'agent-a', 'skills', 'task-x', 'SKILL.md'));
    writeFile(join(homeDir, 'agents', 'agent-b', 'skills', 'task-y', 'SKILL.md'));

    const result = resolvePaths(cwd, { homeDir, extraPaths: ['~/agents/*/skills'] });
    const customFiles = result.filter((entry) => entry.platform === 'unknown');

    expect(customFiles).toHaveLength(2);
  });
});
