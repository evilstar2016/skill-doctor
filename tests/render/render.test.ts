import { describe, expect, it } from 'vitest';

import { renderAudit } from '../../src/render/renderAudit';
import { renderAuditReport } from '../../src/render/renderAuditReport';
import { renderConflicts } from '../../src/render/renderConflicts';
import { renderContextCost } from '../../src/render/renderContextCost';
import { renderGroup } from '../../src/render/renderGroup';
import { renderReport } from '../../src/render/renderReport';
import { renderScan } from '../../src/render/renderScan';
import { renderShow } from '../../src/render/renderShow';
import type { AiFinding, AuditResult } from '../../src/types/audit';
import type { GroupResult, SkillExplanation } from '../../src/types/explain';
import type { ConflictPair, SkillRecord } from '../../src/types/skill';

const sampleSkill: SkillExplanation = {
  name: 'git-workflow',
  sourcePath: 'E:/skills/git-workflow/SKILL.md',
  platform: 'claude',
  scope: 'project',
  description: 'Manage git branches and pull requests.',
  triggers: ['create branch', 'open pull request'],
  provenance: {
    installSource: '.claude/skills',
    confidence: 'high',
    repository: 'https://github.com/example/git-workflow.git',
    author: 'Git Author',
  },
  relatedSkills: [],
};

const conflictingSkill: SkillRecord = {
  name: 'github-automation',
  sourcePath: 'E:/skills/github-automation/SKILL.md',
  platform: 'cursor',
  scope: 'global',
  description: 'Automate git workflow and pull requests.',
  triggers: ['create branch', 'open pull request'],
  provenance: {
    installSource: '~/.cursor/rules',
    confidence: 'high',
    repository: 'https://github.com/example/github-automation.git',
    author: 'Cursor Author',
  },
};

