import { mkdirSync } from 'node:fs';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { join } from 'node:path';

import { afterEach, beforeAll, describe, expect, it } from 'vitest';

import { buildCli, cleanupTempRoots, createTempRoot, runCli, runCliAsync, writeFile } from '../helpers/cliHarness';

beforeAll(() => {
  buildCli();
}, 30000);

afterEach(() => {
  cleanupTempRoots();
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

  it('scan --json accepts explicit token strategy flags', () => {
    const root = createTempRoot();
    const cwd = join(root, 'workspace');
    const home = join(root, 'home');

    writeFile(
      join(cwd, '.claude', 'skills', 'karpathy-guidelines', 'SKILL.md'),
      ['---', 'name: karpathy-guidelines', 'description: avoid overengineering', '---', '', '# Karpathy Guidelines'].join('\n'),
    );

    const result = runCli(
      ['scan', '--strategy', 'token', '--threshold', '0.8', '--embedding-model', 'local-model', '--json'],
      cwd,
      home,
    );
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
    expect(payload.duplicates[0].detectionMethod).toBe('duplicate-name');
    expect(payload.conflicts[0].kind).toBe('conflict');
    expect(payload.conflicts[0].detectionMethod).toBe('token');
  });

  it('conflicts --json includes suggestions array for duplicate pairs', () => {
    const root = createTempRoot();
    const cwd = join(root, 'workspace');
    const home = join(root, 'home');

    writeFile(
      join(cwd, '.claude', 'skills', 'git-workflow', 'SKILL.md'),
      ['---', 'name: git-workflow', 'description: manage git workflow and branches', '---'].join('\n'),
    );
    writeFile(
      join(home, '.claude', 'skills', 'git-workflow', 'SKILL.md'),
      ['---', 'name: git-workflow', 'description: global duplicate copy', '---'].join('\n'),
    );

    const result = runCli(['conflicts', '--json', '--kind', 'duplicate'], cwd, home);
    const payload = JSON.parse(result.stdout);

    expect(result.status).toBe(0);
    expect(payload.duplicates).toHaveLength(1);
    expect(Array.isArray(payload.suggestions)).toBe(true);
    expect(payload.suggestions).toHaveLength(1);
    expect(payload.suggestions[0].skillName).toBe('git-workflow');
    expect(typeof payload.suggestions[0].keepPath).toBe('string');
    expect(typeof payload.suggestions[0].removePath).toBe('string');
    expect(payload.suggestions[0].keepReason).toMatch(/newer \(modified \d{4}-\d{2}-\d{2}\)/);
  });

  it('conflicts plain-text output includes SUGGESTIONS section for duplicate pairs', () => {
    const root = createTempRoot();
    const cwd = join(root, 'workspace');
    const home = join(root, 'home');

    writeFile(
      join(cwd, '.claude', 'skills', 'git-workflow', 'SKILL.md'),
      ['---', 'name: git-workflow', 'description: manage git workflow and branches', '---'].join('\n'),
    );
    writeFile(
      join(home, '.claude', 'skills', 'git-workflow', 'SKILL.md'),
      ['---', 'name: git-workflow', 'description: global duplicate copy', '---'].join('\n'),
    );

    const result = runCli(['conflicts', '--kind', 'duplicate'], cwd, home);

    expect(result.status).toBe(0);
    expect(result.stdout).toContain('SUGGESTIONS');
    expect(result.stdout).toContain('consider removing:');
    expect(result.stdout).toContain('newer (modified');
  });

  it('conflicts --json accepts explicit token strategy flags', () => {
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

    const result = runCli(
      ['conflicts', '--json', '--strategy', 'token', '--threshold', '0.8', '--embedding-model', 'local-model'],
      cwd,
      home,
    );
    const payload = JSON.parse(result.stdout);

    expect(result.status).toBe(0);
    expect(payload.conflicts).toHaveLength(1);
    expect(payload.conflicts[0].detectionMethod).toBe('token');
  });

  it('conflicts --strategy embedding reads user config and calls a local embedding API', async () => {
    const root = createTempRoot();
    const cwd = join(root, 'workspace');
    const home = join(root, 'home');
    let receivedAuthorization = '';
    let receivedModel = '';

    const server = createServer((request, response) => {
      let body = '';
      request.setEncoding('utf8');
      request.on('data', (chunk) => {
        body += chunk;
      });
      request.on('end', () => {
        receivedAuthorization = request.headers.authorization ?? '';
        const payload = JSON.parse(body) as { model: string; input: string };
        receivedModel = payload.model;
        const embedding = payload.input.startsWith('Release Workflow') ? [1, 0] : [0.99, 0.01];

        response.writeHead(200, {
          'content-type': 'application/json',
          connection: 'close',
        });
        response.end(JSON.stringify({ data: [{ embedding, index: 0 }], model: payload.model }));
      });
    });

    try {
      const port = await new Promise<number>((resolve) => {
        server.listen(0, '127.0.0.1', () => {
          resolve((server.address() as AddressInfo).port);
        });
      });

      writeFile(
        join(home, '.skill-doctor', 'config.json'),
        JSON.stringify(
          {
            embedding: {
              baseUrl: `http://127.0.0.1:${port}/v1`,
              model: 'bge-m3',
              apiKey: '111111',
            },
          },
          null,
          2,
        ),
      );
      writeFile(
        join(cwd, '.claude', 'skills', 'release-workflow', 'SKILL.md'),
        ['---', 'name: Release Workflow', 'description: prepare release planning and commit summary', '---', '', '# Release Workflow', '', '## When to Use', '', '- open release branch'].join('\n'),
      );
      writeFile(
        join(cwd, '.claude', 'skills', 'deploy-workflow', 'SKILL.md'),
        ['---', 'name: Deploy Workflow', 'description: coordinate release planning and commit summary', '---', '', '# Deploy Workflow', '', '## When to Use', '', '- open release branch'].join('\n'),
      );

      const result = await runCliAsync(
        ['conflicts', '--strategy', 'embedding', '--threshold', '0.8', '--json'],
        cwd,
        home,
      );

      expect(result.status).toBe(0);
      expect(result.stderr).toBe('');

      const payload = JSON.parse(result.stdout);

      expect(payload.conflicts).toHaveLength(1);
      expect(payload.conflicts[0].detectionMethod).toBe('embedding');
      expect(receivedAuthorization).toBe('Bearer 111111');
      expect(receivedModel).toBe('bge-m3');
    } finally {
      server.closeAllConnections();
      await new Promise<void>((resolve, reject) => {
        server.close((error) => {
          if (error) {
            reject(error);
            return;
          }
          resolve();
        });
      });
    }
  });

  it('conflicts --strategy embedding reports missing user config', () => {
    const root = createTempRoot();
    const cwd = join(root, 'workspace');
    const home = join(root, 'home');

    mkdirSync(cwd, { recursive: true });

    const result = runCli(['conflicts', '--strategy', 'embedding'], cwd, home);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('Embedding config is incomplete. Set embedding.baseUrl and embedding.model');
  });

  it('conflicts rejects invalid strategy values', () => {
    const root = createTempRoot();
    const cwd = join(root, 'workspace');
    const home = join(root, 'home');

    mkdirSync(cwd, { recursive: true });

    const result = runCli(['conflicts', '--strategy', 'invalid'], cwd, home);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('Invalid strategy. Use --strategy token|embedding');
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

  it('conflicts respects ignore.skillNames from config.json', () => {
    const root = createTempRoot();
    const cwd = join(root, 'workspace');
    const home = join(root, 'home');

    writeFile(
      join(cwd, '.claude', 'skills', 'git-workflow', 'SKILL.md'),
      ['---', 'name: git-workflow', 'description: manage git workflow and branches', '---'].join('\n'),
    );
    writeFile(
      join(home, '.claude', 'skills', 'git-workflow', 'SKILL.md'),
      ['---', 'name: git-workflow', 'description: global duplicate copy', '---'].join('\n'),
    );
    writeFile(
      join(home, '.skill-doctor', 'config.json'),
      JSON.stringify({ ignore: { skillNames: ['git-workflow'] } }),
    );

    const result = runCli(['conflicts', '--json'], cwd, home);
    const payload = JSON.parse(result.stdout);

    expect(result.status).toBe(0);
    expect(payload.duplicates).toHaveLength(0);
    expect(payload.conflicts).toHaveLength(0);
  });
});

describe('CLI integration — audit', () => {
  it('audit returns zero findings for a safe skill', () => {
    const root = createTempRoot();
    const cwd = join(root, 'workspace');
    const home = join(root, 'home');

    writeFile(
      join(cwd, '.claude', 'skills', 'safe-skill', 'SKILL.md'),
      ['---', 'name: safe-skill', 'description: helps with code review and documentation', '---'].join('\n'),
    );

    const result = runCli(['audit'], cwd, home);

    expect(result.status).toBe(0);
    expect(result.stdout).toContain('1 skill scanned');
    expect(result.stdout).toContain('No findings.');
  });

  it('audit detects shell-exec in a skill description', () => {
    const root = createTempRoot();
    const cwd = join(root, 'workspace');
    const home = join(root, 'home');

    writeFile(
      join(cwd, '.claude', 'skills', 'dangerous', 'SKILL.md'),
      ['---', 'name: dangerous', 'description: run the command to deploy the app', '---'].join('\n'),
    );

    const result = runCli(['audit'], cwd, home);

    expect(result.status).toBe(0);
    expect(result.stdout).toContain('shell-exec');
    expect(result.stdout).toContain('HIGH');
  });

  it('audit --fail-on high exits 1 when a high finding exists', () => {
    const root = createTempRoot();
    const cwd = join(root, 'workspace');
    const home = join(root, 'home');

    writeFile(
      join(cwd, '.claude', 'skills', 'risky', 'SKILL.md'),
      ['---', 'name: risky', 'description: run the command bash -c to deploy', '---'].join('\n'),
    );

    const result = runCli(['audit', '--fail-on', 'high'], cwd, home);

    expect(result.status).toBe(1);
  });

  it('audit --fail-on high exits 0 when only low findings exist', () => {
    const root = createTempRoot();
    const cwd = join(root, 'workspace');
    const home = join(root, 'home');

    writeFile(
      join(cwd, '.claude', 'skills', 'low-risk', 'SKILL.md'),
      ['---', 'name: low-risk', 'description: trigger the webhook endpoint after each commit', '---'].join('\n'),
    );

    const result = runCli(['audit', '--fail-on', 'high'], cwd, home);

    expect(result.status).toBe(0);
    expect(result.stdout).toContain('network-call');
  });

  it('audit --severity high only shows high findings', () => {
    const root = createTempRoot();
    const cwd = join(root, 'workspace');
    const home = join(root, 'home');

    writeFile(
      join(cwd, '.claude', 'skills', 'mixed', 'SKILL.md'),
      ['---', 'name: mixed', 'description: run the bash command and trigger the webhook endpoint', '---'].join('\n'),
    );

    const result = runCli(['audit', '--severity', 'high'], cwd, home);

    expect(result.status).toBe(0);
    expect(result.stdout).toContain('shell-exec');
    expect(result.stdout).not.toContain('network-call');
  });

  it('audit --json returns AuditResult schema', () => {
    const root = createTempRoot();
    const cwd = join(root, 'workspace');
    const home = join(root, 'home');

    writeFile(
      join(cwd, '.claude', 'skills', 'risky', 'SKILL.md'),
      ['---', 'name: risky', 'description: run the command to clean up then rm -rf the temp folder', '---'].join('\n'),
    );

    const result = runCli(['audit', '--json'], cwd, home);
    const payload = JSON.parse(result.stdout);

    expect(result.status).toBe(0);
    expect(typeof payload.scanned).toBe('number');
    expect(Array.isArray(payload.findings)).toBe(true);
    expect(payload.summary).toHaveProperty('high');
    expect(payload.summary).toHaveProperty('med');
    expect(payload.summary).toHaveProperty('low');
    expect(payload.findings[0]).toHaveProperty('ruleId');
    expect(payload.findings[0]).toHaveProperty('severity');
    expect(payload.findings[0]).toHaveProperty('matchedText');
  });

  it('audit suppresses findings for skills in ignore.skillNames', () => {
    const root = createTempRoot();
    const cwd = join(root, 'workspace');
    const home = join(root, 'home');

    writeFile(
      join(cwd, '.claude', 'skills', 'risky-helper', 'SKILL.md'),
      ['---', 'name: risky-helper', 'description: run the command to deploy using rm -rf dist', '---'].join('\n'),
    );
    writeFile(
      join(home, '.skill-doctor', 'config.json'),
      JSON.stringify({ ignore: { skillNames: ['risky-helper'] } }),
    );

    const result = runCli(['audit', '--scope', 'project', '--json'], cwd, home);
    const payload = JSON.parse(result.stdout);

    expect(result.status).toBe(0);
    expect(payload.findings.filter((f: { skillName: string }) => f.skillName === 'risky-helper')).toHaveLength(0);
  });
});

describe('CLI integration — F4 explanation', () => {
  it('show includes WHEN TO USE section with triggers', () => {
    const root = createTempRoot();
    const cwd = join(root, 'workspace');
    const home = join(root, 'home');

    writeFile(
      join(cwd, '.claude', 'skills', 'git-workflow', 'SKILL.md'),
      ['---', 'name: git-workflow', 'description: manage git workflow and pull requests', '---', '', '## When to Use', '', '- create branch', '- open pull request'].join('\n'),
    );

    const result = runCli(['show', 'git-workflow'], cwd, home);

    expect(result.status).toBe(0);
    expect(result.stdout).toContain('WHEN TO USE');
    expect(result.stdout).toContain('create branch');
  });

  it('show --json includes relatedSkills array', () => {
    const root = createTempRoot();
    const cwd = join(root, 'workspace');
    const home = join(root, 'home');

    writeFile(
      join(cwd, '.claude', 'skills', 'git-workflow', 'SKILL.md'),
      ['---', 'name: git-workflow', 'description: manage git branches and pull requests', '---'].join('\n'),
    );

    const result = runCli(['show', 'git-workflow', '--json'], cwd, home);
    const payload = JSON.parse(result.stdout);

    expect(result.status).toBe(0);
    expect(Array.isArray(payload.relatedSkills)).toBe(true);
  });

  it('scan --group groups skills into clusters', () => {
    const root = createTempRoot();
    const cwd = join(root, 'workspace');
    const home = join(root, 'home');

    writeFile(
      join(cwd, '.claude', 'skills', 'git-workflow', 'SKILL.md'),
      ['---', 'name: git-workflow', 'description: manage git branches and pull requests', '---', '', '## When to Use', '', '- create branch', '- open pull request'].join('\n'),
    );
    writeFile(
      join(cwd, '.claude', 'skills', 'github-automation', 'SKILL.md'),
      ['---', 'name: github-automation', 'description: automate git branches and pull requests', '---', '', '## When to Use', '', '- create branch', '- open pull request'].join('\n'),
    );

    const result = runCli(['scan', '--group'], cwd, home);

    expect(result.status).toBe(0);
    expect(result.stdout).toContain('Skill Groups');
    expect(result.stdout).toContain('git-workflow');
    expect(result.stdout).toContain('github-automation');
  });

  it('scan --group --json returns groups and ungrouped arrays', () => {
    const root = createTempRoot();
    const cwd = join(root, 'workspace');
    const home = join(root, 'home');

    writeFile(
      join(cwd, '.claude', 'skills', 'git-workflow', 'SKILL.md'),
      ['---', 'name: git-workflow', 'description: manage git branches and pull requests', '---'].join('\n'),
    );
    writeFile(
      join(cwd, '.claude', 'skills', 'cooking-tips', 'SKILL.md'),
      ['---', 'name: cooking-tips', 'description: how to cook pasta and make sauces', '---'].join('\n'),
    );

    const result = runCli(['scan', '--group', '--json'], cwd, home);
    const payload = JSON.parse(result.stdout);

    expect(result.status).toBe(0);
    expect(Array.isArray(payload.groups)).toBe(true);
    expect(Array.isArray(payload.ungrouped)).toBe(true);
  });
});