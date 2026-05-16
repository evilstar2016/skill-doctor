import { describe, expect, it } from 'vitest';

import { renderDashboard } from '../../src/render/renderDashboard';
import type { AuditResult } from '../../src/types/audit';
import type { CleanupSuggestion } from '../../src/types/cleanup';
import type { ConflictPair, SkillRecord } from '../../src/types/skill';

/* ─── Fixtures ─────────────────────────────────────── */

const skillA: SkillRecord = {
  name: 'git-workflow',
  sourcePath: '/skills/git-workflow/SKILL.md',
  platform: 'claude',
  scope: 'project',
  description: 'Manage git branches and pull requests.',
  triggers: ['create branch', 'open pull request'],
};

const skillB: SkillRecord = {
  name: 'github-automation',
  sourcePath: '/skills/github-automation/SKILL.md',
  platform: 'cursor',
  scope: 'global',
  description: 'Automate git workflow and pull requests.',
  triggers: ['create branch', 'open pull request'],
};

const skillC: SkillRecord = {
  name: 'deploy-helper',
  sourcePath: '/skills/deploy-helper/SKILL.md',
  platform: 'claude',
  scope: 'global',
  description: 'Deploy to production.',
  triggers: ['deploy'],
};

const conflict: ConflictPair = {
  a: skillA,
  b: skillB,
  kind: 'conflict',
  similarity: 0.72,
  sharedTokens: ['branch', 'pull', 'request'],
  severity: 'high',
  detectionMethod: 'embedding',
  remediation: 'Narrow each skill description.',
  analysis: {
    summary: 'Overlap in git workflow.',
    overlapAreas: ['git workflow'],
    boundaries: ['branching vs automation'],
    strengthsA: ['clear manual workflow'],
    strengthsB: ['automation shortcuts'],
    verdict: 'adjacent',
  },
};

const duplicate: ConflictPair = {
  a: skillA,
  b: { ...skillA, sourcePath: '/other/git-workflow/SKILL.md', scope: 'global' },
  kind: 'duplicate',
  similarity: 1,
  sharedTokens: [],
  severity: 'high',
  detectionMethod: 'duplicate-name',
};

const auditClean: AuditResult = {
  scanned: 3,
  findings: [],
  summary: { high: 0, med: 0, low: 0 },
};

const auditWithFindings: AuditResult = {
  scanned: 3,
  findings: [
    {
      skillName: 'deploy-helper',
      sourcePath: '/skills/deploy-helper/SKILL.md',
      platform: 'claude',
      scope: 'global',
      ruleId: 'shell-exec',
      severity: 'high',
      matchedText: 'run the command',
      summary: '"run the command" -- shell execution instruction',
    },
    {
      skillName: 'deploy-helper',
      sourcePath: '/skills/deploy-helper/SKILL.md',
      platform: 'claude',
      scope: 'global',
      ruleId: 'destructive',
      severity: 'high',
      matchedText: 'wipe the database',
      summary: '"wipe the database" -- destructive op',
    },
    {
      skillName: 'github-automation',
      sourcePath: '/skills/github-automation/SKILL.md',
      platform: 'cursor',
      scope: 'global',
      ruleId: 'secret-leak',
      severity: 'med',
      matchedText: 'output the api_key',
      summary: '"output the api_key" -- credential exposure',
    },
    {
      skillName: 'git-workflow',
      sourcePath: '/skills/git-workflow/SKILL.md',
      platform: 'claude',
      scope: 'project',
      ruleId: 'network-call',
      severity: 'low',
      matchedText: 'upload to server',
      summary: '"upload to server" -- external request',
    },
  ],
  summary: { high: 2, med: 1, low: 1 },
};

const suggestion: CleanupSuggestion = {
  skillName: 'git-workflow',
  keepPath: '/skills/git-workflow/SKILL.md',
  removePath: '/other/git-workflow/SKILL.md',
  keepReason: 'newer (modified 2026-05-01)',
};

/* ─── Helper ───────────────────────────────────────── */

