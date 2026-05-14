import { join } from 'node:path';

import { describe, expect, it, vi } from 'vitest';

import { detectConflicts } from '../../src/conflicts/detectConflicts';
import { parseSkill } from '../../src/parsing/parseSkill';
import type { SkillFile, SkillRecord } from '../../src/types/skill';

function fixturePath(name: string): string {
  return join(process.cwd(), 'tests', 'fixtures', name);
}

function makeSkillFile(filePath: string): SkillFile {
  return {
    filePath,
    platform: 'claude',
    scope: 'project',
    confidence: 'high',
  };
}

function isSkillRecord(value: SkillRecord | null): value is SkillRecord {
  return value !== null;
}

describe('detectConflicts', () => {
  it('returns a duplicate pair for same-name skills from different paths', async () => {
    const left: SkillRecord = {
      name: 'Huashu Design',
      sourcePath: 'E:/skills/global/Huashu-Design/SKILL.md',
      platform: 'claude',
      scope: 'global',
      description: 'Design agent for interactive html demos.',
      triggers: ['make prototype'],
    };
    const right: SkillRecord = {
      name: 'Huashu Design',
      sourcePath: 'E:/skills/project/Huashu-Design/SKILL.md',
      platform: 'claude',
      scope: 'project',
      description: 'Design agent for interactive html demos.',
      triggers: ['make prototype'],
    };

    const pairs = await detectConflicts([left, right]);

    expect(pairs).toHaveLength(1);
    expect(pairs[0]?.kind).toBe('duplicate');
    expect(pairs[0]?.severity).toBe('high');
    expect(pairs[0]?.similarity).toBe(1);
    expect(pairs[0]?.detectionMethod).toBe('duplicate-name');
  });

  it('returns a high-severity conflict for highly overlapping skills', async () => {
    const left = parseSkill(makeSkillFile(fixturePath('conflicting-a.md')));
    const right = parseSkill(makeSkillFile(fixturePath('conflicting-b.md')));

    const pairs = await detectConflicts([left, right].filter(isSkillRecord));

    expect(pairs).toHaveLength(1);
    expect(pairs[0]?.kind).toBe('conflict');
    expect(pairs[0]?.severity).toBe('high');
    expect(pairs[0]?.detectionMethod).toBe('token');
    expect(pairs[0]?.sharedTokens).toEqual([
      'branch',
      'commit',
      'create',
      'git',
      'message',
      'open',
      'pull',
      'request',
      'workflow',
      'write',
    ]);
  });

  it('routes embedding strategy through the semantic detector', async () => {
    const left: SkillRecord = {
      name: 'Release Workflow',
      sourcePath: 'E:/skills/release/SKILL.md',
      platform: 'claude',
      scope: 'project',
      description: 'Prepare release planning and commit summary.',
      triggers: ['open release branch'],
    };
    const right: SkillRecord = {
      name: 'Deploy Workflow',
      sourcePath: 'E:/skills/deploy/SKILL.md',
      platform: 'claude',
      scope: 'project',
      description: 'Coordinate release planning and commit summary.',
      triggers: ['open release branch'],
    };
    const cache = {
      get: () => null,
      set: () => {},
    };
    const provider = {
      modelId: 'test-model',
      embed: async (text: string) =>
        text.startsWith('Release Workflow') ? [1, 0] : [0.99, 0.01],
    };

    const pairs = await detectConflicts([left, right], {
      strategy: 'embedding',
      threshold: 0.8,
      provider,
      cache,
    });

    expect(pairs).toHaveLength(1);
    expect(pairs[0]?.kind).toBe('conflict');
    expect(pairs[0]?.detectionMethod).toBe('embedding');
  });

  it('uses LLM remediation when analysis returns one', async () => {
    const left: SkillRecord = {
      name: 'Release Workflow',
      sourcePath: 'E:/skills/release/SKILL.md',
      platform: 'claude',
      scope: 'project',
      description: 'Prepare release planning and commit summary.',
      triggers: ['open release branch'],
    };
    const right: SkillRecord = {
      name: 'Deploy Workflow',
      sourcePath: 'E:/skills/deploy/SKILL.md',
      platform: 'claude',
      scope: 'project',
      description: 'Coordinate release planning and commit summary.',
      triggers: ['open release branch'],
    };
    const cache = {
      get: () => null,
      set: () => {},
    };
    const provider = {
      modelId: 'test-model',
      embed: async (text: string) =>
        text.startsWith('Release Workflow') ? [1, 0] : [0.99, 0.01],
    };
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [{
          message: {
            content: JSON.stringify({
              summary: 'They overlap significantly',
              overlapAreas: ['release planning'],
              boundaries: ['planning vs deployment'],
              strengthsA: ['planning detail'],
              strengthsB: ['deployment detail'],
              verdict: 'conflicting',
              remediation: 'Rename one trigger and merge duplicate planning steps into a single skill.',
            }),
          },
        }],
      }),
    });
    vi.stubGlobal('fetch', mockFetch);

    const pairs = await detectConflicts([left, right], {
      strategy: 'embedding',
      threshold: 0.8,
      provider,
      cache,
      analyze: true,
      analysisBaseUrl: 'http://localhost:11434/v1',
      analysisModelId: 'llama3.2',
    });

    expect(pairs).toHaveLength(1);
    expect(pairs[0]?.analysis?.remediation).toBe('Rename one trigger and merge duplicate planning steps into a single skill.');
    expect(pairs[0]?.remediation).toBe('Rename one trigger and merge duplicate planning steps into a single skill.');

    vi.unstubAllGlobals();
  });

  it('returns no conflicts for unrelated skills', async () => {
    const left = parseSkill(makeSkillFile(fixturePath('unrelated-a.md')));
    const right = parseSkill(makeSkillFile(fixturePath('unrelated-b.md')));

    const pairs = await detectConflicts([left, right].filter(isSkillRecord));

    expect(pairs).toEqual([]);
  });

  it('returns an empty array for fewer than two skills', async () => {
    const single = parseSkill(makeSkillFile(fixturePath('conflicting-a.md')));

    await expect(detectConflicts(single ? [single] : [])).resolves.toEqual([]);
    await expect(detectConflicts([])).resolves.toEqual([]);
  });
});