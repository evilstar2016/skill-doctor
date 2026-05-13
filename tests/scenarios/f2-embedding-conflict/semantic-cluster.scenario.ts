import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { join } from 'node:path';

import { afterEach, beforeAll, describe, expect, it } from 'vitest';

import { buildCli, cleanupTempRoots, createTempRoot, runCli, runCliAsync, writeFile } from '../../helpers/cliHarness';

interface ConflictPayload {
  conflicts: Array<{
    a: { name: string };
    b: { name: string };
    detectionMethod?: string;
  }>;
}

beforeAll(() => {
  buildCli();
}, 30000);

afterEach(() => {
  cleanupTempRoots();
});

function writeSkill(cwd: string, slug: string, content: string): void {
  writeFile(join(cwd, '.claude', 'skills', slug, 'SKILL.md'), content);
}

function pairKey(pair: { a: { name: string }; b: { name: string } }): string {
  return [pair.a.name, pair.b.name].sort().join(' <-> ');
}

describe('F2 embedding conflict scenarios', () => {
  it('detects a semantic cluster that token overlap misses', async () => {
    const root = createTempRoot('skill-doctor-scenario-');
    const cwd = join(root, 'workspace');
    const home = join(root, 'home');
    let receivedModel = '';
    const embeddings: Record<string, number[]> = {
      'pr-readiness-auditor': [1, 0],
      'merge-readiness-reviewer': [0.99, 0.01],
      'ship-branch-checker': [0.98, 0.02],
      'migration-safety-guard': [0, 1],
    };

    const server = createServer((request, response) => {
      let body = '';
      request.setEncoding('utf8');
      request.on('data', (chunk) => {
        body += chunk;
      });
      request.on('end', () => {
        const payload = JSON.parse(body) as { model: string; input: string };
        const skillName = Object.keys(embeddings).find((name) => payload.input.toLowerCase().startsWith(name));

        receivedModel = payload.model;

        response.writeHead(200, {
          'content-type': 'application/json',
          connection: 'close',
        });
        response.end(
          JSON.stringify({
            data: [{ embedding: embeddings[skillName ?? 'migration-safety-guard'], index: 0 }],
            model: payload.model,
          }),
        );
      });
    });

    try {
      const port = await new Promise<number>((resolve) => {
        server.listen(0, '127.0.0.1', () => {
          resolve((server.address() as AddressInfo).port);
        });
      });

      writeFile(
        join(home, '.skill-doctor', 'config.json'),
        JSON.stringify(
          {
            embedding: {
              baseUrl: `http://127.0.0.1:${port}/v1`,
              model: 'bge-m3',
              apiKey: '111111',
            },
          },
          null,
          2,
        ),
      );
      writeSkill(
        cwd,
        'pr-readiness-auditor',
        [
          '---',
          'name: pr-readiness-auditor',
          'description: Decide whether a review packet can move forward by checking touched modules, validation results, and unresolved reviewer notes.',
          '---',
          '',
          '# PR Readiness Auditor',
        ].join('\n'),
      );
      writeSkill(
        cwd,
        'merge-readiness-reviewer',
        [
          '---',
          'name: merge-readiness-reviewer',
          'description: Judge if a change proposal is fit for integration by auditing diff scope, check outcomes, and remaining adoption hazards.',
          '---',
          '',
          '# Merge Readiness Reviewer',
        ].join('\n'),
      );
      writeSkill(
        cwd,
        'ship-branch-checker',
        [
          '---',
          'name: ship-branch-checker',
          'description: Assess whether a pending patch is ready for rollout by examining file churn, signal health, and leftover risk items.',
          '---',
          '',
          '# Ship Branch Checker',
        ].join('\n'),
      );
      writeSkill(
        cwd,
        'migration-safety-guard',
        [
          '---',
          'name: migration-safety-guard',
          'description: Review database migrations for destructive operations, locking risk, backfill strategy, and rollback safety.',
          'when_to_use: Use when the user asks whether a SQL migration is safe, how a backfill behaves, or whether schema changes may lock production tables.',
          '---',
          '',
          '# Migration Safety Guard',
          '',
          '## When to Use',
          '- Review SQL migrations',
          '- Check rollback safety',
          '- Evaluate locking and backfills',
        ].join('\n'),
      );

      const tokenResult = runCli(['conflicts', '--strategy', 'token', '--json'], cwd, home);
      expect(tokenResult.status).toBe(0);

      const tokenPayload = JSON.parse(tokenResult.stdout) as ConflictPayload;
      expect(tokenPayload.conflicts).toHaveLength(0);

      const embeddingResult = await runCliAsync(
        ['conflicts', '--strategy', 'embedding', '--threshold', '0.82', '--json'],
        cwd,
        home,
      );
      expect(embeddingResult.status).toBe(0);
      expect(embeddingResult.stderr).toBe('');
      expect(receivedModel).toBe('bge-m3');

      const embeddingPayload = JSON.parse(embeddingResult.stdout) as ConflictPayload;
      const conflictPairs = embeddingPayload.conflicts.map(pairKey).sort();

      expect(embeddingPayload.conflicts).toHaveLength(3);
      expect(embeddingPayload.conflicts.every((pair) => pair.detectionMethod === 'embedding')).toBe(true);
      expect(conflictPairs).toEqual([
        'merge-readiness-reviewer <-> pr-readiness-auditor',
        'merge-readiness-reviewer <-> ship-branch-checker',
        'pr-readiness-auditor <-> ship-branch-checker',
      ]);
      expect(conflictPairs.some((pair) => pair.includes('migration-safety-guard'))).toBe(false);
    } finally {
      server.closeAllConnections();
      await new Promise<void>((resolve, reject) => {
        server.close((error) => {
          if (error) {
            reject(error);
            return;
          }
          resolve();
        });
      });
    }
  });
});
