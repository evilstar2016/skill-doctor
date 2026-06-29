import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { estimateContextCost, estimateTokens } from '../../src/context/estimateContextCost';
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
});
