import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { buildMcpConfigText, estimateContextCost, estimateTokens } from '../../src/context/estimateContextCost';
import type { McpServerRecord } from '../../src/types/mcp';
import type { SkillRecord } from '../../src/types/skill';

const tempRoots: string[] = [];

afterEach(() => {
  for (const root of tempRoots) {
    rmSync(root, { recursive: true, force: true });
  }
  tempRoots.length = 0;
});

function tempRoot(): string {
  const root = mkdtempSync(join(tmpdir(), 'skill-doctor-context-'));
  tempRoots.push(root);
  return root;
}

function makeSkill(overrides: Partial<SkillRecord> = {}): SkillRecord {
  return {
    name: 'review-helper',
    sourcePath: '/fake/.claude/skills/review-helper/SKILL.md',
    platform: 'claude',
    scope: 'project',
    description: 'Use for focused code review.',
    triggers: ['review code'],
    provenance: {
      installSource: '.claude/skills',
      confidence: 'high',
    },
    ...overrides,
  };
}

function makeMcpServer(overrides: Partial<McpServerRecord> = {}): McpServerRecord {
  return {
    source: 'mcp',
    name: 'github',
    sourcePath: '/fake/.codex/config.toml',
    platform: 'codex',
    scope: 'project',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-github'],
    envKeys: ['GITHUB_TOKEN'],
    headerKeys: ['Authorization'],
    toolAllowlist: ['search_repositories'],
    toolDenylist: [],
    ...overrides,
  };
}

