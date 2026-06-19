import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { runAudit } from '../../src/audit/runAudit';
import { detectConflicts } from '../../src/conflicts/detectConflicts';
import { scanSkills } from '../../src/discovery/scanSkills';

const demoDir = join(process.cwd(), 'examples', 'conflicted-agent-project');

describe('conflicted agent project example', () => {
  it('demonstrates scan, conflict, and audit findings', async () => {
    const skills = (await scanSkills(demoDir)).filter((skill) => skill.sourcePath.startsWith(demoDir));

    expect(skills.map((skill) => skill.name).sort()).toEqual([
      'data-exporter',
      'git-workflow',
      'github-automation',
    ]);
    expect(skills.every((skill) => skill.platform === 'copilot')).toBe(true);
    expect(skills.every((skill) => skill.scope === 'project')).toBe(true);

    const conflicts = await detectConflicts(skills);
    expect(conflicts).toEqual([
      expect.objectContaining({
        kind: 'conflict',
        severity: 'med',
        detectionMethod: 'token',
      }),
    ]);
    expect([conflicts[0]?.a.name, conflicts[0]?.b.name].sort()).toEqual([
      'git-workflow',
      'github-automation',
    ]);

    const audit = runAudit(skills);
    expect(audit.findings).toEqual([
      expect.objectContaining({ skillName: 'data-exporter', ruleId: 'secret-leak' }),
      expect.objectContaining({ skillName: 'data-exporter', ruleId: 'network-call' }),
    ]);
  });
});
