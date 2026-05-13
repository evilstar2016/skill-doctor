import { existsSync, readFileSync } from 'node:fs';
import { basename, dirname } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  listFeatureManifestPaths,
  resolveRepoPath,
  type FeatureScenarioManifest,
} from '../../scripts/testing/featureManifest';

function readManifest(filePath: string): FeatureScenarioManifest {
  return JSON.parse(readFileSync(filePath, 'utf8')) as FeatureScenarioManifest;
}

describe('feature scenario manifests', () => {
  it('point to existing docs, evidence dirs, and executable tests', () => {
    const manifestPaths = listFeatureManifestPaths();
    const scenarioKeys = new Set<string>();

    expect(manifestPaths.length).toBeGreaterThan(0);

    for (const manifestPath of manifestPaths) {
      const manifest = readManifest(manifestPath);

      expect(manifest.feature).toBe(basename(dirname(manifestPath)));
      expect(existsSync(resolveRepoPath(manifest.spec))).toBe(true);
      expect(existsSync(resolveRepoPath(manifest.tasks))).toBe(true);
      expect(existsSync(resolveRepoPath(manifest.evidenceDir))).toBe(true);
      expect(manifest.scenarios.length).toBeGreaterThan(0);
      expect(manifest.scenarios.some((scenario) => Boolean(scenario.test))).toBe(true);

      for (const scenario of manifest.scenarios) {
        const key = `${manifest.feature}:${scenario.id}`;

        expect(scenarioKeys.has(key)).toBe(false);
        scenarioKeys.add(key);
        expect(existsSync(resolveRepoPath(scenario.doc))).toBe(true);

        if (scenario.stage === 'slice') {
          expect(typeof scenario.slice).toBe('number');
        }

        if (scenario.test) {
          expect(existsSync(resolveRepoPath(scenario.test))).toBe(true);
        }
      }
    }
  });
});
