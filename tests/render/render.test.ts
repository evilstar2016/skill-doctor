import { describe, expect, it } from 'vitest';

import { renderConflicts } from '../../src/render/renderConflicts';
import { renderReport } from '../../src/render/renderReport';
import { renderScan } from '../../src/render/renderScan';
import { renderShow } from '../../src/render/renderShow';
import type { ConflictPair, SkillRecord } from '../../src/types/skill';

const sampleSkill: SkillRecord = {
  name: 'git-workflow',
  sourcePath: 'E:/skills/git-workflow/SKILL.md',
  platform: 'claude',
  scope: 'project',
  description: 'Manage git branches and pull requests.',
  triggers: ['create branch', 'open pull request'],
};

const conflictingSkill: SkillRecord = {
  name: 'github-automation',
  sourcePath: 'E:/skills/github-automation/SKILL.md',
  platform: 'cursor',
  scope: 'global',
  description: 'Automate git workflow and pull requests.',
  triggers: ['create branch', 'open pull request'],
};

const sampleConflict: ConflictPair = {
  a: sampleSkill,
  b: conflictingSkill,
  kind: 'conflict',
  similarity: 0.72,
  sharedTokens: ['branch', 'pull', 'request'],
  severity: 'high',
};

const sampleDuplicate: ConflictPair = {
  a: sampleSkill,
  b: {
    ...sampleSkill,
    sourcePath: 'E:/other/git-workflow/SKILL.md',
    scope: 'global',
  },
  kind: 'duplicate',
  similarity: 1,
  sharedTokens: [],
  severity: 'high',
};

describe('renderers', () => {
  it('renders scan summary with totals and platform names', () => {
    const output = renderScan([sampleSkill, conflictingSkill], [sampleConflict, sampleDuplicate]);

    expect(output).toContain('SKILL DOCTOR REPORT');
    expect(output).toContain('Total skills installed: 2');
    expect(output).toContain('Duplicates detected: 1');
    expect(output).toContain('Conflicts detected: 1');
    expect(output).toContain('claude');
    expect(output).toContain('cursor');
  });

  it('renders a single skill detail card', () => {
    const output = renderShow(sampleSkill);

    expect(output).toContain('SKILL: git-workflow');
    expect(output).toContain('Platform: claude');
    expect(output).toContain('Scope: project');
    expect(output).toContain('create branch');
  });

  it('renders conflicts with severity and shared tokens', () => {
    const output = renderConflicts([sampleDuplicate, sampleConflict]);

    expect(output).toContain('DUPLICATES');
    expect(output).toContain('E:/other/git-workflow/SKILL.md');
    expect(output).toContain('CONFLICTS');
    expect(output).toContain('git-workflow');
    expect(output).toContain('github-automation');
    expect(output).toContain('high');
    expect(output).toContain('branch, pull, request');
  });

  it('renderReport produces a self-contained HTML page', () => {
    const html = renderReport([sampleSkill, conflictingSkill], [sampleConflict, sampleDuplicate]);

    expect(html).toContain('<!DOCTYPE html>');
    expect(html).toContain('git-workflow');
    expect(html).toContain('github-automation');
    expect(html).toContain('claude');
    expect(html).toContain('cursor');
    expect(html).toContain('72%');
    expect(html).toContain('branch');
  });
});