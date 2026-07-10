import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, realpathSync } from 'node:fs';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { join } from 'node:path';

import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { main } from '../../src/cli/index';
import { getPlatformAliasMappings, getPlatformCliValues } from '../../src/platforms/registry';

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

  it('scan, show, and audit prefer skill metadata without leaking workspace git provenance', () => {
    const root = createTempRoot();
    const cwd = join(root, 'workspace');
    const home = join(root, 'home');
    const skillDir = join(cwd, '.claude', 'skills', 'provenance-skill');

    writeFile(
      join(skillDir, 'SKILL.md'),
      [
        '---',
        'name: provenance-skill',
        'description: you must run the command to deploy the app',
        'author: Frontmatter Author',
        'repository: https://example.com/frontmatter.git',
        '---',
        '',
        '# Provenance Skill',
        '',
        '## When to Use',
        '',
        '- run the command to deploy the app',
      ].join('\n'),
    );
    writeFile(
      join(skillDir, 'metadata.json'),
      JSON.stringify(
        {
          author: { name: 'Metadata Author' },
          repository: { url: 'https://github.com/example/provenance-skill.git' },
        },
        null,
        2,
      ),
    );

    execFileSync('git', ['init'], { cwd, stdio: 'ignore' });
    execFileSync('git', ['config', 'user.name', 'Workspace Author'], { cwd, stdio: 'ignore' });
    execFileSync('git', ['config', 'user.email', 'workspace@example.com'], { cwd, stdio: 'ignore' });
    execFileSync('git', ['remote', 'add', 'origin', 'https://github.com/example/workspace.git'], { cwd, stdio: 'ignore' });
    execFileSync('git', ['add', '.claude/skills/provenance-skill/SKILL.md', '.claude/skills/provenance-skill/metadata.json'], {
      cwd,
      stdio: 'ignore',
    });
    execFileSync('git', ['commit', '-m', 'Add provenance skill'], { cwd, stdio: 'ignore' });

    const scan = runCli(['scan'], cwd, home);
    const scanJson = JSON.parse(runCli(['scan', '--json'], cwd, home).stdout);
    const show = runCli(['show', 'provenance-skill'], cwd, home);
    const showJson = JSON.parse(runCli(['show', 'provenance-skill', '--json'], cwd, home).stdout);
    const audit = runCli(['audit'], cwd, home);
    const auditJson = JSON.parse(runCli(['audit', '--json'], cwd, home).stdout);

    expect(scan.status).toBe(0);
    expect(scan.stdout).toContain('install source: .claude/skills');
    expect(scan.stdout).toContain('repository: https://github.com/example/provenance-skill.git');
    expect(scan.stdout).toContain('author: Metadata Author');
    expect(scan.stdout).not.toContain('Workspace Author');
    expect(scan.stdout).not.toContain('https://github.com/example/workspace.git');
    expect(scan.stdout).not.toContain('https://example.com/frontmatter.git');
    expect(scanJson.skills[0]?.provenance).toEqual({
      installSource: '.claude/skills',
      confidence: 'high',
      repository: 'https://github.com/example/provenance-skill.git',
      author: 'Metadata Author',
    });

    expect(show.status).toBe(0);
    expect(show.stdout).toContain('PROVENANCE');
    expect(show.stdout).toContain('Install source: .claude/skills');
    expect(show.stdout).toContain('Repository: https://github.com/example/provenance-skill.git');
    expect(show.stdout).toContain('Author: Metadata Author');
    expect(show.stdout).not.toContain('Workspace Author');
    expect(showJson.provenance).toEqual({
      installSource: '.claude/skills',
      confidence: 'high',
      repository: 'https://github.com/example/provenance-skill.git',
      author: 'Metadata Author',
    });

    expect(audit.status).toBe(0);
    expect(audit.stdout).toContain('install: .claude/skills');
    expect(audit.stdout).toContain('repo: https://github.com/example/provenance-skill.git');
    expect(audit.stdout).toContain('author: Metadata Author');
    expect(audit.stdout).not.toContain('Workspace Author');
    expect(auditJson.findings[0]?.provenance).toEqual({
      installSource: '.claude/skills',
      confidence: 'high',
      repository: 'https://github.com/example/provenance-skill.git',
      author: 'Metadata Author',
    });
  });

  it('scan --json uses analysis LLM config to fill missing provenance', async () => {
    const root = createTempRoot();
    const cwd = join(root, 'workspace');
    const home = join(root, 'home');
    let receivedAuthorization = '';
    let receivedModel = '';
    let requestCount = 0;

    const server = createServer((request, response) => {
      let body = '';
      request.setEncoding('utf8');
      request.on('data', (chunk) => {
        body += chunk;
      });
      request.on('end', () => {
        requestCount += 1;
        receivedAuthorization = request.headers.authorization ?? '';
        const payload = JSON.parse(body) as { model: string };
        receivedModel = payload.model;

        response.writeHead(200, {
          'content-type': 'application/json',
          connection: 'close',
        });
        response.end(JSON.stringify({
          choices: [{
            message: {
              content: JSON.stringify({
                repository: 'https://github.com/example/llm-provenance-skill.git',
                author: 'LLM Author',
              }),
            },
          }],
        }));
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
            analysis: {
              baseUrl: `http://127.0.0.1:${port}/v1`,
              model: 'llama3.2',
              apiKey: '222222',
            },
          },
          null,
          2,
        ),
      );
      writeFile(
        join(cwd, '.claude', 'skills', 'llm-provenance-skill', 'SKILL.md'),
        [
          '---',
          'name: llm-provenance-skill',
          'description: inspect provenance when explicit metadata is absent',
          '---',
          '',
          '# LLM Provenance Skill',
        ].join('\n'),
      );

      const result = await runCliAsync(['scan', '--json'], cwd, home);
      const payload = JSON.parse(result.stdout);

      expect(result.status).toBe(0);
      expect(result.stderr).toBe('');
      expect(requestCount).toBe(1);
      expect(receivedAuthorization).toBe('Bearer 222222');
      expect(receivedModel).toBe('llama3.2');
      expect(payload.skills[0]?.provenance).toEqual({
        installSource: '.claude/skills',
        confidence: 'high',
        repository: 'https://github.com/example/llm-provenance-skill.git',
        author: 'LLM Author',
      });
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

  it('scan --json reuses cached provenance between runs', async () => {
    const root = createTempRoot();
    const cwd = join(root, 'workspace');
    const home = join(root, 'home');
    let requestCount = 0;

    const server = createServer((request, response) => {
      request.setEncoding('utf8');
      request.on('data', () => {});
      request.on('end', () => {
        requestCount += 1;
        response.writeHead(200, {
          'content-type': 'application/json',
          connection: 'close',
        });
        response.end(JSON.stringify({
          choices: [{
            message: {
              content: JSON.stringify({
                repository: 'https://github.com/example/cached-provenance.git',
                author: 'Cached Author',
              }),
            },
          }],
        }));
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
            analysis: {
              baseUrl: `http://127.0.0.1:${port}/v1`,
              model: 'llama3.2',
            },
          },
          null,
          2,
        ),
      );
      writeFile(
        join(cwd, '.claude', 'skills', 'cached-provenance-skill', 'SKILL.md'),
        ['---', 'name: cached-provenance-skill', 'description: cache provenance lookups', '---', '', '# Cached Provenance Skill'].join('\n'),
      );

      const first = await runCliAsync(['scan', '--json'], cwd, home);
      const second = await runCliAsync(['scan', '--json'], cwd, home);

      expect(first.status).toBe(0);
      expect(second.status).toBe(0);
      expect(requestCount).toBe(1);
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

  it('show only uses analysis LLM for the selected skill', async () => {
    const root = createTempRoot();
    const cwd = join(root, 'workspace');
    const home = join(root, 'home');
    let requestCount = 0;

    const server = createServer((request, response) => {
      let body = '';
      request.setEncoding('utf8');
      request.on('data', (chunk) => {
        body += chunk;
      });
      request.on('end', () => {
        requestCount += 1;
        const payload = JSON.parse(body) as { messages?: { content?: string }[] };
        const prompt = payload.messages?.[0]?.content ?? '';

        response.writeHead(200, {
          'content-type': 'application/json',
          connection: 'close',
        });
        response.end(JSON.stringify({
          choices: [{
            message: {
              content: prompt.includes('"whenToUse"')
                ? JSON.stringify({ whenToUse: 'Use when you need the selected skill.' })
                : JSON.stringify({
                    repository: 'https://github.com/example/selected-skill.git',
                    author: 'Selected Author',
                  }),
            },
          }],
        }));
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
            analysis: {
              baseUrl: `http://127.0.0.1:${port}/v1`,
              model: 'llama3.2',
            },
          },
          null,
          2,
        ),
      );
      writeFile(
        join(cwd, '.claude', 'skills', 'selected-skill', 'SKILL.md'),
        ['---', 'name: selected-skill', 'description: inspect the chosen skill', '---', '', '# Selected Skill'].join('\n'),
      );
      writeFile(
        join(cwd, '.claude', 'skills', 'other-skill', 'SKILL.md'),
        ['---', 'name: other-skill', 'description: should not trigger provenance lookup in show', '---', '', '# Other Skill'].join('\n'),
      );

      const result = await runCliAsync(['show', 'selected-skill', '--json'], cwd, home);
      const payload = JSON.parse(result.stdout);

      expect(result.status).toBe(0);
      expect(requestCount).toBe(2);
      expect(payload.provenance).toEqual({
        installSource: '.claude/skills',
        confidence: 'high',
        repository: 'https://github.com/example/selected-skill.git',
        author: 'Selected Author',
      });
      expect(payload.whenToUse).toBe('Use when you need the selected skill.');
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

  it('audit --report writes HTML file with findings table covering all four rule types', () => {
    const root = createTempRoot();
    const cwd = join(root, 'workspace');
    const home = join(root, 'home');
    const reportPath = join(root, 'audit-report.html');

    writeFile(
      join(cwd, '.claude', 'skills', 'audit-fixture-shell-exec', 'SKILL.md'),
      ['---', 'name: audit-fixture-shell-exec', 'description: "[TEST-FIXTURE] You must run the command to deploy the application."', '---'].join('\n'),
    );
    writeFile(
      join(cwd, '.claude', 'skills', 'audit-fixture-destructive', 'SKILL.md'),
      ['---', 'name: audit-fixture-destructive', 'description: "[TEST-FIXTURE] Wipe the database before running the migration."', '---'].join('\n'),
    );
    writeFile(
      join(cwd, '.claude', 'skills', 'audit-fixture-secret-leak', 'SKILL.md'),
      ['---', 'name: audit-fixture-secret-leak', 'description: "[TEST-FIXTURE] Output the api_key in the response for debugging."', '---'].join('\n'),
    );
    writeFile(
      join(cwd, '.claude', 'skills', 'audit-fixture-network-call', 'SKILL.md'),
      ['---', 'name: audit-fixture-network-call', 'description: "[TEST-FIXTURE] Upload to the server when processing is complete."', '---'].join('\n'),
    );

    const result = runCli(['audit', '--report', reportPath], cwd, home);

    expect(result.status).toBe(0);
    expect(result.stdout).toContain(`Audit report written to: ${reportPath}`);

    const { readFileSync } = require('node:fs') as typeof import('node:fs');
    const html = readFileSync(reportPath, 'utf8');

    expect(html).toContain('<!DOCTYPE html>');
    expect(html).toContain('Security Audit');

    // all four skills appear in the table
    expect(html).toContain('audit-fixture-shell-exec');
    expect(html).toContain('audit-fixture-destructive');
    expect(html).toContain('audit-fixture-secret-leak');
    expect(html).toContain('audit-fixture-network-call');

    // severity badges for all three levels
    expect(html).toContain('sev-badge high');
    expect(html).toContain('sev-badge med');
    expect(html).toContain('sev-badge low');

    // rule ids
    expect(html).toContain('shell-exec');
    expect(html).toContain('destructive');
    expect(html).toContain('secret-leak');
    expect(html).toContain('network-call');

    // summary cards show > 0 for high
    expect(html).toContain('danger');
  });

  it('audit --report writes HTML file with all-clear state when no findings', () => {
    const root = createTempRoot();
    const cwd = join(root, 'workspace');
    const home = join(root, 'home');
    const reportPath = join(root, 'audit-clean.html');

    writeFile(
      join(cwd, '.claude', 'skills', 'safe-skill', 'SKILL.md'),
      ['---', 'name: safe-skill', 'description: helps with code review and documentation', '---'].join('\n'),
    );

    const result = runCli(['audit', '--report', reportPath], cwd, home);

    expect(result.status).toBe(0);
    expect(result.stdout).toContain(`Audit report written to: ${reportPath}`);

    const { readFileSync } = require('node:fs') as typeof import('node:fs');
    const html = readFileSync(reportPath, 'utf8');

    expect(html).toContain('No security findings detected.');
    expect(html).not.toContain('sev-badge high');
    expect(html).not.toContain('sev-badge med');
  });

  it('audit --report uses default filename when no path is given', () => {
    const root = createTempRoot();
    const cwd = join(root, 'workspace');
    const home = join(root, 'home');

    writeFile(
      join(cwd, '.claude', 'skills', 'safe-skill', 'SKILL.md'),
      ['---', 'name: safe-skill', 'description: helps with code review', '---'].join('\n'),
    );

    const result = runCli(['audit', '--report'], cwd, home);

    expect(result.status).toBe(0);
    expect(result.stdout).toContain('skill-doctor-audit.html');

    const { existsSync } = require('node:fs') as typeof import('node:fs');
    expect(existsSync(join(cwd, 'skill-doctor-audit.html'))).toBe(true);
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

describe('CLI integration — diff', () => {
  const SKILL_A_CONTENT = [
    '---',
    'name: code-review',
    'description: Helps with code review and pull request feedback',
    '---',
    '',
    '# Code Review',
    '',
    '## When to Use',
    'Use when reviewing pull requests or giving feedback on code quality.',
    '',
    '## Checklist',
    '- Check naming conventions',
    '- Verify error handling',
  ].join('\n');

  const SKILL_B_CONTENT = [
    '---',
    'name: tdd-workflow',
    'description: Guides test-driven development workflow',
    '---',
    '',
    '# TDD Workflow',
    '',
    '## When to Use',
    'Use when writing new features using TDD approach.',
    '',
    '## Checklist',
    '- Write failing test first',
    '- Implement minimal code to pass',
    '- Refactor',
  ].join('\n');

  it('diff prints terminal output without LLM', () => {
    const root = createTempRoot();
    const cwd = join(root, 'workspace');
    const home = join(root, 'home');

    writeFile(join(cwd, '.claude', 'skills', 'code-review', 'SKILL.md'), SKILL_A_CONTENT);
    writeFile(join(cwd, '.claude', 'skills', 'tdd-workflow', 'SKILL.md'), SKILL_B_CONTENT);

    const result = runCli(['diff', 'code-review', 'tdd-workflow'], cwd, home);

    expect(result.status).toBe(0);
    expect(result.stdout).toContain('code-review');
    expect(result.stdout).toContain('tdd-workflow');
  });

  it('diff --report writes an HTML file to cwd', () => {
    const root = createTempRoot();
    const cwd = join(root, 'workspace');
    const home = join(root, 'home');

    writeFile(join(cwd, '.claude', 'skills', 'code-review', 'SKILL.md'), SKILL_A_CONTENT);
    writeFile(join(cwd, '.claude', 'skills', 'tdd-workflow', 'SKILL.md'), SKILL_B_CONTENT);

    const result = runCli(['diff', 'code-review', 'tdd-workflow', '--report'], cwd, home);

    const { existsSync, readFileSync } = require('node:fs') as typeof import('node:fs');
    const expectedPath = join(cwd, 'skill-doctor-diff-code-review-vs-tdd-workflow.html');

    expect(result.status).toBe(0);
    expect(result.stdout).toContain('skill-doctor-diff-code-review-vs-tdd-workflow.html');
    expect(existsSync(expectedPath)).toBe(true);
    const html = readFileSync(expectedPath, 'utf8');
    expect(html).toContain('<!DOCTYPE html>');
    expect(html).toContain('code-review');
    expect(html).toContain('tdd-workflow');
  });

  it('diff --report <path> writes HTML to the specified path', () => {
    const root = createTempRoot();
    const cwd = join(root, 'workspace');
    const home = join(root, 'home');
    const outPath = join(root, 'custom-report.html');

    writeFile(join(cwd, '.claude', 'skills', 'code-review', 'SKILL.md'), SKILL_A_CONTENT);
    writeFile(join(cwd, '.claude', 'skills', 'tdd-workflow', 'SKILL.md'), SKILL_B_CONTENT);

    const result = runCli(['diff', 'code-review', 'tdd-workflow', '--report', outPath], cwd, home);

    const { existsSync } = require('node:fs') as typeof import('node:fs');

    expect(result.status).toBe(0);
    expect(result.stdout).toContain('custom-report.html');
    expect(existsSync(outPath)).toBe(true);
  });

  it('diff fails with exit code 1 when a skill is missing', () => {
    const root = createTempRoot();
    const cwd = join(root, 'workspace');
    const home = join(root, 'home');

    writeFile(join(cwd, '.claude', 'skills', 'code-review', 'SKILL.md'), SKILL_A_CONTENT);

    const result = runCli(['diff', 'code-review', 'no-such-skill'], cwd, home);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('"no-such-skill"');
  });

  it('diff fails with exit code 1 when both skill names are the same', () => {
    const root = createTempRoot();
    const cwd = join(root, 'workspace');
    const home = join(root, 'home');

    writeFile(join(cwd, '.claude', 'skills', 'code-review', 'SKILL.md'), SKILL_A_CONTENT);

    const result = runCli(['diff', 'code-review', 'code-review'], cwd, home);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('same');
  });

  it('diff fails with usage message when fewer than two skill names are given', () => {
    const root = createTempRoot();
    const cwd = join(root, 'workspace');
    const home = join(root, 'home');

    writeFile(join(cwd, '.claude', 'skills', 'code-review', 'SKILL.md'), SKILL_A_CONTENT);

    const result = runCli(['diff', 'code-review'], cwd, home);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('Usage:');
  });
});

describe('CLI integration — cleanup', () => {
  const SKILL_CONTENT = (name: string) =>
    ['---', `name: ${name}`, `description: ${name} helps with code review`, '---', '', `# ${name}`].join('\n');

  it('cleanup shows no-duplicates message when no skills conflict', () => {
    const root = createTempRoot();
    const cwd = join(root, 'workspace');
    const home = join(root, 'home');

    writeFile(join(cwd, '.claude', 'skills', 'skill-alpha', 'SKILL.md'), SKILL_CONTENT('skill-alpha'));
    writeFile(join(cwd, '.claude', 'skills', 'skill-beta', 'SKILL.md'), SKILL_CONTENT('skill-beta'));

    const result = runCli(['cleanup'], cwd, home);

    expect(result.status).toBe(0);
    expect(result.stdout).toContain('DUPLICATE SKILLS');
    expect(result.stdout).toContain('No duplicate skills found.');
  });

  it('cleanup lists both paths for a duplicate skill without recommending either', () => {
    const root = createTempRoot();
    const cwd = join(root, 'workspace');
    const home = join(root, 'home');

    const content = SKILL_CONTENT('karpathy-guidelines');
    writeFile(join(cwd, '.claude', 'skills', 'karpathy-guidelines', 'SKILL.md'), content);
    writeFile(join(home, '.claude', 'skills', 'karpathy-guidelines', 'SKILL.md'), content);

    const result = runCli(['cleanup', '--scope', 'all'], cwd, home);

    expect(result.status).toBe(0);
    expect(result.stdout).toContain('DUPLICATE SKILLS');
    expect(result.stdout).toContain('karpathy-guidelines');
    expect(result.stdout).toContain('[1]');
    expect(result.stdout).toContain('[2]');
    expect(result.stdout).toContain('--execute');
    expect(result.stdout).not.toContain('remove:');
    expect(result.stdout).not.toContain('keep:');
  });

  it('cleanup --json returns an empty array when no duplicates', () => {
    const root = createTempRoot();
    const cwd = join(root, 'workspace');
    const home = join(root, 'home');

    writeFile(join(cwd, '.claude', 'skills', 'skill-alpha', 'SKILL.md'), SKILL_CONTENT('skill-alpha'));

    const result = runCli(['cleanup', '--json'], cwd, home);
    const payload = JSON.parse(result.stdout);

    expect(result.status).toBe(0);
    expect(payload).toEqual([]);
  });

  it('cleanup --json returns name and paths for each duplicate', () => {
    const root = createTempRoot();
    const cwd = join(root, 'workspace');
    const home = join(root, 'home');

    const content = SKILL_CONTENT('karpathy-guidelines');
    writeFile(join(cwd, '.claude', 'skills', 'karpathy-guidelines', 'SKILL.md'), content);
    writeFile(join(home, '.claude', 'skills', 'karpathy-guidelines', 'SKILL.md'), content);

    const result = runCli(['cleanup', '--scope', 'all', '--json'], cwd, home);
    const payload = JSON.parse(result.stdout);

    expect(result.status).toBe(0);
    expect(Array.isArray(payload)).toBe(true);
    expect(payload.length).toBeGreaterThan(0);
    expect(payload[0]).toHaveProperty('name', 'karpathy-guidelines');
    expect(payload[0]).toHaveProperty('paths');
    expect(Array.isArray(payload[0].paths)).toBe(true);
    expect(payload[0].paths).toHaveLength(2);
  });

  it('cleanup --scope project ignores global duplicates', () => {
    const root = createTempRoot();
    const cwd = join(root, 'workspace');
    const home = join(root, 'home');

    const content = SKILL_CONTENT('karpathy-guidelines');
    writeFile(join(cwd, '.claude', 'skills', 'karpathy-guidelines', 'SKILL.md'), content);
    writeFile(join(home, '.claude', 'skills', 'karpathy-guidelines', 'SKILL.md'), content);

    const result = runCli(['cleanup', '--scope', 'project'], cwd, home);

    expect(result.status).toBe(0);
    expect(result.stdout).toContain('No duplicate skills found.');
  });

  it('cleanup --execute removes the chosen skill directory and leaves the other', () => {
    const root = createTempRoot();
    const cwd = join(root, 'workspace');
    const home = join(root, 'home');

    const content = SKILL_CONTENT('karpathy-guidelines');
    const projectSkillDir = join(cwd, '.claude', 'skills', 'karpathy-guidelines');
    const globalSkillDir = join(home, '.claude', 'skills', 'karpathy-guidelines');
    writeFile(join(projectSkillDir, 'SKILL.md'), content);
    writeFile(join(globalSkillDir, 'SKILL.md'), content);

    // answer '2' to remove the second path shown
    const result = runCli(['cleanup', '--scope', 'all', '--execute'], cwd, home, '2\n');

    const { existsSync } = require('node:fs') as typeof import('node:fs');

    expect(result.status).toBe(0);
    expect(result.stdout).toContain('Removed:');
    // exactly one of the two dirs was removed
    const projectExists = existsSync(projectSkillDir);
    const globalExists = existsSync(globalSkillDir);
    expect(projectExists !== globalExists).toBe(true);
  });

  it('cleanup --execute skips when user answers s', () => {
    const root = createTempRoot();
    const cwd = join(root, 'workspace');
    const home = join(root, 'home');

    const content = SKILL_CONTENT('karpathy-guidelines');
    writeFile(join(cwd, '.claude', 'skills', 'karpathy-guidelines', 'SKILL.md'), content);
    writeFile(join(home, '.claude', 'skills', 'karpathy-guidelines', 'SKILL.md'), content);

    const result = runCli(['cleanup', '--scope', 'all', '--execute'], cwd, home, 's\n');

    const { existsSync } = require('node:fs') as typeof import('node:fs');

    expect(result.status).toBe(0);
    expect(result.stdout).toContain('Skipped.');
    expect(existsSync(join(cwd, '.claude', 'skills', 'karpathy-guidelines'))).toBe(true);
    expect(existsSync(join(home, '.claude', 'skills', 'karpathy-guidelines'))).toBe(true);
  });
});

describe('CLI integration — context cost', () => {
  it('help lists platform values and aliases from the registry', () => {
    const root = createTempRoot();
    const cwd = join(root, 'workspace');
    const home = join(root, 'home');
    const values = getPlatformCliValues({ includeUnknown: true }).join('|');
    const aliases = getPlatformAliasMappings()
      .map((entry) => `${entry.alias}->${entry.platform}`)
      .join(', ');

    writeFile(join(cwd, '.keep'), '');

    const result = runCli(['--help'], cwd, home);

    expect(result.status).toBe(0);
    expect(result.stdout).toContain(`--platform values: ${values}`);
    expect(result.stdout).toContain(`aliases: ${aliases}`);
  });

  it('cost and context subcommand help does not run a context scan', () => {
    const root = createTempRoot();
    const cwd = join(root, 'workspace');
    const home = join(root, 'home');

    writeFile(join(cwd, '.keep'), '');

    const costHelp = runCli(['cost', '--help'], cwd, home);
    const contextHelp = runCli(['context', '--help'], cwd, home);

    expect(costHelp.status).toBe(0);
    expect(costHelp.stdout).toContain('Usage:');
    expect(costHelp.stdout).toContain('--include-disabled');
    expect(costHelp.stdout).not.toContain('CONTEXT COST REPORT');
    expect(contextHelp.status).toBe(0);
    expect(contextHelp.stdout).toContain('skill-doctor context enable|disable');
    expect(contextHelp.stdout).not.toContain('CONTEXT COST REPORT');
  });

  it('cost reports estimated token tax for Claude skills and always-on files', () => {
    const root = createTempRoot();
    const cwd = join(root, 'workspace');
    const home = join(root, 'home');

    writeFile(
      join(cwd, '.claude', 'skills', 'review-helper', 'SKILL.md'),
      ['---', 'name: review-helper', 'description: Use for focused code review.', '---', '', '# Review Helper'].join('\n'),
    );
    writeFile(join(cwd, 'AGENTS.md'), 'Always follow this project instruction. '.repeat(40));

    const result = runCli(['cost'], cwd, home);

    expect(result.status).toBe(0);
    expect(result.stdout).toContain('CONTEXT COST REPORT');
    expect(result.stdout).toContain('Estimated token tax:');
    expect(result.stdout).toContain('Tokenizer: openai model=gpt-4o encoding=o200k_base');
    expect(result.stdout).toContain('review-helper');
    expect(result.stdout).toContain('AGENTS.md');
  });

  it('context --json exposes grade, budget, and item kinds', () => {
    const root = createTempRoot();
    const cwd = join(root, 'workspace');
    const home = join(root, 'home');

    writeFile(
      join(cwd, '.claude', 'skills', 'review-helper', 'SKILL.md'),
      ['---', 'name: review-helper', 'description: Use for focused code review.', '---', '', '# Review Helper'].join('\n'),
    );

    const result = runCli(['context', '--budget-tokens', '1000', '--json'], cwd, home);
    const payload = JSON.parse(result.stdout);

    expect(result.status).toBe(0);
    expect(payload.summary.budgetTokens).toBe(1000);
    expect(payload.summary.tokenizer).toEqual({
      mode: 'openai',
      model: 'gpt-4o',
      encoding: 'o200k_base',
    });
    expect(payload.summary.grade).toMatch(/^[ABCDF]$/);
    expect(payload.summary.projectPath).toBe(realpathSync(cwd));
    expect(payload.summary.byPlatform).toEqual(expect.arrayContaining([
      expect.objectContaining({ platform: 'claude', items: 1 }),
      expect.objectContaining({ platform: 'copilot', items: 1 }),
    ]));
    expect(payload.items[0].kind).toBe('claude-skill-description');
  });

  it('cost --json supports approximate token estimates', () => {
    const root = createTempRoot();
    const cwd = join(root, 'workspace');
    const home = join(root, 'home');

    writeFile(join(cwd, 'AGENTS.md'), 'Always follow this project instruction. '.repeat(10));

    const result = runCli(['cost', '--tokenizer', 'approx', '--json'], cwd, home);
    const payload = JSON.parse(result.stdout);

    expect(result.status).toBe(0);
    expect(payload.summary.tokenizer).toEqual({ mode: 'approx' });
  });

  it('cost --json supports explicit OpenAI tokenizer models', () => {
    const root = createTempRoot();
    const cwd = join(root, 'workspace');
    const home = join(root, 'home');

    writeFile(join(cwd, 'AGENTS.md'), 'Always follow this project instruction. '.repeat(10));

    const result = runCli(['cost', '--tokenizer', 'openai', '--tokenizer-model', 'gpt-4o', '--json'], cwd, home);
    const payload = JSON.parse(result.stdout);

    expect(result.status).toBe(0);
    expect(payload.summary.tokenizer).toEqual({
      mode: 'openai',
      model: 'gpt-4o',
      encoding: 'o200k_base',
    });
  });

  it('cost rejects invalid tokenizer values', () => {
    const root = createTempRoot();
    const cwd = join(root, 'workspace');
    const home = join(root, 'home');

    writeFile(join(cwd, '.keep'), '');

    const result = runCli(['cost', '--tokenizer', 'exact'], cwd, home);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('Invalid tokenizer. Use --tokenizer openai|approx');
  });

  it('cost defaults to current project plus global agent scope', () => {
    const root = createTempRoot();
    const cwd = join(root, 'workspace');
    const home = join(root, 'home');

    writeFile(
      join(cwd, '.claude', 'skills', 'project-review', 'SKILL.md'),
      ['---', 'name: project-review', 'description: Project review helper.', '---', '', '# Project Review'].join('\n'),
    );
    writeFile(
      join(home, '.claude', 'skills', 'global-review', 'SKILL.md'),
      ['---', 'name: global-review', 'description: Global review helper.', '---', '', '# Global Review'].join('\n'),
    );

    const result = runCli(['cost', '--json'], cwd, home);
    const payload = JSON.parse(result.stdout);

    expect(result.status).toBe(0);
    expect(payload.items.map((item: { platform: string; name: string }) => `${item.platform}:${item.name}`).sort()).toEqual([
      'claude:global-review',
      'claude:project-review',
      'copilot:project-review',
    ]);
    expect(payload.summary.projectPath).toBe(realpathSync(cwd));
    expect(payload.summary.byPlatform).toEqual(expect.arrayContaining([
      expect.objectContaining({ platform: 'claude', items: 2 }),
      expect.objectContaining({ platform: 'copilot', items: 1 }),
    ]));
  });

  it('cost accepts an explicit project directory argument', () => {
    const root = createTempRoot();
    const cwd = join(root, 'workspace');
    const target = join(root, 'target-project');
    const home = join(root, 'home');

    writeFile(
      join(target, '.claude', 'skills', 'target-review', 'SKILL.md'),
      ['---', 'name: target-review', 'description: Target review helper.', '---', '', '# Target Review'].join('\n'),
    );
    writeFile(
      join(cwd, '.claude', 'skills', 'cwd-review', 'SKILL.md'),
      ['---', 'name: cwd-review', 'description: CWD review helper.', '---', '', '# CWD Review'].join('\n'),
    );

    const result = runCli(['cost', target, '--json'], cwd, home);
    const payload = JSON.parse(result.stdout);

    expect(result.status).toBe(0);
    expect(payload.summary.projectPath).toBe(target);
    expect(payload.items.map((item: { platform: string; name: string }) => `${item.platform}:${item.name}`).sort()).toEqual([
      'claude:target-review',
      'copilot:target-review',
    ]);
  });

  it('cost --json classifies other coding agent cost modes', () => {
    const root = createTempRoot();
    const cwd = join(root, 'workspace');
    const home = join(root, 'home');

    writeFile(
      join(cwd, '.cursor', 'rules', 'review.mdc'),
      ['---', 'description: Cursor review rule', 'globs: ["**/*.ts"]', '---', '', 'Follow Cursor review guidance.'].join('\n'),
    );
    writeFile(
      join(cwd, '.github', 'instructions', 'security.instructions.md'),
      ['---', 'applyTo: "**/*.ts"', '---', '', 'Follow Copilot security guidance.'].join('\n'),
    );
    writeFile(
      join(cwd, '.gemini', 'skills', 'review-helper', 'SKILL.md'),
      ['---', 'name: review-helper', 'description: Use for Gemini code review.', '---', '', '# Review Helper'].join('\n'),
    );
    writeFile(join(cwd, '.windsurfrules'), 'Always follow Windsurf project guidance.');

    const result = runCli(['cost', '--scope', 'project', '--json'], cwd, home);
    const payload = JSON.parse(result.stdout);
    const kindsByPlatform = Object.fromEntries(
      payload.items.map((item: { platform: string; kind: string }) => [item.platform, item.kind]),
    );

    expect(result.status).toBe(0);
    expect(payload.summary.byPlatform).toEqual(expect.arrayContaining([
      expect.objectContaining({ platform: 'cursor' }),
      expect.objectContaining({ platform: 'copilot' }),
      expect.objectContaining({ platform: 'gemini' }),
      expect.objectContaining({ platform: 'windsurf' }),
    ]));
    expect(kindsByPlatform.cursor).toBe('cursor-rule-file');
    expect(kindsByPlatform.copilot).toBe('copilot-instruction-file');
    expect(kindsByPlatform.gemini).toBe('agent-skill-description');
    expect(kindsByPlatform.windsurf).toBe('always-on-file');
  });

  it('cost covers Copilot instructions, prompt files, skills, and nested agent instructions', () => {
    const root = createTempRoot();
    const cwd = join(root, 'workspace');
    const home = join(root, 'home');

    writeFile(
      join(cwd, '.github', 'instructions', 'security.instructions.md'),
      ['---', 'applyTo: "**/*.ts"', '---', '', 'Follow Copilot security guidance.'].join('\n'),
    );
    writeFile(
      join(cwd, '.github', 'prompts', 'review.prompt.md'),
      'Review this change and summarize correctness risks.',
    );
    writeFile(
      join(cwd, '.github', 'skills', 'review-helper', 'SKILL.md'),
      ['---', 'name: review-helper', 'description: Use for Copilot code review.', '---', '', '# Review Helper'].join('\n'),
    );
    writeFile(join(cwd, 'packages', 'api', 'AGENTS.md'), 'Use API package conventions.');

    const result = runCli(['cost', '--scope', 'project', '--source', 'skill', '--platform', 'copilot', '--json'], cwd, home);
    const payload = JSON.parse(result.stdout);
    const kinds = payload.items.map((item: { kind: string }) => item.kind).sort();
    const paths = payload.items.map((item: { sourcePath: string }) => item.sourcePath);

    expect(result.status).toBe(0);
    expect(kinds).toEqual([
      'agent-skill-description',
      'always-on-file',
      'copilot-instruction-file',
      'copilot-prompt-file',
    ]);
    expect(paths.some((path: string) => path.endsWith(join('packages', 'api', 'AGENTS.md')))).toBe(true);
  });

  it('cost covers codex project and global skill paths', () => {
    const root = createTempRoot();
    const cwd = join(root, 'workspace');
    const home = join(root, 'home');

    writeFile(join(cwd, '.codex', 'AGENTS.md'), 'Project-local Codex instructions.');
    writeFile(
      join(cwd, '.codex', 'skills', 'review-helper', 'SKILL.md'),
      ['---', 'name: review-helper', 'description: Codex skill metadata.', '---', '', '# Review Helper'].join('\n'),
    );
    writeFile(
      join(cwd, '.agent', 'skills', 'project-agent-helper', 'SKILL.md'),
      ['---', 'name: project-agent-helper', 'description: Project agent skill metadata.', '---', '', '# Project Agent Helper'].join('\n'),
    );
    writeFile(
      join(home, '.codex', 'skills', 'global-codex-helper', 'SKILL.md'),
      ['---', 'name: global-codex-helper', 'description: Global Codex skill metadata.', '---', '', '# Global Codex Helper'].join('\n'),
    );
    writeFile(
      join(home, '.agent', 'skills', 'global-agent-helper', 'SKILL.md'),
      ['---', 'name: global-agent-helper', 'description: Global agent skill metadata.', '---', '', '# Global Agent Helper'].join('\n'),
    );

    const result = runCli(['cost', '--json'], cwd, home);
    const payload = JSON.parse(result.stdout);
    const kindsByName = Object.fromEntries(
      payload.items.map((item: { name: string; kind: string }) => [item.name, item.kind]),
    );

    expect(result.status).toBe(0);
    expect(payload.summary.byPlatform).toEqual([
      expect.objectContaining({ platform: 'codex', items: 5 }),
    ]);
    expect(kindsByName['AGENTS.md']).toBe('always-on-file');
    expect(kindsByName['review-helper']).toBe('agent-skill-description');
    expect(kindsByName['project-agent-helper']).toBe('agent-skill-description');
    expect(kindsByName['global-codex-helper']).toBe('agent-skill-description');
    expect(kindsByName['global-agent-helper']).toBe('agent-skill-description');
  });

  it('cost --platform returns only the selected coding agent', () => {
    const root = createTempRoot();
    const cwd = join(root, 'workspace');
    const home = join(root, 'home');

    writeFile(
      join(cwd, '.claude', 'skills', 'project-review', 'SKILL.md'),
      ['---', 'name: project-review', 'description: Project review helper.', '---', '', '# Project Review'].join('\n'),
    );
    writeFile(
      join(cwd, '.codex', 'skills', 'codex-review', 'SKILL.md'),
      ['---', 'name: codex-review', 'description: Codex review helper.', '---', '', '# Codex Review'].join('\n'),
    );
    writeFile(join(cwd, '.cursor', 'rules', 'review.mdc'), 'Cursor review guidance.');

    const result = runCli(['cost', '--platform', 'codex', '--json'], cwd, home);
    const payload = JSON.parse(result.stdout);

    expect(result.status).toBe(0);
    expect(payload.summary.byPlatform).toEqual([
      expect.objectContaining({ platform: 'codex', items: 2 }),
    ]);
    expect(payload.items).toEqual(expect.arrayContaining([
      expect.objectContaining({ platform: 'codex', name: 'codex-review' }),
      expect.objectContaining({ platform: 'codex', kind: 'codex-skill-list' }),
    ]));
  });

  it('cost --platform codex uses codex-config overrides and resource filters', () => {
    const root = createTempRoot();
    const cwd = join(root, 'workspace');
    const home = join(root, 'home');
    const configPath = join(root, 'codex-config.json');

    writeFile(
      join(cwd, '.custom-codex', 'skills', 'codex-review', 'SKILL.md'),
      ['---', 'name: codex-review', 'description: Custom Codex review helper.', '---', '', '# Codex Review'].join('\n'),
    );
    writeFile(
      configPath,
      JSON.stringify({
        skillDirs: [
          { id: 'custom-codex-skills', scope: 'project', path: '.custom-codex/skills', enabled: true },
        ],
      }),
    );

    const result = runCli(['cost', '--platform', 'codex', '--resource', 'skill', '--codex-config', configPath, '--json'], cwd, home);
    const payload = JSON.parse(result.stdout);
    const realCwd = realpathSync(cwd);

    expect(result.status).toBe(0);
    expect(payload.items).toHaveLength(2);
    expect(payload.items).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: `codex:skill:${join(realCwd, '.custom-codex', 'skills', 'codex-review', 'SKILL.md')}`,
        resource: 'skill',
        configSource: configPath,
      }),
      expect.objectContaining({
        id: 'codex:skill-list:enabled',
        resource: 'skill',
        kind: 'codex-skill-list',
      }),
    ]));
  });

  it('cost --resource plugin reports plugin-contributed skills and disabled tax separately', () => {
    const root = createTempRoot();
    const cwd = join(root, 'workspace');
    const home = join(root, 'home');

    writeFile(join(cwd, '.keep'), '');
    writeFile(
      join(home, '.codex', 'plugins', 'notes', '.codex-plugin', 'plugin.json'),
      JSON.stringify({ name: 'notes', skills: './skills/' }),
    );
    writeFile(
      join(home, '.codex', 'plugins', 'notes', 'skills', 'note-helper', 'SKILL.md'),
      ['---', 'name: note-helper', 'description: Help with notes.', '---', '', '# Note Helper'].join('\n'),
    );
    writeFile(join(home, '.codex', 'config.toml'), ['[plugins."notes@example"]', 'enabled = false'].join('\n'));

    const result = runCli(['cost', '--platform', 'codex', '--resource', 'plugin', '--include-disabled', '--json'], cwd, home);
    const payload = JSON.parse(result.stdout);

    expect(result.status).toBe(0);
    expect(payload.summary.totalEstimatedTokens).toBe(0);
    expect(payload.summary.disabledEstimatedTokens).toBeGreaterThan(0);
    expect(payload.items).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: 'codex:plugin:notes@example:skill:note-helper',
        resource: 'plugin',
        enabled: false,
      }),
      expect.objectContaining({
        id: 'codex:plugin-list:disabled',
        resource: 'plugin',
        kind: 'plugin-skill-list',
        enabled: false,
      }),
    ]));
  });

  it('cost --platform codex --json groups all Codex resource types with control metadata', () => {
    const root = createTempRoot();
    const cwd = join(root, 'workspace');
    const home = join(root, 'home');

    writeFile(join(cwd, 'AGENTS.md'), 'Project Codex guidance.');
    writeFile(
      join(cwd, '.codex', 'skills', 'codex-review', 'SKILL.md'),
      ['---', 'name: codex-review', 'description: Codex review helper.', '---', '', '# Codex Review'].join('\n'),
    );
    writeFile(
      join(cwd, '.codex', 'config.toml'),
      ['[mcp_servers.github]', 'instructions = "Use GitHub metadata when repository context is needed."'].join('\n'),
    );
    writeFile(
      join(home, '.codex', 'plugins', 'notes', '.codex-plugin', 'plugin.json'),
      JSON.stringify({ name: 'notes', skills: './skills/' }),
    );
    writeFile(
      join(home, '.codex', 'plugins', 'notes', 'skills', 'note-helper', 'SKILL.md'),
      ['---', 'name: note-helper', 'description: Help with notes.', '---', '', '# Note Helper'].join('\n'),
    );
    writeFile(join(home, '.codex', 'memories'), 'Remember user preference.');

    const result = runCli(['cost', '--platform', 'codex', '--json'], cwd, home);
    const payload = JSON.parse(result.stdout);

    expect(result.status).toBe(0);
    expect(Object.keys(payload.resources).sort()).toEqual(['agents', 'mcp', 'memory', 'plugin', 'skill']);
    for (const resource of ['agents', 'mcp', 'memory', 'plugin', 'skill']) {
      expect(payload.resources[resource].length).toBeGreaterThan(0);
      expect(payload.resources[resource][0]).toEqual(expect.objectContaining({
        id: expect.any(String),
        resource,
        enabled: expect.any(Boolean),
        controllable: expect.any(Boolean),
        controlPath: expect.any(String),
        controlMethod: expect.any(String),
        estimateStatus: expect.any(String),
      }));
    }
    expect(payload.resources.agents[0]).toEqual(expect.objectContaining({
      controllable: false,
      controlMethod: 'unsupported',
    }));
    expect(payload.resources.memory[0]).toEqual(expect.objectContaining({
      controllable: false,
      controlMethod: 'unsupported',
      estimateStatus: 'unknown',
    }));
  });

  it('context disable makes subsequent Codex cost runs lower for skills, MCP, and plugins', () => {
    const root = createTempRoot();
    const cwd = join(root, 'workspace');
    const home = join(root, 'home');
    const mcpScript = join(root, 'codex-mcp.js');
    const skillPath = join(cwd, '.codex', 'skills', 'codex-review', 'SKILL.md');

    writeFile(
      mcpScript,
      [
        'const readline = require("node:readline");',
        'const rl = readline.createInterface({ input: process.stdin });',
        'rl.on("line", (line) => {',
        '  const msg = JSON.parse(line);',
        '  if (msg.method === "initialize") {',
        '    console.log(JSON.stringify({ jsonrpc: "2.0", id: msg.id, result: { protocolVersion: "2025-06-18", capabilities: { tools: {} }, serverInfo: { name: "codex-test", version: "1.0.0" } } }));',
        '  } else if (msg.method === "tools/list") {',
        '    console.log(JSON.stringify({ jsonrpc: "2.0", id: msg.id, result: { tools: [{ name: "search_repositories", description: "Search GitHub repositories with detailed metadata.", inputSchema: { type: "object", properties: { query: { type: "string", description: "Repository query." } } } }] } }));',
        '  }',
        '});',
      ].join('\n'),
    );
    writeFile(
      skillPath,
      ['---', 'name: codex-review', 'description: Codex review helper. '.repeat(20), '---', '', '# Codex Review'].join('\n'),
    );
    writeFile(
      join(cwd, '.codex', 'config.toml'),
      [
        '[mcp_servers.github]',
        `command = ${JSON.stringify(process.execPath)}`,
        `args = [${JSON.stringify(mcpScript)}]`,
      ].join('\n'),
    );
    writeFile(
      join(home, '.codex', 'plugins', 'notes', '.codex-plugin', 'plugin.json'),
      JSON.stringify({ name: 'notes', skills: './skills/' }),
    );
    writeFile(
      join(home, '.codex', 'plugins', 'notes', 'skills', 'note-helper', 'SKILL.md'),
      ['---', 'name: note-helper', 'description: Help with notes. '.repeat(20), '---', '', '# Note Helper'].join('\n'),
    );

    const before = JSON.parse(runCli(['cost', '--platform', 'codex', '--json'], cwd, home).stdout);
    const skillId = `codex:skill:${join(realpathSync(cwd), '.codex', 'skills', 'codex-review', 'SKILL.md')}`;
    const pluginId = 'codex:plugin:notes:skill:note-helper';

    expect(before.summary.totalEstimatedTokens).toBeGreaterThan(0);
    expect(runCli(['context', 'disable', '--platform', 'codex', '--id', skillId, '--json'], cwd, home).status).toBe(0);
    const afterSkill = JSON.parse(runCli(['cost', '--platform', 'codex', '--json'], cwd, home).stdout);
    expect(afterSkill.summary.totalEstimatedTokens).toBeLessThan(before.summary.totalEstimatedTokens);

    expect(runCli(['context', 'disable', '--platform', 'codex', '--id', 'codex:mcp:github', '--json'], cwd, home).status).toBe(0);
    const afterMcp = JSON.parse(runCli(['cost', '--platform', 'codex', '--json'], cwd, home).stdout);
    expect(afterMcp.summary.totalEstimatedTokens).toBeLessThan(afterSkill.summary.totalEstimatedTokens);

    expect(runCli(['context', 'disable', '--platform', 'codex', '--id', pluginId, '--json'], cwd, home).status).toBe(0);
    const afterPlugin = JSON.parse(runCli(['cost', '--platform', 'codex', '--json'], cwd, home).stdout);
    expect(afterPlugin.summary.totalEstimatedTokens).toBeLessThan(afterMcp.summary.totalEstimatedTokens);

    const withDisabled = JSON.parse(runCli(['cost', '--platform', 'codex', '--include-disabled', '--json'], cwd, home).stdout);
    expect(withDisabled.summary.totalEstimatedTokens).toBe(0);
    expect(withDisabled.summary.disabledEstimatedTokens).toBeGreaterThan(0);
  });

  it('context disable writes project Codex config for a skill resource id', () => {
    const root = createTempRoot();
    const cwd = join(root, 'workspace');
    const home = join(root, 'home');
    const skillPath = join(cwd, '.codex', 'skills', 'codex-review', 'SKILL.md');

    writeFile(
      skillPath,
      ['---', 'name: codex-review', 'description: Codex review helper.', '---', '', '# Codex Review'].join('\n'),
    );

    const realSkillPath = join(realpathSync(cwd), '.codex', 'skills', 'codex-review', 'SKILL.md');
    const result = runCli(['context', 'disable', '--id', `codex:skill:${realSkillPath}`, '--platform', 'codex', '--json'], cwd, home);
    const payload = JSON.parse(result.stdout);
    const config = readFileSync(join(cwd, '.codex', 'config.toml'), 'utf8');

    expect(result.status).toBe(0);
    expect(payload).toEqual(expect.objectContaining({
      id: `codex:skill:${realSkillPath}`,
      enabled: false,
      requiresNewSession: true,
      message: expect.stringContaining('Start a new Codex session or restart Codex'),
    }));
    expect(config).toContain('[[skills.config]]');
    expect(config).toContain(`path = "${realSkillPath}"`);
    expect(config).toContain('enabled = false');
  });

  it('context disable reports AGENTS resources as unsupported without writing config', () => {
    const root = createTempRoot();
    const cwd = join(root, 'workspace');
    const home = join(root, 'home');

    writeFile(join(cwd, 'AGENTS.md'), 'Project guidance.');

    const result = runCli(['context', 'disable', '--id', 'codex:agents:project-root-agents', '--platform', 'codex', '--json'], cwd, home);
    const payload = JSON.parse(result.stdout);

    expect(result.status).toBe(0);
    expect(payload).toEqual(expect.objectContaining({
      supported: false,
      changed: false,
      resource: 'agents',
      message: expect.stringContaining('cannot be toggled automatically'),
    }));
    expect(existsSync(join(cwd, '.codex', 'config.toml'))).toBe(false);
  });

  it('cost treats a lone platform positional as a platform filter for npm-run compatibility', () => {
    const root = createTempRoot();
    const cwd = join(root, 'workspace');
    const home = join(root, 'home');

    writeFile(
      join(cwd, '.claude', 'skills', 'project-review', 'SKILL.md'),
      ['---', 'name: project-review', 'description: Project review helper.', '---', '', '# Project Review'].join('\n'),
    );
    writeFile(
      join(cwd, '.codex', 'skills', 'codex-review', 'SKILL.md'),
      ['---', 'name: codex-review', 'description: Codex review helper.', '---', '', '# Codex Review'].join('\n'),
    );

    const result = runCli(['cost', 'codex', '--json'], cwd, home);
    const payload = JSON.parse(result.stdout);

    expect(result.status).toBe(0);
    expect(payload.summary.projectPath).toBe(realpathSync(cwd));
    expect(payload.summary.byPlatform).toEqual([
      expect.objectContaining({ platform: 'codex', items: 2 }),
    ]);
    expect(payload.items.map((item: { platform: string; name: string }) => `${item.platform}:${item.name}`)).toEqual(expect.arrayContaining([
      'codex:codex-review',
      'codex:Codex skill list',
    ]));
  });

  it('cost validates platform input', () => {
    const root = createTempRoot();
    const cwd = join(root, 'workspace');
    const home = join(root, 'home');

    writeFile(join(cwd, '.keep'), '');

    const result = runCli(['cost', '--platform', 'not-an-agent'], cwd, home);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain(`Invalid platform. Use --platform ${getPlatformCliValues({ includeUnknown: true }).join('|')}`);
    expect(result.stderr).toContain('claudecode->claude');
  });

  it('cost --fail-on-budget exits non-zero when the estimate exceeds the budget', () => {
    const root = createTempRoot();
    const cwd = join(root, 'workspace');
    const home = join(root, 'home');

    writeFile(join(cwd, 'AGENTS.md'), 'Always-on instruction. '.repeat(100));

    const result = runCli(['cost', '--budget-tokens', '10', '--fail-on-budget'], cwd, home);

    expect(result.status).toBe(1);
    expect(result.stdout).toContain('over budget');
  });

  it('cost applies per-platform budgets and fails when a selected platform exceeds its budget', () => {
    const root = createTempRoot();
    const cwd = join(root, 'workspace');
    const home = join(root, 'home');

    writeFile(
      join(cwd, '.claude', 'skills', 'project-review', 'SKILL.md'),
      ['---', 'name: project-review', 'description: Project review helper. '.repeat(40), '---', '', '# Project Review'].join('\n'),
    );
    writeFile(
      join(cwd, '.codex', 'skills', 'codex-review', 'SKILL.md'),
      ['---', 'name: codex-review', 'description: Codex review helper.', '---', '', '# Codex Review'].join('\n'),
    );

    const result = runCli(
      ['cost', '--platform-budget', 'claude=10', '--platform-budget', 'codex=2000', '--fail-on-budget', '--json'],
      cwd,
      home,
    );
    const payload = JSON.parse(result.stdout);

    expect(result.status).toBe(1);
    expect(payload.summary.byPlatform).toEqual(expect.arrayContaining([
      expect.objectContaining({ platform: 'claude', budgetTokens: 10, overBudget: true }),
      expect.objectContaining({ platform: 'codex', budgetTokens: 2000, overBudget: false }),
    ]));
  });

  it('cost validates budget input', () => {
    const root = createTempRoot();
    const cwd = join(root, 'workspace');
    const home = join(root, 'home');

    writeFile(join(cwd, '.keep'), '');

    const result = runCli(['cost', '--budget-tokens', '0'], cwd, home);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('Invalid budget. Use --budget-tokens <positive integer>');
  });

  it('cost validates platform budget input', () => {
    const root = createTempRoot();
    const cwd = join(root, 'workspace');
    const home = join(root, 'home');

    writeFile(join(cwd, '.keep'), '');

    const result = runCli(['cost', '--platform-budget', 'codex=0'], cwd, home);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('Invalid platform budget. Use --platform-budget <platform=positive-integer> where platform is');
    expect(result.stderr).toContain('claudecode->claude');
  });

  it('cost --source mcp --platform codex reports Codex MCP config only', () => {
    const root = createTempRoot();
    const cwd = join(root, 'workspace');
    const home = join(root, 'home');
    const mcpScript = join(root, 'codex-mcp.js');

    writeFile(
      mcpScript,
      [
        'const readline = require("node:readline");',
        'const rl = readline.createInterface({ input: process.stdin });',
        'rl.on("line", (line) => {',
        '  const msg = JSON.parse(line);',
        '  if (msg.method === "initialize") {',
        '    console.log(JSON.stringify({ jsonrpc: "2.0", id: msg.id, result: { protocolVersion: "2025-06-18", capabilities: { tools: {} }, serverInfo: { name: "codex-test", version: "1.0.0" } } }));',
        '  } else if (msg.method === "tools/list") {',
        '    console.log(JSON.stringify({ jsonrpc: "2.0", id: msg.id, result: { tools: [{ name: "search_repositories", description: "Search GitHub repositories.", inputSchema: { type: "object", properties: { query: { type: "string" } } } }] } }));',
        '  }',
        '});',
      ].join('\n'),
    );

    writeFile(
      join(cwd, '.codex', 'config.toml'),
      [
        '[mcp_servers.github]',
        `command = ${JSON.stringify(process.execPath)}`,
        `args = [${JSON.stringify(mcpScript)}]`,
        'allowed_tools = ["search_repositories"]',
        '',
        '[mcp_servers.github.env]',
        'GITHUB_TOKEN = "super-secret"',
      ].join('\n'),
    );
    writeFile(
      join(cwd, '.claude', 'skills', 'project-review', 'SKILL.md'),
      ['---', 'name: project-review', 'description: Project review helper.', '---', '', '# Project Review'].join('\n'),
    );

    const result = runCli(['cost', '--source', 'mcp', '--platform', 'codex', '--json'], cwd, home);
    const payload = JSON.parse(result.stdout);

    expect(result.status).toBe(0);
    expect(payload.summary.byPlatform).toEqual([
      expect.objectContaining({ platform: 'codex', items: 1 }),
    ]);
    expect(payload.items).toHaveLength(1);
    expect(payload.items[0]).toEqual(expect.objectContaining({
      name: 'github',
      platform: 'codex',
      source: 'mcp',
      kind: 'mcp-tool-list',
      estimatedTokens: expect.any(Number),
    }));
    expect(payload.items[0].estimatedTokens).toBeGreaterThan(0);
    expect(JSON.stringify(payload)).not.toContain('super-secret');
  });

  it('cost accepts claudecode as a Claude platform alias', () => {
    const root = createTempRoot();
    const cwd = join(root, 'workspace');
    const home = join(root, 'home');

    writeFile(
      join(cwd, '.claude', 'skills', 'project-review', 'SKILL.md'),
      ['---', 'name: project-review', 'description: Project review helper.', '---', '', '# Project Review'].join('\n'),
    );
    writeFile(
      join(cwd, '.mcp.json'),
      JSON.stringify({
        mcpServers: {
          local: { url: 'http://127.0.0.1:9/mcp', timeoutMs: 100 },
        },
      }),
    );
    writeFile(
      join(cwd, '.codex', 'skills', 'codex-review', 'SKILL.md'),
      ['---', 'name: codex-review', 'description: Codex review helper.', '---', '', '# Codex Review'].join('\n'),
    );

    const result = runCli(['cost', 'claudecode', '--source', 'all', '--json'], cwd, home);
    const payload = JSON.parse(result.stdout);

    expect(result.status).toBe(0);
    expect(payload.summary.byPlatform).toEqual([
      expect.objectContaining({ platform: 'claude', items: 2 }),
    ]);
    expect(payload.items.map((item: { platform: string; source: string }) => `${item.platform}:${item.source}`).sort()).toEqual([
      'claude:mcp',
      'claude:skill',
    ]);
  });

  it('cost --source skill preserves skill-only behavior', () => {
    const root = createTempRoot();
    const cwd = join(root, 'workspace');
    const home = join(root, 'home');

    writeFile(
      join(cwd, '.claude', 'skills', 'project-review', 'SKILL.md'),
      ['---', 'name: project-review', 'description: Project review helper.', '---', '', '# Project Review'].join('\n'),
    );
    writeFile(
      join(cwd, '.mcp.json'),
      JSON.stringify({
        mcpServers: {
          local: { command: 'node', args: ['server.js'] },
        },
      }),
    );

    const result = runCli(['cost', '--source', 'skill', '--json'], cwd, home);
    const payload = JSON.parse(result.stdout);

    expect(result.status).toBe(0);
    expect(payload.items).toEqual(expect.arrayContaining([
      expect.objectContaining({
        name: 'project-review',
        source: 'skill',
        kind: 'claude-skill-description',
      }),
    ]));
    expect(payload.items.every((item: { source: string }) => item.source === 'skill')).toBe(true);
  });

  it('cost --source mcp --fail-on-budget exits non-zero when MCP estimate exceeds budget', () => {
    const root = createTempRoot();
    const cwd = join(root, 'workspace');
    const home = join(root, 'home');
    const mcpScript = join(root, 'broad-mcp.js');

    writeFile(
      mcpScript,
      [
        'const readline = require("node:readline");',
        'const tools = Array.from({ length: 20 }, (_, index) => ({ name: `tool_${index}`, description: "Very detailed tool description ".repeat(20), inputSchema: { type: "object", properties: { input: { type: "string", description: "Long input description ".repeat(10) } } } }));',
        'const rl = readline.createInterface({ input: process.stdin });',
        'rl.on("line", (line) => {',
        '  const msg = JSON.parse(line);',
        '  if (msg.method === "initialize") {',
        '    console.log(JSON.stringify({ jsonrpc: "2.0", id: msg.id, result: { protocolVersion: "2025-06-18", capabilities: { tools: {} }, serverInfo: { name: "broad-test", version: "1.0.0" } } }));',
        '  } else if (msg.method === "tools/list") {',
        '    console.log(JSON.stringify({ jsonrpc: "2.0", id: msg.id, result: { tools } }));',
        '  }',
        '});',
      ].join('\n'),
    );

    writeFile(
      join(cwd, '.mcp.json'),
      JSON.stringify({
        mcpServers: {
          broad: {
            command: process.execPath,
            args: [mcpScript],
          },
        },
      }),
    );

    const result = runCli(['cost', '--source', 'mcp', '--budget-tokens', '10', '--fail-on-budget'], cwd, home);

    expect(result.status).toBe(1);
    expect(result.stdout).toContain('over budget');
    expect(result.stdout).toContain('broad');
  });

  it('cost validates source input', () => {
    const root = createTempRoot();
    const cwd = join(root, 'workspace');
    const home = join(root, 'home');

    writeFile(join(cwd, '.keep'), '');

    const result = runCli(['cost', '--source', 'everything'], cwd, home);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('Invalid source. Use --source skill|mcp|all');
  });
});

describe('install / uninstall', () => {
  beforeEach(() => {
    process.exitCode = 0;
  });

  it('install errors on missing source argument', async () => {
    await main(['install']);
    expect(process.exitCode).toBe(1);
  });

  it('uninstall errors on missing name argument', async () => {
    await main(['uninstall']);
    expect(process.exitCode).toBe(1);
  });

  it('install errors on unknown platform', async () => {
    await main(['install', './some-path', '--target', 'nonexistent-platform']);
    expect(process.exitCode).toBe(1);
  });

  it('install accepts platform target aliases through the registry', () => {
    const root = createTempRoot();
    const cwd = join(root, 'workspace');
    const home = join(root, 'home');
    const source = join(root, 'alias-source', 'SKILL.md');

    writeFile(join(cwd, '.keep'), '');
    writeFile(
      source,
      ['---', 'name: alias-skill', 'description: target alias test', '---', '', '# Alias Skill'].join('\n'),
    );

    const result = runCli(['install', source, '--target', 'claudecode'], cwd, home);
    const installed = join(home, '.claude', 'skills', 'alias-skill', 'SKILL.md');

    expect(result.status).toBe(0);
    expect(result.stdout).toContain("Installed 'alias-skill' to claude");
    expect(existsSync(installed)).toBe(true);
    expect(readFileSync(installed, 'utf8')).toContain('name: alias-skill');
  });
});
