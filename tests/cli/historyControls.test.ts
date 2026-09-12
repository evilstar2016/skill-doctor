import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { chmodSync, existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanupTempRoots, createTempRoot, writeFile } from '../helpers/cliHarness';
const tsxLoader = createRequire(import.meta.url).resolve('tsx');

describe('history controls CLI and Skill bridge', () => {
  afterEach(cleanupTempRoots);
  it('previews, confirms, rejects stale changes and restores through the real CLI', () => {
    const root = createTempRoot(); const project = join(root, 'project'); const home = join(root, 'home');
    const report = join(project, 'report.json');
    writeFile(report, JSON.stringify({ kind: 'skill-doctor-codex-benefit-report', projectDir: project, historyAnalysis: { usageProfile: [] } }));
    const cli = resolve('src/cli/index.ts');
    const run = (args: string[]) => spawnSync(process.execPath, ['--import', tsxLoader, cli, ...args], { cwd: project, env: { ...process.env, HOME: home, CODEX_HOME: join(home, '.codex') }, encoding: 'utf8' });
    const args = ['context', 'control', '--report', report, '--kind', 'recommendations', '--id', 'recommended_plugins', '--action', 'disable'];
    const previewRun = run(args); expect(previewRun.status, previewRun.stderr).toBe(0);
    const preview = JSON.parse(previewRun.stdout); expect(existsSync(preview.configPath)).toBe(false);
    const applied = run([...args, '--confirm', preview.digest]); expect(applied.status, applied.stderr).toBe(0);
    const result = JSON.parse(applied.stdout); expect(readFileSync(preview.configPath, 'utf8')).toContain('tool_suggest = false');
    expect(run([...args, '--confirm', preview.digest]).status).toBe(1);
    expect(run(['context', 'control', '--undo', result.operationId, '--confirm', result.operationId]).status).toBe(0);
    expect(existsSync(preview.configPath)).toBe(false);
  });
  it('Skill bridge refuses missing project or undo approval before invoking CLI', () => {
    const script = resolve('skills/skill-doctor-context-optimizer/scripts/context-optimizer.mjs');
    for (const args of [['history'], ['history-undo', '--project', '/tmp', '--operation', 'unconfirmed']]) {
      const run = spawnSync(process.execPath, [script, ...args], { encoding: 'utf8' });
      expect(run.status).toBe(1); expect(run.stderr).toMatch(/required|confirmed/);
    }
  });
  it('Skill bridge forwards a real preview, confirmed write and undo without widening scope', () => {
    const root = createTempRoot(); const project = join(root, 'project'); const home = join(root, 'home');
    const report = join(project, 'report.json');
    writeFile(report, JSON.stringify({ kind: 'skill-doctor-codex-benefit-report', projectDir: project, historyAnalysis: { usageProfile: [] } }));
    const bridge = join(root, 'cli.mjs');
    writeFile(bridge, `#!/usr/bin/env node\nimport { spawnSync } from 'node:child_process';\nconst r=spawnSync(process.execPath, ['--import', ${JSON.stringify(tsxLoader)}, ${JSON.stringify(resolve('src/cli/index.ts'))}, ...process.argv.slice(2)], {stdio:'inherit',env:process.env});\nprocess.exit(r.status ?? 1);\n`);
    chmodSync(bridge, 0o700);
    const script = resolve('skills/skill-doctor-context-optimizer/scripts/context-optimizer.mjs');
    const run = (args: string[]) => spawnSync(process.execPath, [script, ...args], { env: { ...process.env, HOME: home, CODEX_HOME: join(home, '.codex'), SKILL_DOCTOR_BIN: bridge }, encoding: 'utf8' });
    const args = ['history-control', '--project', project, '--report', report, '--kind', 'recommendations', '--id', 'recommended_plugins', '--action', 'disable'];
    const initial = run(args); expect(initial.status, initial.stderr).toBe(0);
    const preview = JSON.parse(initial.stdout); expect(existsSync(preview.configPath)).toBe(false);
    const applied = run([...args, '--confirm', preview.digest]); expect(applied.status, applied.stderr).toBe(0);
    const operation = JSON.parse(applied.stdout).operationId;
    expect(run(['history-undo', '--project', project, '--operation', operation, '--confirm', operation]).status).toBe(0);
    expect(existsSync(preview.configPath)).toBe(false);
  });
});