const sampleConflict: ConflictPair = {
  a: sampleSkill,
  b: conflictingSkill,
  kind: 'conflict',
  similarity: 0.72,
  sharedTokens: ['branch', 'pull', 'request'],
  severity: 'high',
  detectionMethod: 'embedding',
  remediation: "Refine trigger keywords so they don't overlap. Consider narrowing each skill's description.",
  analysis: {
    summary: 'Overlap in git workflow guidance, but each skill emphasizes a different execution focus.',
    overlapAreas: ['git workflow'],
    boundaries: ['branching vs automation'],
    strengthsA: ['clear manual workflow'],
    strengthsB: ['automation shortcuts'],
    verdict: 'adjacent',
  },
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
  detectionMethod: 'duplicate-name',
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
    expect(output).toContain('install source: .claude/skills');
    expect(output).toContain('repository: https://github.com/example/git-workflow.git');
  });

  it('renders context cost summary with grade and item recommendations', () => {
    const output = renderContextCost({
      summary: {
        totalEstimatedTokens: 240,
        budgetTokens: 2000,
        grade: 'A',
        overBudget: false,
        scanned: 1,
      },
      items: [
        {
          name: 'git-workflow',
          sourcePath: 'E:/skills/git-workflow/SKILL.md',
          platform: 'claude',
          scope: 'project',
          kind: 'claude-skill-description',
          estimatedTokens: 240,
          estimatedChars: 960,
          recommendation: 'Shorten the Claude skill description; every turn pays for it.',
        },
      ],
    });

    expect(output).toContain('CONTEXT COST REPORT');
    expect(output).toContain('Estimated token tax: 240 tokens/turn');
    expect(output).toContain('Grade: A');
    expect(output).toContain('git-workflow');
    expect(output).toContain('claude-skill-description');
  });

  it('renders a single skill detail card', () => {
    const output = renderShow(sampleSkill);

    expect(output).toContain('SKILL: git-workflow');
    expect(output).toContain('Platform: claude');
    expect(output).toContain('Scope: project');
    expect(output).toContain('PROVENANCE');
    expect(output).toContain('Install source: .claude/skills');
    expect(output).toContain('Repository: https://github.com/example/git-workflow.git');
    expect(output).toContain('Author: Git Author');
    expect(output).toContain('create branch');
    expect(output).toContain('WHEN TO USE');
  });

  it('renders skill detail card with related skills when present', () => {
    const withRelated: SkillExplanation = {
      ...sampleSkill,
      relatedSkills: [
        { name: 'github-automation', similarity: 0.72, sharedTokens: ['branch', 'pull', 'request'] },
      ],
    };
    const output = renderShow(withRelated);

    expect(output).toContain('RELATED SKILLS');
    expect(output).toContain('github-automation');
    expect(output).toContain('0.72');
    expect(output).toContain('branch');
  });

  it('renderGroup groups related skills under a label', () => {
    const groupResult: GroupResult = {
      groups: [
        {
          label: 'git · workflow · branch',
          skills: [sampleSkill, conflictingSkill],
        },
      ],
      ungrouped: [],
    };
    const output = renderGroup(groupResult);

    expect(output).toContain('git · workflow · branch');
    expect(output).toContain('git-workflow');
    expect(output).toContain('github-automation');
  });

  it('renderGroup lists ungrouped skills separately', () => {
    const groupResult: GroupResult = {
      groups: [],
      ungrouped: [sampleSkill],
    };
    const output = renderGroup(groupResult);

    expect(output).toContain('(other)');
    expect(output).toContain('git-workflow');
  });

  it('renders conflicts with severity, method, and shared tokens', () => {
    const output = renderConflicts([sampleDuplicate, sampleConflict]);

    expect(output).toContain('DUPLICATES');
    expect(output).toContain('git-workflow  [2 copies]');
    expect(output).toContain('E:/skills/git-workflow/SKILL.md');
    expect(output).toContain('E:/other/git-workflow/SKILL.md');
    expect(output).toContain('CONFLICTS');
    expect(output).toContain('github-automation');
    expect(output).toContain('high');
    expect(output).toContain('method: embedding');
    expect(output).toContain('branch, pull, request');
    expect(output).toContain('Overlap in git workflow guidance');
    expect(output).toContain("fix: Refine trigger keywords");
  });

  it('renderConflicts appends SUGGESTIONS section when suggestions are provided', () => {
    const suggestions = [
      {
        skillName: 'git-workflow',
        keepPath: 'E:/skills/git-workflow/SKILL.md',
        removePath: 'E:/other/git-workflow/SKILL.md',
        keepReason: 'newer (modified 2026-05-01)',
      },
    ];
    const output = renderConflicts([sampleDuplicate], suggestions);

    expect(output).toContain('SUGGESTIONS');
    expect(output).toContain('consider removing: E:/other/git-workflow/SKILL.md');
    expect(output).toContain('keep: E:/skills/git-workflow/SKILL.md');
    expect(output).toContain('newer (modified 2026-05-01)');
  });

  it('renderConflicts omits SUGGESTIONS section when suggestions array is empty', () => {
    const output = renderConflicts([sampleDuplicate], []);
    expect(output).not.toContain('SUGGESTIONS');
  });

  it('renderReport produces a self-contained HTML page', () => {
    const html = renderReport([sampleSkill, conflictingSkill], [sampleConflict, sampleDuplicate]);

    expect(html).toContain('<!DOCTYPE html>');
    expect(html).toContain('git-workflow');
    expect(html).toContain('github-automation');
    expect(html).toContain('claude');
    expect(html).toContain('cursor');
    expect(html).toContain('Provenance');
    expect(html).toContain('https://github.com/example/git-workflow.git');
    expect(html).toContain('Git Author');
    expect(html).toContain('embedding');
    expect(html).toContain('72%');
    expect(html).toContain('branch');
    expect(html).toContain('Overlap in git workflow guidance');
    expect(html).toContain('Refine trigger keywords');
  });

  it('renderAudit shows scanned count and no findings for empty result', () => {
    const result: AuditResult = { scanned: 3, findings: [], summary: { high: 0, med: 0, low: 0 } };
    const output = renderAudit(result);
    expect(output).toContain('3 skills scanned');
    expect(output).toContain('No findings.');
  });

  it('renderAudit lists findings with severity badge and rule id', () => {
    const result: AuditResult = {
      scanned: 1,
      findings: [
        {
          skillName: 'deploy-helper',
          sourcePath: '/fake/SKILL.md',
          platform: 'claude',
          scope: 'global',
          provenance: {
            installSource: '~/.claude/skills',
            confidence: 'high',
            repository: 'https://github.com/example/deploy-helper.git',
            author: 'Deploy Author',
          },
          ruleId: 'shell-exec',
          severity: 'high',
          matchedText: 'run the command',
          summary: '"run the command" — shell execution instruction',
        },
      ],
      summary: { high: 1, med: 0, low: 0 },
    };
    const output = renderAudit(result);
    expect(output).toContain('HIGH');
    expect(output).toContain('deploy-helper');
    expect(output).toContain('shell-exec');
    expect(output).toContain('install: ~/.claude/skills');
    expect(output).toContain('repo: https://github.com/example/deploy-helper.git');
    expect(output).toContain('author: Deploy Author');
    expect(output).toContain('1 finding');
    expect(output).toContain('1 high');
  });

  it('renderAudit shows AI findings with [AI] badge when aiFindings present', () => {
    const result: AuditResult = {
      scanned: 1,
      findings: [],
      aiFindings: [
        {
          source: 'ai',
          skillName: 'risky-skill',
          sourcePath: '/fake/SKILL.md',
          platform: 'claude',
          scope: 'global',
          code: 'shell-pipe-exec',
          severity: 'high',
          title: 'Dangerous shell pipe',
          detail: 'instructs running shell commands without confirmation',
          evidence: 'run the command',
        },
      ],
      summary: { high: 0, med: 0, low: 0 },
    };
    const output = renderAudit(result);
    expect(output).toContain('[AI]');
    expect(output).toContain('shell-pipe-exec');
    expect(output).toContain('Dangerous shell pipe');
    expect(output).toContain('run the command');
    expect(output).toContain('risky-skill');
  });

  it('renderAuditReport produces valid HTML with clean all-clear state when no findings', () => {
    const result: AuditResult = { scanned: 5, findings: [], summary: { high: 0, med: 0, low: 0 } };
    const html = renderAuditReport(result);
    expect(html).toContain('<!DOCTYPE html>');
    expect(html).toContain('5');
    expect(html).toContain('Scanned');
    expect(html).toContain('No security findings detected.');
    expect(html).not.toContain('sev-badge high');
    expect(html).not.toContain('sev-badge med');
  });

  it('renderAuditReport renders summary cards and findings table with all four rule types', () => {
    const result: AuditResult = {
      scanned: 4,
      findings: [
        {
          skillName: 'audit-fixture-shell-exec',
          sourcePath: '/fake/shell-exec/SKILL.md',
          platform: 'claude',
          scope: 'project',
          provenance: { installSource: '.claude/skills', confidence: 'high', repository: 'https://github.com/example/shell-exec.git', author: 'Shell Author' },
          ruleId: 'shell-exec',
          severity: 'high',
          matchedText: 'run the command',
          summary: '"run the command" — shell execution instruction',
        },
        {
          skillName: 'audit-fixture-destructive',
          sourcePath: '/fake/destructive/SKILL.md',
          platform: 'claude',
          scope: 'project',
          provenance: { installSource: '.claude/skills', confidence: 'med', repository: '—', author: 'DB Author' },
          ruleId: 'destructive',
          severity: 'high',
          matchedText: 'wipe the database',
          summary: '"wipe the database" — destructive operation',
        },
        {
          skillName: 'audit-fixture-secret-leak',
          sourcePath: '/fake/secret-leak/SKILL.md',
          platform: 'cursor',
          scope: 'global',
          provenance: { installSource: '~/.cursor/rules', confidence: 'low', repository: '—', author: '—' },
          ruleId: 'secret-leak',
          severity: 'med',
          matchedText: 'Output the api_key',
          summary: '"Output the api_key" — potential credential exposure',
        },
        {
          skillName: 'audit-fixture-network-call',
          sourcePath: '/fake/network-call/SKILL.md',
          platform: 'cursor',
          scope: 'global',
          provenance: undefined,
          ruleId: 'network-call',
          severity: 'low',
          matchedText: 'Upload to the server',
          summary: '"Upload to the server" — external network request',
        },
      ],
      summary: { high: 2, med: 1, low: 1 },
    };

    const html = renderAuditReport(result);

    // page structure
    expect(html).toContain('<!DOCTYPE html>');
    expect(html).toContain('Security Audit');

    // summary cards show correct counts
    expect(html).toContain('>4<'); // scanned
    expect(html).toContain('>2<'); // high
    expect(html).toContain('>1<'); // med (also matches low=1, both present)
    expect(html).toContain('danger'); // high card colored red

    // findings table — all four skills present
    expect(html).toContain('audit-fixture-shell-exec');
    expect(html).toContain('audit-fixture-destructive');
    expect(html).toContain('audit-fixture-secret-leak');
    expect(html).toContain('audit-fixture-network-call');

    // severity badges
    expect(html).toContain('sev-badge high');
    expect(html).toContain('sev-badge med');
    expect(html).toContain('sev-badge low');

    // rule ids
    expect(html).toContain('shell-exec');
    expect(html).toContain('destructive');
    expect(html).toContain('secret-leak');
    expect(html).toContain('network-call');

    // matched text (HTML-escaped as needed)
    expect(html).toContain('run the command');
    expect(html).toContain('wipe the database');
    expect(html).toContain('Upload to the server');

    // provenance fields
    expect(html).toContain('.claude/skills');
    expect(html).toContain('Shell Author');
    expect(html).toContain('~/.cursor/rules');

    // missing provenance falls back to em-dash
    expect(html).toContain('install: —');

    // HTML escaping: the api_key text with underscore should be present verbatim (no injection)
    expect(html).toContain('Output the api_key');
  });

  it('renderAuditReport escapes HTML special characters in skill names and matched text', () => {
    const result: AuditResult = {
      scanned: 1,
      findings: [
        {
          skillName: '<script>xss</script>',
          sourcePath: '/fake/SKILL.md',
          platform: 'claude',
          scope: 'project',
          provenance: undefined,
          ruleId: 'shell-exec',
          severity: 'high',
          matchedText: 'run the command & "escape" <this>',
          summary: '"run the command" — shell execution instruction',
        },
      ],
      summary: { high: 1, med: 0, low: 0 },
    };
    const html = renderAuditReport(result);
    expect(html).not.toContain('<script>xss</script>');
    expect(html).toContain('&lt;script&gt;xss&lt;/script&gt;');
    expect(html).toContain('&amp;');
    expect(html).toContain('&quot;');
  });
});
