import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { tmpdir } from 'node:os';

import { afterEach, beforeAll, describe, expect, it } from 'vitest';

const tempRoots: string[] = [];
const cliEntry = resolve(process.cwd(), 'dist', 'index.cjs');

function createTempRoot(): string {
  const root = mkdtempSync(join(tmpdir(), 'skill-doctor-cli-'));
  tempRoots.push(root);
  return root;
}

function writeFile(filePath: string, content: string): void {
  mkdirSync(dirname(filePath), { recursive: true });
  writeFileSync(filePath, content, 'utf8');
}

function runCli(args: string[], cwd: string, homeDir: string) {
  return spawnSync(process.execPath, [cliEntry, ...args], {
    cwd,
    env: {
      ...process.env,
      HOME: homeDir,
      USERPROFILE: homeDir,
    },
    encoding: 'utf8',
  });
}

beforeAll(() => {
  const build = spawnSync('npm', ['run', 'build'], {
    cwd: process.cwd(),
    encoding: 'utf8',
    shell: true,
  });

  if (build.status !== 0) {
    throw new Error(build.stderr || build.stdout || 'build failed');
  }
});

afterEach(() => {
  for (const root of tempRoots) {
    rmSync(root, { recursive: true, force: true });
  }

  tempRoots.length = 0;
});

