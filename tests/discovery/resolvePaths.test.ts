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

    const result = resolvePaths(cwd, { homeDir });
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

    const result = resolvePaths(cwd, { homeDir });
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

  it('returns AGENTS.md once for codex and once for opencode', () => {
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

  it('does not recursively ingest arbitrary markdown from the codex home directory', () => {
    const tempRoot = createTempRoot();
    tempRoots.push(tempRoot);

    const homeDir = join(tempRoot, 'home');
    const cwd = join(tempRoot, 'workspace');

    writeFile(join(homeDir, '.codex', 'AGENTS.md'));
    writeFile(join(homeDir, '.codex', 'notes', 'reference.md'));
    writeFile(join(homeDir, '.codex', 'examples', 'workflow.md'));

    const result = resolvePaths(cwd, { homeDir });
    const codexFiles = result.filter((entry) => entry.platform === 'codex');

    expect(codexFiles).toHaveLength(1);
    expect(codexFiles[0]?.filePath).toContain(join('.codex', 'AGENTS.md'));
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
});