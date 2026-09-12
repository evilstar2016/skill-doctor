import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { main } from '../../src/cli/index';

interface RunResult {
  stdout: string;
  stderr: string;
  status: number;
}

async function runMain(args: string[]): Promise<RunResult> {
  const stdout: string[] = [];
  const stderr: string[] = [];
  const stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation((chunk: string | Uint8Array) => {
    stdout.push(typeof chunk === 'string' ? chunk : new TextDecoder().decode(chunk));
    return true;
  });
  const stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation((chunk: string | Uint8Array) => {
    stderr.push(typeof chunk === 'string' ? chunk : new TextDecoder().decode(chunk));
    return true;
  });
  const previousExitCode = process.exitCode;
  process.exitCode = undefined;
  let status = 0;
  try {
    await main(args);
  } finally {
    status = typeof process.exitCode === 'number' ? process.exitCode : 0;
    stdoutSpy.mockRestore();
    stderrSpy.mockRestore();
  }
  process.exitCode = previousExitCode;
  return { stdout: stdout.join(''), stderr: stderr.join(''), status };
}

describe('benefit CLI', () => {
  let root: string;
  let previousHome: string | undefined;
  let previousUserProfile: string | undefined;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'skill-doctor-benefit-cli-'));
    previousHome = process.env.HOME;
    previousUserProfile = process.env.USERPROFILE;
    process.env.HOME = join(root, 'home');
    process.env.USERPROFILE = join(root, 'home');
  });

  afterEach(() => {
    if (previousHome === undefined) delete process.env.HOME;
    else process.env.HOME = previousHome;
    if (previousUserProfile === undefined) delete process.env.USERPROFILE;
    else process.env.USERPROFILE = previousUserProfile;
    rmSync(root, { recursive: true, force: true });
  });

  it('emits the same structured report as the estimator for a fixture session', async () => {
    const projectDir = join(root, 'project');
    const sessionDir = join(process.env.HOME!, '.codex', 'sessions', '2026', '09', '07');
    const sessionPath = join(sessionDir, 'rollout-cli.jsonl');
    const now = new Date().toISOString();
    mkdirSync(projectDir, { recursive: true });
    mkdirSync(sessionDir, { recursive: true });
    writeFileSync(sessionPath, [
      { timestamp: now, type: 'session_meta', payload: { session_id: 'session-cli', id: 'thread-cli', timestamp: now, cwd: projectDir } },
      { timestamp: now, type: 'turn_context', payload: { turn_id: 'turn-cli', cwd: projectDir, model: 'gpt-6-astra', effort: 'high' } },
      { timestamp: now, type: 'token_usage_record', payload: {
        thread_id: 'thread-cli', session_id: 'session-cli', turn_id: 'turn-cli', response_id: 'response-cli',
        usage: { input_tokens: 1000, cached_input_tokens: 100, cache_write_input_tokens: 0, output_tokens: 20, reasoning_output_tokens: 5, total_tokens: 1020 },
      } },
    ].map((row) => JSON.stringify(row)).join('\n') + '\n', 'utf8');
    const planDir = join(process.env.HOME!, '.skill-doctor', 'context-optimizer', 'plans');
    mkdirSync(planDir, { recursive: true });
    writeFileSync(join(planDir, 'plan-cli.json'), JSON.stringify({
      schemaVersion: 1,
      kind: 'skill-doctor-context-plan',
      id: 'plan-cli',
      createdAt: now,
      projectDir,
      inventoryFingerprint: createHash('sha256').update('[]').digest('hex'),
      baseline: { totalEstimatedTokens: 1000 },
      estimate: { fixedEstimatedTokens: 100, estimatedAfterTokens: 900 },
    }), 'utf8');

    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(() => {
      throw new Error('network access is forbidden in benefit analysis');
    });
    const result = await runMain(['benefit', '--project', projectDir, '--plan', 'plan-cli', '--since', '24h', '--limit', '5', '--tokenizer', 'approx', '--json']);
    fetchSpy.mockRestore();
    const report = JSON.parse(result.stdout) as { plan?: { id: string }; savings: { status: string; inputTokens?: number }; index: { enabled: boolean }; simulation: { reexecutedCodex: boolean; tokenizer: { mode: string } } };

    expect(result.status).toBe(0);
    expect(result.stderr).toBe('');
    expect(report.plan?.id).toBe('plan-cli');
    expect(report.savings).toMatchObject({ status: 'estimated', inputTokens: 100 });
    expect(report.index.enabled).toBe(true);
    expect(report.simulation.reexecutedCodex).toBe(false);
    expect(report.simulation.tokenizer.mode).toBe('approx');
    expect(fetchSpy).not.toHaveBeenCalled();

    const invalidRetention = await runMain(['benefit', '--project', projectDir, '--retention-days', '0', '--json']);
    expect(invalidRetention.status).toBe(1);
    expect(invalidRetention.stderr).toContain('Invalid --retention-days');

    const htmlPath = join(root, 'benefit.html');
    const htmlResult = await runMain(['benefit', '--project', projectDir, '--since', '24h', '--limit', '5', '--format', 'html', '--output', htmlPath]);
    expect(htmlResult.status).toBe(0);
    expect(readFileSync(htmlPath, 'utf8')).toContain('<!doctype html>');
    expect(readFileSync(htmlPath, 'utf8')).not.toContain(projectDir);

    const deleteEntryResult = await runMain(['benefit', '--project', projectDir, '--delete-index-entry', sessionPath, '--json']);
    expect(JSON.parse(deleteEntryResult.stdout)).toMatchObject({ deleted: true, deletedEntries: 1, kind: 'skill-doctor-benefit-index-entry' });
    await runMain(['benefit', '--project', projectDir, '--since', '24h', '--limit', '5', '--json']);

    const deleteResult = await runMain(['benefit', '--project', projectDir, '--delete-index', '--json']);
    expect(JSON.parse(deleteResult.stdout)).toMatchObject({ deleted: true, kind: 'skill-doctor-benefit-index' });
    expect(existsSync(join(process.env.HOME!, '.skill-doctor', 'benefit', 'session-index.json'))).toBe(false);
  });

  it('runs a response-item context block through scan, historical matching, and CLI benefit estimation', async () => {
    const projectDir = join(root, 'project-context-block');
    const sessionDir = join(process.env.HOME!, '.codex', 'sessions', '2026', '09', '10');
    const sessionPath = join(sessionDir, 'rollout-context-block.jsonl');
    const planPath = join(root, 'context-block-plan.json');
    const now = new Date().toISOString();
    mkdirSync(projectDir, { recursive: true });
    mkdirSync(sessionDir, { recursive: true });
    const blockText = '<recommended_plugins>\n- GitHub (github@openai-curated-remote)\n</recommended_plugins>';
    const rows = [
      { timestamp: now, type: 'session_meta', payload: { session_id: 'session-context-block', id: 'thread-context-block', timestamp: now, cwd: projectDir } },
      { timestamp: now, type: 'response_item', payload: { type: 'message', role: 'user', content: [{ type: 'input_text', text: blockText }] } },
      { timestamp: now, type: 'token_usage_record', payload: {
        thread_id: 'thread-context-block', session_id: 'session-context-block', turn_id: 'turn-context-block', response_id: 'response-context-block',
        usage: { input_tokens: 1000, cached_input_tokens: 100, cache_write_input_tokens: 0, output_tokens: 20, reasoning_output_tokens: 5, total_tokens: 1020 },
      } },
    ];
    writeFileSync(sessionPath, `${rows.map((row) => JSON.stringify(row)).join('\n')}\n`, 'utf8');
    writeFileSync(planPath, JSON.stringify({
      schemaVersion: 1,
      kind: 'codex-context-block-plan',
      id: 'context-block-plan',
      createdAt: now,
      projectDir,
      operations: [{ affectedItems: [{
        id: 'codex:context-block:recommended_plugins',
        name: 'recommended_plugins',
        resource: 'context-block',
        kind: 'context-block',
        blockId: 'recommended_plugins',
        enabled: false,
        controllable: false,
        controlMethod: 'features.tool_suggest + features.recommended_plugins (composite)',
      }] }],
    }), 'utf8');

    const result = await runMain([
      'benefit',
      '--project', projectDir,
      '--codex-home', join(process.env.HOME!, '.codex'),
      '--plan', planPath,
      '--since', '24h',
      '--limit', '5',
      '--tokenizer', 'approx',
      '--json',
    ]);
    const report = JSON.parse(result.stdout) as {
      planCoverage: { status: string; matchedResourceCount: number };
      evidence: { historicalContextBlockCount: number; historicalContextBlockKinds: Record<string, number>; textReconstructedResponseCount: number };
      savings: { status: string; inputTokens?: number };
      responses: Array<{ evidence?: string; status: string; estimatedInputSavings?: number }>;
      provenance: { contextSnapshots: Array<{ contextBlocks?: Array<{ text?: string }> }> };
    };

    expect(result.status).toBe(0);
    expect(result.stderr).toBe('');
    expect(report.planCoverage).toMatchObject({ status: 'matched', matchedResourceCount: 1 });
    expect(report.evidence).toMatchObject({ historicalContextBlockCount: 1, historicalContextBlockKinds: { recommended_plugins: 1 }, textReconstructedResponseCount: 1 });
    expect(report.savings.status).toBe('estimated');
    expect(report.savings.inputTokens).toBeGreaterThan(0);
    expect(report.responses[0]).toMatchObject({ evidence: 'text-reconstructed', status: 'estimated' });
    expect(report.responses[0]?.estimatedInputSavings).toBe(report.savings.inputTokens);
    expect(report.provenance.contextSnapshots[0]?.contextBlocks?.[0]).not.toHaveProperty('text');
  });

  it('runs offline mode when no plan is supplied and excludes recommended plugins from definite savings', async () => {
    const projectDir = join(root, 'project-offline');
    const skillPath = join(projectDir, '.codex', 'skills', 'offline-skill', 'SKILL.md');
    const sessionDir = join(process.env.HOME!, '.codex', 'sessions', '2026', '09', '10');
    const sessionPath = join(sessionDir, 'rollout-offline.jsonl');
    const now = new Date().toISOString();
    const skillsBlock = [
      '<skills_instructions>',
      '- `project-skills` = `' + join(projectDir, '.codex', 'skills') + '`',
      '### Available skills',
      '- offline-skill: A local test skill.',
      '- missing-skill: Not installed in this project.',
      '</skills_instructions>',
    ].join('\n');
    const recommendedBlock = '<recommended_plugins>\n- GitHub (github@openai-curated-remote)\n</recommended_plugins>';
    mkdirSync(dirname(skillPath), { recursive: true });
    mkdirSync(sessionDir, { recursive: true });
    const persistedPlanDir = join(process.env.HOME!, '.skill-doctor', 'context-optimizer', 'plans');
    mkdirSync(persistedPlanDir, { recursive: true });
    writeFileSync(join(persistedPlanDir, 'persisted-plan.json'), JSON.stringify({
      id: 'persisted-plan', projectDir, baseline: { totalEstimatedTokens: 1000 }, estimate: { fixedEstimatedTokens: 900 },
    }), 'utf8');
    writeFileSync(skillPath, ['---', 'name: offline-skill', 'description: A local test skill.', '---', '', '# Offline skill'].join('\n'), 'utf8');
    writeFileSync(sessionPath, [
      { timestamp: now, type: 'session_meta', payload: { session_id: 'session-offline', id: 'thread-offline', timestamp: now, cwd: projectDir } },
      { timestamp: now, type: 'response_item', payload: { type: 'message', role: 'developer', content: [{ type: 'input_text', text: `${skillsBlock}\n${recommendedBlock}` }] } },
      { timestamp: now, type: 'response_item', payload: { type: 'message', role: 'user', content: [{ type: 'input_text', text: 'Keep missing-skill available for this task.' }] } },
      { timestamp: now, type: 'token_usage_record', payload: {
        thread_id: 'thread-offline', session_id: 'session-offline', turn_id: 'turn-offline', response_id: 'response-offline',
        usage: { input_tokens: 1000, cached_input_tokens: 100, cache_write_input_tokens: 0, output_tokens: 20, reasoning_output_tokens: 5, total_tokens: 1020 },
      } },
    ].map((row) => JSON.stringify(row)).join('\n') + '\n', 'utf8');

    const result = await runMain([
      'benefit',
      '--project', projectDir,
      '--since', '24h',
      '--limit', '5',
      '--tokenizer', 'approx',
      '--json',
    ]);
    const report = JSON.parse(result.stdout) as {
      plan?: {
        id: string;
        sourceKind: string;
        offline?: {
          historicalSkillCandidateCount: number;
          selectedSkillCount: number;
          recommendedPluginCount: number;
          skippedCandidateCount: number;
          descriptionEstimates: {
            skillsInstructions: {
              candidateCount: number;
              explicitlyReferencedCount: number;
              verifiedRemovableCount: number;
              unverifiedPotentialCount: number;
              entryTokens: number;
            };
            recommendedPlugins: {
              candidateCount: number;
              explicitlyReferencedCount: number;
              verifiedRemovableCount: number;
              unverifiedPotentialCount: number;
              entryTokens: number;
            };
          };
        };
      };
      savings: { status: string; inputTokens?: number };
      simulation: { source: string };
      evidence: { historicalContextBlockKinds: Record<string, number> };
      diagnostics: Array<{ code: string }>;
    };

    expect(result.status).toBe(0);
    expect(result.stderr).toBe('');
    expect(report.plan).toMatchObject({ id: 'offline-codex-context', sourceKind: 'offline' });
    expect(report.plan?.offline).toMatchObject({
      historicalSkillCandidateCount: 2,
      selectedSkillCount: 1,
      recommendedPluginCount: 1,
      skippedCandidateCount: 1,
    });
    expect(report.plan?.offline?.descriptionEstimates).toMatchObject({
      skillsInstructions: {
        candidateCount: 2,
        explicitlyReferencedCount: 1,
        verifiedRemovableCount: 0,
        unverifiedPotentialCount: 1,
      },
      recommendedPlugins: {
        candidateCount: 1,
        explicitlyReferencedCount: 0,
        verifiedRemovableCount: 0,
        unverifiedPotentialCount: 1,
      },
    });
    expect(report.plan?.offline?.descriptionEstimates.skillsInstructions.entryTokens).toBeGreaterThan(0);
    expect(report.plan?.offline?.descriptionEstimates.recommendedPlugins.entryTokens).toBeGreaterThan(0);
    expect(report.savings.status).toBe('estimated');
    expect(report.savings.inputTokens).toBeGreaterThan(0);
    expect(report.simulation.source).toBe('offline-context');
    expect(report.evidence.historicalContextBlockKinds).toMatchObject({ skills_instructions: 1, recommended_plugins: 1 });
    expect(report.diagnostics.some((item) => item.code === 'estimate.latest_catalog_projection')).toBe(true);
  });
});