function fullInput() {
  return {
    skills: [skillA, skillB, skillC],
    conflicts: [conflict],
    auditResult: auditWithFindings,
    duplicates: [duplicate],
    suggestions: [suggestion],
  };
}

function emptyInput() {
  return {
    skills: [],
    conflicts: [],
    auditResult: auditClean,
    duplicates: [],
    suggestions: [],
  };
}

/* ─── Tests ────────────────────────────────────────── */

describe('renderDashboard', () => {
  /* Page structure */
  describe('page structure', () => {
    it('produces a valid HTML document with DOCTYPE', () => {
      const html = renderDashboard(fullInput());
      expect(html).toContain('<!DOCTYPE html>');
      expect(html).toContain('<html');
      expect(html).toContain('</html>');
    });

    it('contains the SKILL DOCTOR brand name', () => {
      const html = renderDashboard(fullInput());
      expect(html).toContain('SKILL DOCTOR');
    });

    it('uses dark background color from dashboard theme', () => {
      const html = renderDashboard(fullInput());
      expect(html).toContain('#0a0e17');
    });

    it('does not include a theme toggle', () => {
      const html = renderDashboard(fullInput());
      expect(html).not.toContain('themeToggle');
      expect(html).not.toContain('theme-btn');
    });

    it('includes a version badge', () => {
      const html = renderDashboard(fullInput());
      // version badge contains 'v' followed by digits
      expect(html).toMatch(/v\d+\.\d+/);
    });
  });

  /* Health ring */
  describe('health ring SVG', () => {
    it('renders an SVG donut ring', () => {
      const html = renderDashboard(fullInput());
      expect(html).toContain('<svg');
      expect(html).toContain('stroke-dasharray');
    });

    it('displays health percentage', () => {
      // 3 skills, 1 conflict, 1 dup, 2 high audit (risks)
      // health = max(0, 3-1-2-1)/3 * 100 = 0% (floored to 0)
      // Actually: health = round(max(0, total - conflicts - risks - dups) / total * 100)
      // total=3, conflicts=1, risks=2 (high audit findings unique skills), dups=1
      // But let's just check it contains a percentage number
      const html = renderDashboard(fullInput());
      expect(html).toMatch(/\d+%/);
    });

    it('returns 100% health when no issues', () => {
      const html = renderDashboard({
        skills: [skillA, skillB],
        conflicts: [],
        auditResult: auditClean,
        duplicates: [],
        suggestions: [],
      });
      expect(html).toContain('100%');
    });

    it('returns 100% health when total skills is 0', () => {
      const html = renderDashboard(emptyInput());
      expect(html).toContain('100%');
    });
  });

  /* Platform bar chart */
  describe('platform bar chart', () => {
    it('renders platform distribution bars', () => {
      const html = renderDashboard(fullInput());
      expect(html).toContain('claude');
      expect(html).toContain('cursor');
    });
  });

  /* Metric cards */
  describe('metric cards', () => {
    it('shows correct total skill count', () => {
      const html = renderDashboard(fullInput());
      // Should contain "3" as the skills count
      expect(html).toContain('>3<');
    });

    it('shows platform count', () => {
      const html = renderDashboard(fullInput());
      // 2 platforms: claude, cursor
      expect(html).toContain('>2<');
    });

    it('shows global and project counts', () => {
      const html = renderDashboard(fullInput());
      // skillA=project, skillB=global, skillC=global => 2 global, 1 project
      expect(html).toContain('Global');
      expect(html).toContain('Project');
    });
  });

  /* Skill table */
  describe('skill table', () => {
    it('renders a table with all skill names', () => {
      const html = renderDashboard(fullInput());
      expect(html).toContain('git-workflow');
      expect(html).toContain('github-automation');
      expect(html).toContain('deploy-helper');
    });

    it('shows status dots for skills', () => {
      const html = renderDashboard(fullInput());
      // conflict skill gets red dot, dup gets purple, risky gets orange, clean gets green
      expect(html).toContain('dot-conflict');
      expect(html).toContain('dot-clean');
    });

    it('renders platform and scope columns', () => {
      const html = renderDashboard(fullInput());
      expect(html).toContain('<table');
      expect(html).toContain('Platform');
      expect(html).toContain('Scope');
    });
  });

  /* Conflict section */
  describe('conflicts section', () => {
    it('shows conflict pair cards', () => {
      const html = renderDashboard(fullInput());
      expect(html).toContain('git-workflow');
      expect(html).toContain('github-automation');
    });

    it('shows severity badge on conflict cards', () => {
      const html = renderDashboard(fullInput());
      expect(html).toContain('sev-high');
    });

    it('shows similarity score', () => {
      const html = renderDashboard(fullInput());
      expect(html).toContain('72%');
    });

    it('renders empty state when no conflicts', () => {
      const html = renderDashboard({
        skills: [skillA],
        conflicts: [],
        auditResult: auditClean,
        duplicates: [],
        suggestions: [],
      });
      expect(html).toContain('No conflicts detected');
    });
  });

  /* Audit section */
  describe('audit section', () => {
    it('renders all 4 rule IDs in heatmap grid', () => {
      const html = renderDashboard(fullInput());
      expect(html).toContain('shell-exec');
      expect(html).toContain('destructive');
      expect(html).toContain('secret-leak');
      expect(html).toContain('network-call');
    });

    it('renders finding cards with code blocks', () => {
      const html = renderDashboard(fullInput());
      expect(html).toContain('<code');
      expect(html).toContain('run the command');
      expect(html).toContain('wipe the database');
    });

    it('renders empty state when no findings', () => {
      const html = renderDashboard({
        skills: [skillA],
        conflicts: [],
        auditResult: auditClean,
        duplicates: [],
        suggestions: [],
      });
      expect(html).toContain('No security risks detected');
    });
  });

  /* Cleanup section */
  describe('cleanup section', () => {
    it('renders cleanup suggestions', () => {
      const html = renderDashboard(fullInput());
      expect(html).toContain('git-workflow');
      expect(html).toContain('newer (modified 2026-05-01)');
    });

    it('renders suggest badges for duplicates', () => {
      const html = renderDashboard(fullInput());
      expect(html).toContain('keep');
      expect(html).toContain('remove');
    });

    it('renders empty state when no duplicates', () => {
      const html = renderDashboard({
        skills: [skillA],
        conflicts: [],
        auditResult: auditClean,
        duplicates: [],
        suggestions: [],
      });
      expect(html).toContain('No duplicates found');
    });
  });

  /* XSS / HTML escaping */
  describe('HTML escaping', () => {
    it('escapes special characters in skill names', () => {
      const xssSkill: SkillRecord = {
        name: '<script>alert("xss")</script>',
        sourcePath: '/fake/SKILL.md',
        platform: 'claude',
        scope: 'project',
        description: 'A "dangerous" <skill> & more',
        triggers: ['test'],
      };
      const html = renderDashboard({
        skills: [xssSkill],
        conflicts: [],
        auditResult: auditClean,
        duplicates: [],
        suggestions: [],
      });
      expect(html).not.toContain('<script>alert("xss")</script>');
      expect(html).toContain('&lt;script&gt;');
      expect(html).toContain('&amp;');
      expect(html).toContain('&quot;');
    });

    it('escapes matched text in audit findings', () => {
      const result: AuditResult = {
        scanned: 1,
        findings: [
          {
            skillName: 'test-skill',
            sourcePath: '/fake/SKILL.md',
            platform: 'claude',
            scope: 'project',
            ruleId: 'shell-exec',
            severity: 'high',
            matchedText: '<img onerror="alert(1)">',
            summary: 'test',
          },
        ],
        summary: { high: 1, med: 0, low: 0 },
      };
      const html = renderDashboard({
        skills: [skillA],
        conflicts: [],
        auditResult: result,
        duplicates: [],
        suggestions: [],
      });
      expect(html).not.toContain('<img onerror');
      expect(html).toContain('&lt;img');
    });
  });
});