describe('estimateContextCost', () => {
  it('estimates Claude skill token tax from metadata instead of full skill body', () => {
    const root = tempRoot();
    const skillPath = join(root, '.claude', 'skills', 'large-body', 'SKILL.md');
    mkdirSync(join(root, '.claude', 'skills', 'large-body'), { recursive: true });
    writeFileSync(
      skillPath,
      [
        '---',
        'name: large-body',
        'description: Use for focused code review.',
        '---',
        '',
        'Full body content '.repeat(1000),
      ].join('\n'),
      'utf8',
    );

    const result = estimateContextCost([
      makeSkill({
        name: 'large-body',
        sourcePath: skillPath,
        description: 'Use for focused code review.',
      }),
    ]);

    expect(result.items[0]?.kind).toBe('claude-skill-description');
    expect(result.items[0]?.estimatedTokens).toBeLessThan(50);
  });

  it('estimates always-on single-file rules from raw file content', () => {
    const root = tempRoot();
    const agentsPath = join(root, 'AGENTS.md');
    const content = 'Always follow this project rule. '.repeat(80);
    writeFileSync(agentsPath, content, 'utf8');

    const result = estimateContextCost([
      makeSkill({
        name: 'AGENTS.md',
        sourcePath: agentsPath,
        platform: 'codex',
        description: 'Project instructions',
        triggers: [],
      }),
    ]);

    expect(result.items[0]?.kind).toBe('always-on-file');
    expect(result.items[0]?.estimatedTokens).toBe(estimateTokens(content));
    expect(result.summary.byPlatform).toEqual([
      expect.objectContaining({
        platform: 'codex',
        items: 1,
        estimatedTokens: estimateTokens(content),
        estimatedChars: content.trim().length,
        alwaysOnTokens: estimateTokens(content),
        startupSelectionTokens: 0,
        budgetTokens: 2000,
        overBudget: false,
      }),
    ]);
  });

  it('estimates non-Claude skill-dir agents from activation metadata', () => {
    const root = tempRoot();
    const skillPath = join(root, '.gemini', 'skills', 'large-body', 'SKILL.md');
    mkdirSync(dirname(skillPath), { recursive: true });
    writeFileSync(skillPath, 'Full Gemini body content. '.repeat(500), 'utf8');

    const result = estimateContextCost([
      makeSkill({
        name: 'large-body',
        sourcePath: skillPath,
        platform: 'gemini',
        description: 'Use for Gemini code review.',
        triggers: ['review code'],
      }),
    ]);

    expect(result.items[0]?.kind).toBe('agent-skill-description');
    expect(result.items[0]?.estimatedTokens).toBeLessThan(50);
  });

  it('estimates Cursor rule files from raw rule content', () => {
    const root = tempRoot();
    const rulePath = join(root, '.cursor', 'rules', 'review.mdc');
    const content = [
      '---',
      'description: Cursor review rule',
      'globs: ["**/*.ts"]',
      '---',
      '',
      'Follow this Cursor rule. '.repeat(60),
    ].join('\n');
    mkdirSync(dirname(rulePath), { recursive: true });
    writeFileSync(rulePath, content, 'utf8');

    const result = estimateContextCost([
      makeSkill({
        name: 'review',
        sourcePath: rulePath,
        platform: 'cursor',
        description: 'Cursor review rule',
        triggers: ['**/*.ts'],
      }),
    ]);

    expect(result.items[0]?.kind).toBe('cursor-rule-file');
    expect(result.items[0]?.estimatedTokens).toBe(0);
    expect(result.items[0]?.activationEstimatedTokens).toBe(estimateTokens(content));
    expect(result.items[0]?.activation).toBe('file-scoped');
    expect(result.items[0]?.budgetScope).toBe('activation');
  });

  it('estimates Copilot instruction files from raw instruction content', () => {
    const root = tempRoot();
    const instructionPath = join(root, '.github', 'instructions', 'security.instructions.md');
    const content = [
      '---',
      'applyTo: "**/*.ts"',
      '---',
      '',
      'Follow this Copilot security instruction. '.repeat(50),
    ].join('\n');
    mkdirSync(dirname(instructionPath), { recursive: true });
    writeFileSync(instructionPath, content, 'utf8');

    const result = estimateContextCost([
      makeSkill({
        name: 'security',
        sourcePath: instructionPath,
        platform: 'copilot',
        description: 'Copilot security instruction',
        triggers: ['**/*.ts'],
      }),
    ]);

    expect(result.items[0]?.kind).toBe('copilot-instruction-file');
    expect(result.items[0]?.estimatedTokens).toBe(0);
    expect(result.items[0]?.activationEstimatedTokens).toBe(estimateTokens(content));
    expect(result.items[0]?.activation).toBe('file-scoped');
    expect(result.items[0]?.budgetScope).toBe('activation');
  });

  it('estimates Copilot prompt files as manual activation context', () => {
    const root = tempRoot();
    const promptPath = join(root, '.github', 'prompts', 'review.prompt.md');
    const content = 'Review this change with #file:src/index.ts and summarize risks. '.repeat(20);
    mkdirSync(dirname(promptPath), { recursive: true });
    writeFileSync(promptPath, content, 'utf8');

    const result = estimateContextCost([
      makeSkill({
        name: 'review.prompt',
        sourcePath: promptPath,
        platform: 'copilot',
        description: 'Reusable review prompt',
        triggers: [],
      }),
    ]);

    expect(result.items[0]?.kind).toBe('copilot-prompt-file');
    expect(result.items[0]?.estimatedTokens).toBe(0);
    expect(result.items[0]?.activationEstimatedTokens).toBe(estimateTokens(content));
    expect(result.items[0]?.activation).toBe('manual');
    expect(result.items[0]?.budgetScope).toBe('none');
  });

  it('grades against the supplied budget and marks over-budget results', () => {
    const result = estimateContextCost(
      [
        makeSkill({
          description: 'A long description. '.repeat(100),
          triggers: [],
        }),
      ],
      { budgetTokens: 50 },
    );

    expect(result.summary.overBudget).toBe(true);
    expect(result.summary.grade).toBe('F');
  });

  it('applies per-platform budgets independently from the total budget', () => {
    const result = estimateContextCost(
      [
        makeSkill({
          sourcePath: '/fake/AGENTS.md',
          platform: 'codex',
          name: 'AGENTS.md',
          description: 'Codex instructions',
          triggers: [],
        }),
        makeSkill({
          description: 'A long description. '.repeat(100),
          triggers: [],
        }),
      ],
      { budgetTokens: 10000, platformBudgets: { claude: 50 } },
    );

    const claudeSummary = result.summary.byPlatform.find((entry) => entry.platform === 'claude');
    expect(claudeSummary).toEqual(expect.objectContaining({
      budgetTokens: 50,
      overBudget: true,
      grade: 'F',
    }));
    expect(result.summary.overBudget).toBe(true);
  });

  it('does not count Claude manual-only skills in startup budget', () => {
    const root = tempRoot();
    const skillPath = join(root, '.claude', 'skills', 'deploy', 'SKILL.md');
    mkdirSync(dirname(skillPath), { recursive: true });
    writeFileSync(
      skillPath,
      [
        '---',
        'name: deploy',
        'description: Deploy the app.',
        'disable-model-invocation: true',
        '---',
        '',
        'Deploy steps. '.repeat(100),
      ].join('\n'),
      'utf8',
    );

    const result = estimateContextCost([
      makeSkill({
        name: 'deploy',
        sourcePath: skillPath,
        description: 'Deploy the app.',
      }),
    ]);

    expect(result.items[0]).toEqual(expect.objectContaining({
      estimatedTokens: 0,
      activation: 'manual',
      budgetScope: 'none',
    }));
    expect(result.items[0]?.activationEstimatedTokens).toBeGreaterThan(0);
  });

  it('estimates MCP server token cost from discovered tools', () => {
    const server = makeMcpServer({
      toolDiscoveryStatus: 'ok',
      tools: [{
        name: 'search_repositories',
        description: 'Search GitHub repositories.',
        inputSchema: { type: 'object', properties: { query: { type: 'string' } } },
      }],
    });
    const result = estimateContextCost([server]);

    expect(result.items[0]).toEqual(expect.objectContaining({
      name: 'github',
      platform: 'codex',
      scope: 'project',
      source: 'mcp',
      kind: 'mcp-tool-list',
      estimatedTokens: estimateTokens(buildMcpConfigText(server)),
    }));
    expect(result.summary.byPlatform).toEqual([
      expect.objectContaining({ platform: 'codex', items: 1 }),
    ]);
  });

  it('reports inaccessible MCP servers without counting config tokens', () => {
    const result = estimateContextCost([
      makeMcpServer({
        toolDiscoveryStatus: 'failed',
        toolDiscoveryError: 'connection refused',
      }),
    ]);

    expect(result.items[0]).toEqual(expect.objectContaining({
      estimatedTokens: 0,
      recommendation: 'Unable to inspect MCP tools: connection refused',
    }));
  });
});
