/**
 * Fixture skill pairs for threshold calibration.
 *
 * POSITIVE pairs: semantically similar skills that share purpose/context
 * but may use different surface vocabulary. A well-tuned embedding model
 * should produce similarity >= 0.82 for these.
 *
 * ADJACENT pairs: related skills that serve clearly different purposes.
 * A well-tuned embedding model should produce similarity < 0.82 for these.
 */

import type { SkillRecord } from '../../../src/types/skill';

export function makeFixtureSkill(overrides: Partial<SkillRecord>): SkillRecord {
  return {
    name: 'Unnamed',
    sourcePath: `/skills/${overrides.name ?? 'unnamed'}.md`,
    platform: 'claude',
    scope: 'global',
    description: '',
    triggers: [],
    ...overrides,
  };
}

/** Two skills that do the same thing under different names — should conflict. */
export const POSITIVE_PAIR_RELEASE = {
  a: makeFixtureSkill({
    name: 'release-workflow',
    description: 'Guides the user through cutting a release: bumping version, tagging git, updating changelog, and pushing.',
    triggers: ['cut a release', 'ship a new version', 'prepare release'],
  }),
  b: makeFixtureSkill({
    name: 'version-bumper',
    description: 'Automates the process of shipping new software: incrementing version numbers, creating git tags, and publishing changelog entries.',
    triggers: ['bump the version', 'tag and ship', 'publish release'],
  }),
};

/** Two skills that are related but clearly distinct — should NOT conflict. */
export const ADJACENT_PAIR_RELEASE_VS_REVIEW = {
  a: makeFixtureSkill({
    name: 'release-workflow',
    description: 'Guides the user through cutting a release: bumping version, tagging git, updating changelog, and pushing.',
    triggers: ['cut a release', 'ship a new version'],
  }),
  b: makeFixtureSkill({
    name: 'code-review',
    description: 'Reviews pull requests for correctness, style, and test coverage. Leaves inline comments and approves or requests changes.',
    triggers: ['review this PR', 'check the pull request'],
  }),
};
