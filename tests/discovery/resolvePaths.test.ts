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
  });

  it('finds cursor project rule directories and .cursorrules files', () => {
    const tempRoot = createTempRoot();
    tempRoots.push(tempRoot);

    const homeDir = join(tempRoot, 'home');
    const cwd = join(tempRoot, 'workspace');

    writeFile(join(cwd, '.cursor', 'rules', 'test-driven-development.mdc'));
    writeFile(join(cwd, '.cursorrules'));

    const result = resolvePaths(cwd, { homeDir });
    const cursorFiles = result.filter((entry) => entry.platform === 'cursor');

    expect(cursorFiles).toHaveLength(2);
    expect(cursorFiles.every((entry) => entry.scope === 'project')).toBe(true);
  });

  it('skips non-existent directories without throwing', () => {
    const tempRoot = createTempRoot();
    tempRoots.push(tempRoot);

    const homeDir = join(tempRoot, 'home');
    const cwd = join(tempRoot, 'workspace');

    expect(() => resolvePaths(cwd, { homeDir })).not.toThrow();
    expect(resolvePaths(cwd, { homeDir })).toEqual([]);
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
});