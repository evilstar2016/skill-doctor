import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

import {
  getRepoRoot,
  listFeatureManifestPaths,
  loadFeatureManifest,
  resolveRepoPath,
  type FeatureScenarioEntry,
  type FeatureScenarioManifest,
} from './featureManifest';

interface CliOptions {
  features: string[];
  record: boolean;
}

function parseArgs(argv: string[]): CliOptions {
  const features: string[] = [];
  let record = false;

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === '--feature') {
      const value = argv[index + 1];
      if (!value) {
        throw new Error('Missing value for --feature');
      }
      features.push(value);
      index += 1;
      continue;
    }

    if (arg === '--record') {
      record = true;
      continue;
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  return {
    features: [...new Set(features)],
    record,
  };
}

function unique<T>(values: T[]): T[] {
  return [...new Set(values)];
}

function recordLatestEvidence(
  feature: string,
  evidenceDir: string,
  scenarios: FeatureScenarioEntry[],
): void {
  const recordedAt = new Date().toISOString();
  const latestPath = resolve(resolveRepoPath(evidenceDir), 'latest.json');
  const existing = existsSync(latestPath)
    ? (JSON.parse(readFileSync(latestPath, 'utf8')) as Record<string, unknown>)
    : {};

  writeFileSync(
    latestPath,
    `${JSON.stringify(
      {
        ...existing,
        feature,
        lastUpdated: recordedAt,
        scenarioValidation: {
          recordedAt,
          status: 'passed',
          scenarioIds: scenarios.map((scenario) => scenario.id),
          testFiles: unique(scenarios.map((scenario) => scenario.test).filter((value): value is string => Boolean(value))),
        },
      },
      null,
      2,
    )}\n`,
    'utf8',
  );
}

function main(): number {
  const options = parseArgs(process.argv.slice(2));
  const manifests = loadRequestedManifests(options.features);
  const scenarioSets = manifests.map((manifest) => ({
    manifest,
    scenarios: manifest.scenarios.filter((scenario) => scenario.test),
  }));

  for (const { manifest, scenarios } of scenarioSets) {
    if (scenarios.length === 0) {
      throw new Error(`Feature has no executable scenarios: ${manifest.feature}`);
    }
  }

  const testFiles = unique(
    scenarioSets.flatMap(({ scenarios }) =>
      scenarios.map((scenario) => resolveRepoPath(scenario.test as string)),
    ),
  );
  const relativeTestFiles = testFiles.map((filePath) => filePath.replace(`${getRepoRoot()}\\`, '').replace(`${getRepoRoot()}/`, ''));
  const vitest = spawnSync(
    'npx',
    ['vitest', 'run', '--config', 'vitest.scenarios.config.ts', ...relativeTestFiles],
    {
      cwd: getRepoRoot(),
      stdio: 'inherit',
      shell: true,
    },
  );

  if (vitest.status !== 0) {
    return vitest.status ?? 1;
  }

  if (options.record) {
    for (const { manifest, scenarios } of scenarioSets) {
      const evidenceDir = manifest.evidenceDir;
      const absoluteEvidenceDir = resolveRepoPath(evidenceDir);
      const parentDir = dirname(absoluteEvidenceDir);
      if (!existsSync(parentDir)) {
        throw new Error(`Evidence directory parent not found: ${evidenceDir}`);
      }
      recordLatestEvidence(manifest.feature, evidenceDir, scenarios);
    }
  }

  return 0;
}

function loadRequestedManifests(features: string[]): FeatureScenarioManifest[] {
  if (features.length > 0) {
    return features.map((feature) => loadFeatureManifest(feature));
  }

  const manifests = listFeatureManifestPaths().map((filePath) =>
    JSON.parse(readFileSync(filePath, 'utf8')) as FeatureScenarioManifest,
  );

  if (manifests.length === 0) {
    throw new Error('No feature scenario manifests found.');
  }

  return manifests;
}

try {
  process.exitCode = main();
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exitCode = 1;
}
