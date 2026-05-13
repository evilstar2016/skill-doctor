import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export type ScenarioStage = 'it' | 'slice';

export interface FeatureScenarioEntry {
  id: string;
  stage: ScenarioStage;
  slice?: number;
  doc: string;
  test?: string;
}

export interface FeatureScenarioManifest {
  feature: string;
  spec: string;
  tasks: string;
  evidenceDir: string;
  scenarios: FeatureScenarioEntry[];
}

const repoRoot = resolve(fileURLToPath(new URL('../../', import.meta.url)));
const scenariosRoot = resolve(repoRoot, 'doc', 'scenarios');

export function getRepoRoot(): string {
  return repoRoot;
}

export function resolveRepoPath(relativePath: string): string {
  return resolve(repoRoot, relativePath);
}

export function getFeatureManifestPath(feature: string): string {
  return resolve(scenariosRoot, feature, 'manifest.json');
}

export function loadFeatureManifest(feature: string): FeatureScenarioManifest {
  const filePath = getFeatureManifestPath(feature);

  if (!existsSync(filePath)) {
    throw new Error(`Feature scenario manifest not found: ${feature}`);
  }

  return JSON.parse(readFileSync(filePath, 'utf8')) as FeatureScenarioManifest;
}

export function listFeatureManifestPaths(): string[] {
  if (!existsSync(scenariosRoot)) {
    return [];
  }

  return readdirSync(scenariosRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => resolve(scenariosRoot, entry.name, 'manifest.json'))
    .filter((filePath) => existsSync(filePath));
}
