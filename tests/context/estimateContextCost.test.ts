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
    expect(result.items[0]?.officialLimit).toEqual({
      kind: 'chars',
      value: 1536,
      appliesTo: 'combined description and when_to_use skill listing',
    });
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

  it('estimates Codex skill entries from path-aware metadata with the official skill list limit', () => {
    const skillPath = '/fake/.codex/skills/review-helper/SKILL.md';
    const result = estimateContextCost([
      makeSkill({
        name: 'review-helper',
        sourcePath: skillPath,
        platform: 'codex',
        description: 'Use for Codex code review.',
        triggers: ['review code'],
      }),
    ]);

    const metadataText = [
      'Skill: review-helper',
      'Description: Use for Codex code review.',
      'Triggers: review code',
      `Path: ${skillPath}`,
    ].join('\n');
    const item = result.items.find((entry) => entry.name === 'review-helper');
    expect(item).toEqual(expect.objectContaining({
      kind: 'agent-skill-description',
      estimatedTokens: estimateTokens(metadataText),
      officialLimit: {
        kind: 'chars',
        value: 8000,
        appliesTo: 'initial skill list when context window is unknown',
      },
    }));
  });

  it('adds capped Codex skill-list aggregate while preserving per-skill metadata items', () => {
    const skills = Array.from({ length: 24 }, (_, index) => makeSkill({
      name: `codex-helper-${index}`,
      sourcePath: `/fake/.codex/skills/codex-helper-${index}/SKILL.md`,
      platform: 'codex',
      description: `Use for Codex task ${index}. ${'Detailed metadata. '.repeat(80)}`,
      triggers: [`task-${index}`],
      context: {
        resource: 'skill',
        enabled: true,
        controllable: true,
        controlPath: '/fake/.codex/config.toml',
        controlMethod: 'skills.config',
        estimateStatus: 'estimated',
      },
    }));

    const result = estimateContextCost(skills, { projectPath: '/fake' });
    const aggregate = result.items.find((item) => item.kind === 'codex-skill-list');
    const members = result.items.filter((item) => item.kind === 'agent-skill-description');

    expect(members).toHaveLength(24);
    expect(members[0]).toEqual(expect.objectContaining({
      resource: 'skill',
      enabled: true,
      controllable: true,
      controlPath: '/fake/.codex/config.toml',
      controlMethod: 'skills.config',
      estimateStatus: 'estimated',
    }));
    expect(aggregate).toEqual(expect.objectContaining({
      id: 'codex:skill-list:enabled',
      kind: 'codex-skill-list',
      resource: 'skill',
      estimatedTokens: estimateTokens('x'.repeat(8000)),
      estimatedChars: 8000,
      officialLimit: {
        kind: 'chars',
        value: 8000,
        appliesTo: 'combined Codex skill list, capped at 2% of context or 8000 chars when context window is unknown',
      },
    }));
    expect(result.summary.totalEstimatedTokens).toBe(aggregate?.estimatedTokens);
  });

  it('keeps disabled Codex resources out of active totals and reports disabled aggregate tax', () => {
    const enabledSkill = makeSkill({
      name: 'enabled-codex',
      sourcePath: '/fake/.codex/skills/enabled-codex/SKILL.md',
      platform: 'codex',
      description: 'Enabled Codex skill.',
      triggers: [],
      context: { resource: 'skill', enabled: true, estimateStatus: 'estimated' },
    });
    const disabledSkill = makeSkill({
      name: 'disabled-codex',
      sourcePath: '/fake/.codex/skills/disabled-codex/SKILL.md',
      platform: 'codex',
      description: 'Disabled Codex skill.',
      triggers: [],
      context: { resource: 'skill', enabled: false, estimateStatus: 'estimated' },
    });

    const result = estimateContextCost([enabledSkill, disabledSkill], { projectPath: '/fake' });
    const enabledAggregate = result.items.find((item) => item.id === 'codex:skill-list:enabled');
    const disabledAggregate = result.items.find((item) => item.id === 'codex:skill-list:disabled');

    expect(enabledAggregate?.estimatedTokens).toBeGreaterThan(0);
    expect(disabledAggregate).toEqual(expect.objectContaining({
      enabled: false,
      kind: 'codex-skill-list',
    }));
    expect(result.summary.totalEstimatedTokens).toBe(enabledAggregate?.estimatedTokens);
    expect(result.summary.disabledEstimatedTokens).toBe(disabledAggregate?.estimatedTokens);
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

  it('applies Windsurf rule trigger activation and budget semantics', () => {
    const root = tempRoot();
    const cases = [
      {
        fileName: 'model.md',
        trigger: 'model_decision',
        activation: 'startup',
        budgetScope: 'startup-selection',
        estimatedTokens: () => estimateTokens('Skill: model\nDescription: Windsurf model_decision rule'),
        activationEstimatedTokens: (content: string) => estimateTokens(content),
      },
      {
        fileName: 'glob.md',
        trigger: 'glob',
        activation: 'file-scoped',
        budgetScope: 'activation',
        estimatedTokens: () => 0,
        activationEstimatedTokens: (content: string) => estimateTokens(content),
      },
      {
        fileName: 'manual.md',
        trigger: 'manual',
        activation: 'manual',
        budgetScope: 'none',
        estimatedTokens: () => 0,
        activationEstimatedTokens: (content: string) => estimateTokens(content),
      },
    ] as const;

    for (const testCase of cases) {
      const rulePath = join(root, '.windsurf', 'rules', testCase.fileName);
      const content = [
        '---',
        `trigger: ${testCase.trigger}`,
        '---',
        '',
        `Follow this Windsurf ${testCase.trigger} rule. `.repeat(30),
      ].join('\n');
      mkdirSync(dirname(rulePath), { recursive: true });
      writeFileSync(rulePath, content, 'utf8');

      const result = estimateContextCost([
        makeSkill({
          name: testCase.fileName.replace('.md', ''),
          sourcePath: rulePath,
          platform: 'windsurf',
          description: `Windsurf ${testCase.trigger} rule`,
          triggers: [],
        }),
      ]);

      expect(result.items[0]).toEqual(expect.objectContaining({
        kind: 'always-on-file',
        activation: testCase.activation,
        budgetScope: testCase.budgetScope,
        estimatedTokens: testCase.estimatedTokens(content),
        activationEstimatedTokens: testCase.activationEstimatedTokens(content),
      }));
    }
  });

  it('uses the default cost policy for unknown custom platforms', () => {
    const root = tempRoot();
    const skillPath = join(root, 'custom', 'skills', 'helper', 'SKILL.md');
    const rulePath = join(root, 'custom', 'ALWAYS.md');
    const alwaysOnContent = 'Custom platform always-on guidance. '.repeat(20);
    mkdirSync(dirname(skillPath), { recursive: true });
    writeFileSync(skillPath, 'Custom skill body. '.repeat(100), 'utf8');
    writeFileSync(rulePath, alwaysOnContent, 'utf8');

    const result = estimateContextCost([
      makeSkill({
        name: 'helper',
        sourcePath: skillPath,
        platform: 'unknown',
        description: 'Custom helper metadata.',
        triggers: ['custom trigger'],
      }),
      makeSkill({
        name: 'ALWAYS.md',
        sourcePath: rulePath,
        platform: 'unknown',
        description: 'Custom always-on rule.',
        triggers: [],
      }),
    ]);

    expect(result.items).toEqual([
      expect.objectContaining({
        name: 'ALWAYS.md',
        kind: 'always-on-file',
        activation: 'always-on',
        budgetScope: 'always-on',
        estimatedTokens: estimateTokens(alwaysOnContent),
      }),
      expect.objectContaining({
        name: 'helper',
        kind: 'agent-skill-description',
        activation: 'startup',
        budgetScope: 'startup-selection',
      }),
    ]);
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

  it('estimates plugin MCP tools separately and keeps disabled plugin MCP out of totals', () => {
    const enabledPluginMcp = makeMcpServer({
      id: 'codex:plugin:github@openai-curated:mcp:github',
      name: 'github',
      sourcePath: '/fake/.codex/plugins/github/.mcp.json',
      toolDiscoveryStatus: 'ok',
      tools: [{
        name: 'issues.search',
        description: 'Search GitHub issues.',
      }],
      context: {
        resource: 'plugin',
        configSource: '/fake/.codex/plugins/github/.codex-plugin/plugin.json',
        enabled: true,
        controllable: true,
        controlPath: '/fake/.codex/config.toml',
        controlMethod: 'plugins.github@openai-curated.enabled',
        estimateStatus: 'estimated',
      },
    });
    const disabledPluginMcp = makeMcpServer({
      ...enabledPluginMcp,
      id: 'codex:plugin:github@openai-curated:mcp:disabled-github',
      name: 'disabled-github',
      context: {
        ...enabledPluginMcp.context!,
        enabled: false,
      },
    });

    const result = estimateContextCost([enabledPluginMcp, disabledPluginMcp]);
    const enabled = result.items.find((item) => item.id === enabledPluginMcp.id);
    const disabled = result.items.find((item) => item.id === disabledPluginMcp.id);

    expect(enabled).toEqual(expect.objectContaining({
      source: 'plugin',
      resource: 'plugin',
      kind: 'plugin-mcp-tool-list',
      enabled: true,
      configSource: '/fake/.codex/plugins/github/.codex-plugin/plugin.json',
    }));
    expect(disabled).toEqual(expect.objectContaining({
      kind: 'plugin-mcp-tool-list',
      enabled: false,
    }));
    expect(result.summary.totalEstimatedTokens).toBe(enabled?.estimatedTokens);
    expect(result.summary.disabledEstimatedTokens).toBe(disabled?.estimatedTokens);
  });
});
