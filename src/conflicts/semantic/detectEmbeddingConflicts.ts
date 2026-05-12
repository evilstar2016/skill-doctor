import type {
  ConflictDetectionOptions,
  ConflictPair,
  Severity,
  SkillRecord,
} from '../../types/skill';
import { tokenize } from '../tokenize';
import { analyzeConflict } from './analyzeConflict';
import { buildSemanticText } from './buildSemanticText';
import { cosineSimilarity } from './cosine';
import { createEmbeddingCache } from './embeddingCache';
import { createEmbeddingProvider } from './embeddingProvider';

const DEFAULT_THRESHOLD = 0.82;
const MED_THRESHOLD = 0.86;
const HIGH_THRESHOLD = 0.9;

export async function detectEmbeddingConflicts(
  skills: SkillRecord[],
  options: ConflictDetectionOptions = {},
): Promise<ConflictPair[]> {
  if (skills.length < 2) {
    return [];
  }

  const provider =
    options.provider ??
    createEmbeddingProvider({
      baseUrl: options.baseUrl,
      modelId: options.modelId,
      apiKey: options.apiKey,
    });
  const cache =
    options.cache ??
    createEmbeddingCache({
      modelId: provider.cacheKey ?? provider.modelId,
      cacheDir: options.cacheDir,
    });
  const threshold = options.threshold ?? DEFAULT_THRESHOLD;
  const semanticTexts = new Map<string, string>();
  const tokenSets = new Map<string, Set<string>>();
  const embeddings = new Map<string, Promise<number[]>>();
  const pairs: ConflictPair[] = [];

  for (let leftIndex = 0; leftIndex < skills.length - 1; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < skills.length; rightIndex += 1) {
      const left = skills[leftIndex];
      const right = skills[rightIndex];

      if (isDuplicatePair(left, right)) {
        pairs.push({
          a: left,
          b: right,
          kind: 'duplicate',
          similarity: 1,
          sharedTokens: [],
          severity: 'high',
          detectionMethod: 'duplicate-name',
        });
        continue;
      }

      const [leftEmbedding, rightEmbedding] = await Promise.all([
        getEmbedding(left),
        getEmbedding(right),
      ]);
      const similarity = cosineSimilarity(leftEmbedding, rightEmbedding);

      if (similarity < threshold) {
        continue;
      }

      const sharedTokens = [...getTokens(left)].filter((token) => getTokens(right).has(token)).sort().slice(0, 10);

      const pair: ConflictPair = {
        a: left,
        b: right,
        kind: 'conflict',
        similarity,
        sharedTokens,
        severity: getSeverity(similarity),
        detectionMethod: 'embedding',
      };

      if (options.analyze && options.analysisBaseUrl && options.analysisModelId) {
        try {
          pair.analysis = await analyzeConflict(left, right, {
            baseUrl: options.analysisBaseUrl,
            modelId: options.analysisModelId,
            apiKey: options.analysisApiKey,
          });
        } catch {
          // analysis is optional — silently skip on error
        }
      }

      pairs.push(pair);
    }
  }

  return pairs;

  function getText(skill: SkillRecord): string {
    const cached = semanticTexts.get(skill.sourcePath);
    if (cached) {
      return cached;
    }

    const text = buildSemanticText(skill);
    semanticTexts.set(skill.sourcePath, text);
    return text;
  }

  function getTokens(skill: SkillRecord): Set<string> {
    const cached = tokenSets.get(skill.sourcePath);
    if (cached) {
      return cached;
    }

    const tokens = tokenize(getText(skill));
    tokenSets.set(skill.sourcePath, tokens);
    return tokens;
  }

  function getEmbedding(skill: SkillRecord): Promise<number[]> {
    const cached = embeddings.get(skill.sourcePath);
    if (cached) {
      return cached;
    }

    const text = getText(skill);
    const stored = cache.get(text);
    if (stored) {
      const promise = Promise.resolve(stored);
      embeddings.set(skill.sourcePath, promise);
      return promise;
    }

    const promise = provider.embed(text).then((embedding) => {
      cache.set(text, embedding);
      return embedding;
    });
    embeddings.set(skill.sourcePath, promise);
    return promise;
  }
}

function getSeverity(similarity: number): Severity {
  if (similarity >= HIGH_THRESHOLD) {
    return 'high';
  }

  if (similarity >= MED_THRESHOLD) {
    return 'med';
  }

  return 'low';
}

function isDuplicatePair(left: SkillRecord, right: SkillRecord): boolean {
  return normalizeName(left.name) === normalizeName(right.name) && left.sourcePath !== right.sourcePath;
}

function normalizeName(name: string): string {
  return name.trim().toLowerCase();
}
