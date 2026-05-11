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
});