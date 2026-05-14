import { describe, expect, it } from 'vitest';
import { buildAnalysisPrompt } from '../../../src/conflicts/semantic/buildAnalysisPrompt';
import type { SkillRecord } from '../../../src/types/skill';

const makeSkill = (name: string, description: string, triggers: string[]): SkillRecord => ({
  name,
  sourcePath: `/skills/${name}.md`,
  platform: 'claude',
  scope: 'global',
  description,
  triggers,
});

describe('buildAnalysisPrompt', () => {
  it('includes both skill names', () => {
    const prompt = buildAnalysisPrompt(
      makeSkill('skill-a', 'Does A things', ['when A']),
      makeSkill('skill-b', 'Does B things', ['when B']),
    );
    expect(prompt).toContain('skill-a');
    expect(prompt).toContain('skill-b');
  });

  it('includes descriptions and triggers', () => {
    const prompt = buildAnalysisPrompt(
      makeSkill('alpha', 'Alpha description', ['trigger-one', 'trigger-two']),
      makeSkill('beta', 'Beta description', ['trigger-three']),
    );
    expect(prompt).toContain('Alpha description');
    expect(prompt).toContain('trigger-one, trigger-two');
    expect(prompt).toContain('Beta description');
    expect(prompt).toContain('trigger-three');
  });

  it('shows "none" for empty triggers', () => {
    const prompt = buildAnalysisPrompt(
      makeSkill('alpha', 'Alpha', []),
      makeSkill('beta', 'Beta', []),
    );
    expect(prompt).toContain('none');
  });

  it('requests JSON with required fields', () => {
    const prompt = buildAnalysisPrompt(
      makeSkill('a', 'a', []),
      makeSkill('b', 'b', []),
    );
    expect(prompt).toContain('summary');
    expect(prompt).toContain('overlapAreas');
    expect(prompt).toContain('boundaries');
    expect(prompt).toContain('strengthsA');
    expect(prompt).toContain('strengthsB');
    expect(prompt).toContain('verdict');
    expect(prompt).toContain('remediation');
  });

  it('lists all valid verdict values', () => {
    const prompt = buildAnalysisPrompt(
      makeSkill('a', 'a', []),
      makeSkill('b', 'b', []),
    );
    expect(prompt).toContain('conflicting');
    expect(prompt).toContain('adjacent');
    expect(prompt).toContain('distinct');
  });
});