describe('CLI integration', () => {
  it('scan finds workspace skills from a controlled project directory', () => {
    const root = createTempRoot();
    const cwd = join(root, 'workspace');
    const home = join(root, 'home');

    writeFile(
      join(cwd, '.claude', 'skills', 'karpathy-guidelines', 'SKILL.md'),
      ['---', 'name: karpathy-guidelines', 'description: avoid overengineering', '---', '', '# Karpathy Guidelines'].join('\n'),
    );

    const result = runCli(['scan'], cwd, home);

    expect(result.status).toBe(0);
    expect(result.stdout).toContain('Total skills installed: 1');
    expect(result.stdout).toContain('claude');
  });

  it('show prints the details of an existing skill and fails for a missing one', () => {
    const root = createTempRoot();
    const cwd = join(root, 'workspace');
    const home = join(root, 'home');

    writeFile(
      join(cwd, '.claude', 'skills', 'karpathy-guidelines', 'SKILL.md'),
      ['---', 'name: karpathy-guidelines', 'description: avoid overengineering', '---', '', '# Karpathy Guidelines'].join('\n'),
    );

    const existing = runCli(['show', 'karpathy-guidelines'], cwd, home);
    const missing = runCli(['show', 'missing-skill'], cwd, home);

    expect(existing.status).toBe(0);
    expect(existing.stdout).toContain('SKILL: karpathy-guidelines');
    expect(missing.status).toBe(1);
    expect(missing.stderr).toContain('Skill not found: missing-skill');
  });

  it('scan --json returns structured output for downstream tooling', () => {
    const root = createTempRoot();
    const cwd = join(root, 'workspace');
    const home = join(root, 'home');

    writeFile(
      join(cwd, '.claude', 'skills', 'karpathy-guidelines', 'SKILL.md'),
      ['---', 'name: karpathy-guidelines', 'description: avoid overengineering', '---', '', '# Karpathy Guidelines'].join('\n'),
    );

    const result = runCli(['scan', '--json'], cwd, home);
    const payload = JSON.parse(result.stdout);

    expect(result.status).toBe(0);
    expect(payload.summary.totalSkillsInstalled).toBe(1);
    expect(payload.summary.duplicatesDetected).toBe(0);
    expect(payload.summary.conflictsDetected).toBe(0);
    expect(payload.summary.scopes).toEqual({ project: 1 });
    expect(payload.summary.platformsByScope).toEqual({ project: { claude: 1 } });
    expect(payload.skills).toHaveLength(1);
    expect(payload.skills[0].name).toBe('karpathy-guidelines');
  });

  it('scan --json includes scope buckets when both global and project skills exist', () => {
    const root = createTempRoot();
    const cwd = join(root, 'workspace');
    const home = join(root, 'home');

    writeFile(
      join(cwd, '.claude', 'skills', 'project-skill', 'SKILL.md'),
      ['---', 'name: project-skill', 'description: project scope skill', '---', '', '# Project Skill'].join('\n'),
    );
    writeFile(
      join(home, '.claude', 'skills', 'global-skill', 'SKILL.md'),
      ['---', 'name: global-skill', 'description: global scope skill', '---', '', '# Global Skill'].join('\n'),
    );

    const result = runCli(['scan', '--json'], cwd, home);
    const payload = JSON.parse(result.stdout);

    expect(result.status).toBe(0);
    expect(payload.summary.scopes).toEqual({ global: 1, project: 1 });
    expect(payload.summary.platformsByScope).toEqual({
      global: { claude: 1 },
      project: { claude: 1 },
    });
  });

  it('show --json returns a single structured skill record', () => {
    const root = createTempRoot();
    const cwd = join(root, 'workspace');
    const home = join(root, 'home');

    writeFile(
      join(cwd, '.claude', 'skills', 'karpathy-guidelines', 'SKILL.md'),
      ['---', 'name: karpathy-guidelines', 'description: avoid overengineering', '---', '', '# Karpathy Guidelines'].join('\n'),
    );

    const result = runCli(['show', 'karpathy-guidelines', '--json'], cwd, home);
    const payload = JSON.parse(result.stdout);

    expect(result.status).toBe(0);
    expect(payload.name).toBe('karpathy-guidelines');
    expect(payload.platform).toBe('claude');
    expect(payload.scope).toBe('project');
  });

  it('conflicts --fail-on high exits with code 1 when a high conflict exists', () => {
    const root = createTempRoot();
    const cwd = join(root, 'workspace');
    const home = join(root, 'home');

    writeFile(
      join(cwd, '.claude', 'skills', 'git-workflow', 'SKILL.md'),
      ['---', 'name: git-workflow', 'description: manage git workflow, branches, commits, and pull requests', '---', '', '# Git Workflow', '', '## When to Use', '', '- create branch', '- write commit message', '- open pull request'].join('\n'),
    );
    writeFile(
      join(cwd, '.claude', 'skills', 'github-automation', 'SKILL.md'),
      ['---', 'name: github-automation', 'description: automate git workflow, branch creation, commit messages, and pull request handling', '---', '', '# GitHub Automation', '', '## When to Use', '', '- create branch', '- write commit message', '- open pull request'].join('\n'),
    );

    const result = runCli(['conflicts', '--fail-on', 'high'], cwd, home);

    expect(result.status).toBe(1);
    expect(result.stdout).toContain('git-workflow <-> github-automation');
    expect(result.stdout).toContain('severity: high');
  });

  it('scan --scope project excludes global skills from the summary', () => {
    const root = createTempRoot();
    const cwd = join(root, 'workspace');
    const home = join(root, 'home');

    writeFile(
      join(cwd, '.claude', 'skills', 'project-skill', 'SKILL.md'),
      ['---', 'name: project-skill', 'description: project scope skill', '---', '', '# Project Skill'].join('\n'),
    );
    writeFile(
      join(home, '.claude', 'skills', 'global-skill', 'SKILL.md'),
      ['---', 'name: global-skill', 'description: global scope skill', '---', '', '# Global Skill'].join('\n'),
    );

    const result = runCli(['scan', '--scope', 'project'], cwd, home);

    expect(result.status).toBe(0);
    expect(result.stdout).toContain('Total skills installed: 1');
    expect(result.stdout).not.toContain('Total skills installed: 2');
  });

  it('conflicts --scope project ignores duplicates split across global and project scope', () => {
    const root = createTempRoot();
    const cwd = join(root, 'workspace');
    const home = join(root, 'home');

    writeFile(
      join(cwd, '.claude', 'skills', 'shared-skill', 'SKILL.md'),
      ['---', 'name: shared-skill', 'description: project copy', '---', '', '# Shared Skill'].join('\n'),
    );
    writeFile(
      join(home, '.claude', 'skills', 'shared-skill', 'SKILL.md'),
      ['---', 'name: shared-skill', 'description: global copy', '---', '', '# Shared Skill'].join('\n'),
    );

    const result = runCli(['conflicts', '--scope', 'project'], cwd, home);

    expect(result.status).toBe(0);
    expect(result.stdout).toContain('No conflicts found.');
  });

  it('conflicts --json returns duplicates and conflicts in separate arrays', () => {
    const root = createTempRoot();
    const cwd = join(root, 'workspace');
    const home = join(root, 'home');

    writeFile(
      join(cwd, '.claude', 'skills', 'git-workflow', 'SKILL.md'),
      ['---', 'name: git-workflow', 'description: manage git workflow, branches, commits, and pull requests', '---', '', '# Git Workflow', '', '## When to Use', '', '- create branch', '- write commit message', '- open pull request'].join('\n'),
    );
    writeFile(
      join(cwd, '.claude', 'skills', 'github-automation', 'SKILL.md'),
      ['---', 'name: github-automation', 'description: automate git workflow, branch creation, commit messages, and pull request handling', '---', '', '# GitHub Automation', '', '## When to Use', '', '- create branch', '- write commit message', '- open pull request'].join('\n'),
    );
    writeFile(
      join(home, '.claude', 'skills', 'git-workflow', 'SKILL.md'),
      ['---', 'name: git-workflow', 'description: global duplicate copy', '---', '', '# Git Workflow'].join('\n'),
    );

    const result = runCli(['conflicts', '--json'], cwd, home);
    const payload = JSON.parse(result.stdout);

    expect(result.status).toBe(0);
    expect(payload.duplicates).toHaveLength(1);
    expect(payload.conflicts).toHaveLength(1);
    expect(payload.duplicates[0].kind).toBe('duplicate');
    expect(payload.conflicts[0].kind).toBe('conflict');
  });

  it('conflicts --kind duplicate only returns duplicate pairs', () => {
    const root = createTempRoot();
    const cwd = join(root, 'workspace');
    const home = join(root, 'home');

    writeFile(
      join(cwd, '.claude', 'skills', 'git-workflow', 'SKILL.md'),
      ['---', 'name: git-workflow', 'description: manage git workflow, branches, commits, and pull requests', '---', '', '# Git Workflow', '', '## When to Use', '', '- create branch', '- write commit message', '- open pull request'].join('\n'),
    );
    writeFile(
      join(cwd, '.claude', 'skills', 'github-automation', 'SKILL.md'),
      ['---', 'name: github-automation', 'description: automate git workflow, branch creation, commit messages, and pull request handling', '---', '', '# GitHub Automation', '', '## When to Use', '', '- create branch', '- write commit message', '- open pull request'].join('\n'),
    );
    writeFile(
      join(home, '.claude', 'skills', 'git-workflow', 'SKILL.md'),
      ['---', 'name: git-workflow', 'description: global duplicate copy', '---', '', '# Git Workflow'].join('\n'),
    );

    const result = runCli(['conflicts', '--kind', 'duplicate'], cwd, home);

    expect(result.status).toBe(0);
    expect(result.stdout).toContain('DUPLICATES');
    expect(result.stdout).not.toContain('CONFLICTS');
    expect(result.stdout).not.toContain('github-automation');
  });

  it('conflicts --json --kind conflict only returns semantic conflicts', () => {
    const root = createTempRoot();
    const cwd = join(root, 'workspace');
    const home = join(root, 'home');

    writeFile(
      join(cwd, '.claude', 'skills', 'git-workflow', 'SKILL.md'),
      ['---', 'name: git-workflow', 'description: manage git workflow, branches, commits, and pull requests', '---', '', '# Git Workflow', '', '## When to Use', '', '- create branch', '- write commit message', '- open pull request'].join('\n'),
    );
    writeFile(
      join(cwd, '.claude', 'skills', 'github-automation', 'SKILL.md'),
      ['---', 'name: github-automation', 'description: automate git workflow, branch creation, commit messages, and pull request handling', '---', '', '# GitHub Automation', '', '## When to Use', '', '- create branch', '- write commit message', '- open pull request'].join('\n'),
    );
    writeFile(
      join(home, '.claude', 'skills', 'git-workflow', 'SKILL.md'),
      ['---', 'name: git-workflow', 'description: global duplicate copy', '---', '', '# Git Workflow'].join('\n'),
    );

    const result = runCli(['conflicts', '--json', '--kind', 'conflict'], cwd, home);
    const payload = JSON.parse(result.stdout);

    expect(result.status).toBe(0);
    expect(payload.duplicates).toHaveLength(0);
    expect(payload.conflicts).toHaveLength(1);
    expect(payload.conflicts[0].kind).toBe('conflict');
  });

  it('conflicts --limit 1 keeps only the highest-priority pair', () => {
    const root = createTempRoot();
    const cwd = join(root, 'workspace');
    const home = join(root, 'home');

    writeFile(
      join(cwd, '.claude', 'skills', 'git-workflow', 'SKILL.md'),
      ['---', 'name: git-workflow', 'description: manage git workflow, branches, commits, and pull requests', '---', '', '# Git Workflow', '', '## When to Use', '', '- create branch', '- write commit message', '- open pull request'].join('\n'),
    );
    writeFile(
      join(cwd, '.claude', 'skills', 'github-automation', 'SKILL.md'),
      ['---', 'name: github-automation', 'description: automate git workflow, branch creation, commit messages, and pull request handling', '---', '', '# GitHub Automation', '', '## When to Use', '', '- create branch', '- write commit message', '- open pull request'].join('\n'),
    );
    writeFile(
      join(home, '.claude', 'skills', 'git-workflow', 'SKILL.md'),
      ['---', 'name: git-workflow', 'description: global duplicate copy', '---', '', '# Git Workflow'].join('\n'),
    );

    const result = runCli(['conflicts', '--limit', '1'], cwd, home);

    expect(result.status).toBe(0);
    expect(result.stdout).toContain('DUPLICATES');
    expect(result.stdout).toContain('git-workflow');
    expect(result.stdout).not.toContain('github-automation');
    expect(result.stdout).not.toContain('CONFLICTS\n\n');
  });

  it('conflicts --json --limit 1 returns only the top-ranked pair', () => {
    const root = createTempRoot();
    const cwd = join(root, 'workspace');
    const home = join(root, 'home');

    writeFile(
      join(cwd, '.claude', 'skills', 'git-workflow', 'SKILL.md'),
      ['---', 'name: git-workflow', 'description: manage git workflow, branches, commits, and pull requests', '---', '', '# Git Workflow', '', '## When to Use', '', '- create branch', '- write commit message', '- open pull request'].join('\n'),
    );
    writeFile(
      join(cwd, '.claude', 'skills', 'github-automation', 'SKILL.md'),
      ['---', 'name: github-automation', 'description: automate git workflow, branch creation, commit messages, and pull request handling', '---', '', '# GitHub Automation', '', '## When to Use', '', '- create branch', '- write commit message', '- open pull request'].join('\n'),
    );
    writeFile(
      join(home, '.claude', 'skills', 'git-workflow', 'SKILL.md'),
      ['---', 'name: git-workflow', 'description: global duplicate copy', '---', '', '# Git Workflow'].join('\n'),
    );

    const result = runCli(['conflicts', '--json', '--limit', '1'], cwd, home);
    const payload = JSON.parse(result.stdout);

    expect(result.status).toBe(0);
    expect(payload.duplicates).toHaveLength(1);
    expect(payload.conflicts).toHaveLength(0);
    expect(payload.duplicates[0].kind).toBe('duplicate');
  });
});