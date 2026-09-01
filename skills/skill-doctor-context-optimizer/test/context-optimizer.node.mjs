import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import test from 'node:test';

const execFileAsync = promisify(execFile);
const testDir = dirname(fileURLToPath(import.meta.url));
const optimizer = resolve(testDir, '../scripts/context-optimizer.mjs');
const fakeCli = resolve(testDir, 'fixtures/fake-skill-doctor.mjs');

function baseItems() {
  return [
    {
      id: 'codex:skill:/skills/a/SKILL.md',
      name: 'skill-a',
      sourcePath: '/skills/a/SKILL.md',
      platform: 'codex',
      scope: 'global',
      resource: 'skill',
      kind: 'agent-skill-description',
      estimatedTokens: 100,
      estimatedChars: 400,
      activationEstimatedTokens: 600,
      budgetScope: 'startup-selection',
      enabled: true,
      controllable: true,
      controlMethod: 'skills.config',
      estimateStatus: 'estimated',
    },
    {
      id: 'codex:skill:/skills/b/SKILL.md',
      name: 'skill-b',
      sourcePath: '/skills/b/SKILL.md',
      platform: 'codex',
      scope: 'global',
      resource: 'skill',
      kind: 'agent-skill-description',
      estimatedTokens: 50,
      estimatedChars: 200,
      activationEstimatedTokens: 300,
      budgetScope: 'startup-selection',
      enabled: true,
      controllable: true,
      controlMethod: 'skills.config',
      estimateStatus: 'estimated',
    },
    {
      id: 'codex:plugin:alpha@example:skill:one',
      name: 'plugin-one',
      sourcePath: '/plugins/alpha/one/SKILL.md',
      platform: 'codex',
      scope: 'global',
      resource: 'plugin',
      kind: 'agent-skill-description',
      estimatedTokens: 75,
      estimatedChars: 300,
      activationEstimatedTokens: 500,
      budgetScope: 'startup-selection',
      enabled: true,
      controllable: true,
      controlMethod: 'plugins.alpha@example.enabled',
      estimateStatus: 'estimated',
    },
    {
      id: 'codex:plugin:alpha@example:skill:two',
      name: 'plugin-two',
      sourcePath: '/plugins/alpha/two/SKILL.md',
      platform: 'codex',
      scope: 'global',
      resource: 'plugin',
      kind: 'agent-skill-description',
      estimatedTokens: 25,
      estimatedChars: 100,
      activationEstimatedTokens: 200,
      budgetScope: 'startup-selection',
      enabled: true,
      controllable: true,
      controlMethod: 'plugins.alpha@example.enabled',
      estimateStatus: 'estimated',
    },
    {
      id: 'codex:mcp:github',
      name: 'github',
      sourcePath: '/fake/config.toml',
      platform: 'codex',
      scope: 'global',
      resource: 'mcp',
      kind: 'mcp-server-config',
      estimatedTokens: 80,
      estimatedChars: 320,
      activationEstimatedTokens: 120,
      budgetScope: 'startup-selection',
      enabled: true,
      controllable: true,
      controlMethod: 'mcp_servers.github.enabled',
      estimateStatus: 'estimated',
    },
  ];
}

async function fixture(overrides = {}) {
  const root = await mkdtemp(join(tmpdir(), 'context-optimizer-'));
  const projectDir = join(root, 'project');
  const stateDir = join(root, 'optimizer-state');
  const fakeStatePath = join(root, 'fake-state.json');
  await mkdir(projectDir);
  await writeFile(fakeStatePath, `${JSON.stringify({
    items: baseItems(),
    log: [],
    ...overrides,
  }, null, 2)}\n`);
  const env = {
    ...process.env,
    SKILL_DOCTOR_BIN: fakeCli,
    SKILL_DOCTOR_OPTIMIZER_HOME: stateDir,
    FAKE_SKILL_DOCTOR_STATE: fakeStatePath,
  };
  return { root, projectDir, stateDir, fakeStatePath, env };
}

async function run(args, env) {
  const { stdout } = await execFileAsync(process.execPath, [optimizer, ...args], {
    env,
    encoding: 'utf8',
    maxBuffer: 16 * 1024 * 1024,
  });
  return JSON.parse(stdout);
}

async function runFailure(args, env) {
  try {
    await execFileAsync(process.execPath, [optimizer, ...args], {
      env,
      encoding: 'utf8',
      maxBuffer: 16 * 1024 * 1024,
    });
  } catch (error) {
    return JSON.parse(error.stderr);
  }
  assert.fail('Expected command to fail');
}

async function readFakeState(path) {
  return JSON.parse(await readFile(path, 'utf8'));
}

async function snapshot(context, includeMcp = false) {
  return run([
    'snapshot',
    '--project', context.projectDir,
    '--platform', 'codex',
    ...(includeMcp ? ['--include-mcp'] : []),
  ], context.env);
}

test('top-level help does not require optimizer state', async () => {
  const { stdout } = await execFileAsync(process.execPath, [optimizer, '--help'], {
    encoding: 'utf8',
  });
  assert.match(stdout, /snapshot/);
  assert.match(stdout, /undo/);
});

test('safe snapshot inventories skills and plugins without MCP runtime discovery', async () => {
  const context = await fixture();
  const result = await snapshot(context);
  const fakeState = await readFakeState(context.fakeStatePath);

  assert.deepEqual(result.coverage.resources, ['skill', 'plugin']);
  assert.equal(result.coverage.mcpRuntimeDiscovery, false);
  assert.equal(result.summary.totalEstimatedTokens, 250);
  assert.equal(result.items.find((item) => item.kind === 'codex-skill-list').selectable, false);
  assert.equal(fakeState.log.some((entry) => entry.resource === 'mcp'), false);
});

test('MCP inventory requires the explicit include flag', async () => {
  const context = await fixture();
  const result = await snapshot(context, true);

  assert.deepEqual(result.coverage.resources, ['skill', 'plugin', 'mcp']);
  assert.equal(result.summary.totalEstimatedTokens, 330);
  assert.equal(result.items.some((item) => item.id === 'codex:mcp:github'), true);
});

test('preview expands one plugin child into one whole-plugin operation', async () => {
  const context = await fixture();
  const current = await snapshot(context);
  const plan = await run([
    'preview',
    '--snapshot', current.id,
    '--disable', 'codex:plugin:alpha@example:skill:one',
  ], context.env);

  assert.equal(plan.operations.length, 1);
  assert.equal(plan.operations[0].type, 'plugin');
  assert.deepEqual(
    plan.operations[0].affectedItems.map((item) => item.name).sort(),
    ['plugin-one', 'plugin-two'],
  );
  assert.equal(plan.estimate.fixedEstimatedTokens, 100);
  assert.equal(plan.estimate.activationPotentialTokens, 800);
  assert.equal(plan.estimate.billingMeasurement, false);
});

test('preview rejects aggregate estimates as toggle targets', async () => {
  const context = await fixture();
  const current = await snapshot(context);
  const failure = await runFailure([
    'preview',
    '--snapshot', current.id,
    '--disable', 'codex:skill-list:enabled',
  ], context.env);

  assert.equal(failure.error.selectionBlock, 'aggregate-estimate-only');
});

test('an MCP server operation supersedes selected tools beneath it', async () => {
  const items = baseItems();
  items.push({
    id: 'codex:mcp:github:tool:search',
    name: 'github/search',
    sourcePath: '/fake/config.toml',
    platform: 'codex',
    scope: 'global',
    resource: 'mcp',
    kind: 'mcp-tool-list',
    estimatedTokens: 20,
    estimatedChars: 80,
    activationEstimatedTokens: 30,
    budgetScope: 'startup-selection',
    enabled: true,
    controllable: true,
    controlMethod: 'mcp_servers.github.disabled_tools',
    estimateStatus: 'estimated',
  });
  const context = await fixture({ items });
  const current = await snapshot(context, true);
  const plan = await run([
    'preview',
    '--snapshot', current.id,
    '--disable', 'codex:mcp:github',
    '--disable', 'codex:mcp:github:tool:search',
  ], context.env);

  assert.equal(plan.operations.length, 1);
  assert.equal(plan.operations[0].type, 'mcp-server');
  assert.deepEqual(
    plan.operations[0].affectedItems.map((item) => item.name).sort(),
    ['github', 'github/search'],
  );
  assert.equal(plan.estimate.fixedEstimatedTokens, 100);
});

test('apply requires the exact digest, verifies savings, and can be undone', async () => {
  const context = await fixture();
  const current = await snapshot(context);
  const plan = await run([
    'preview',
    '--snapshot', current.id,
    '--disable', 'codex:skill:/skills/a/SKILL.md',
  ], context.env);

  const rejected = await runFailure([
    'apply', '--plan', plan.id, '--confirm', 'wrong-digest',
  ], context.env);
  assert.match(rejected.error.message, /digest/);
  assert.equal((await readFakeState(context.fakeStatePath)).items[0].enabled, true);

  const applied = await run([
    'apply', '--plan', plan.id, '--confirm', plan.confirmationDigest,
  ], context.env);
  assert.equal(applied.status, 'applied');
  assert.equal(applied.verifiedSavings.fixedEstimatedTokens, 100);
  assert.equal((await readFakeState(context.fakeStatePath)).items[0].enabled, false);

  const undone = await run([
    'undo', '--operation', applied.id,
  ], context.env);
  assert.equal(undone.status, 'undone');
  assert.equal((await readFakeState(context.fakeStatePath)).items[0].enabled, true);
});

test('apply rejects a plan record changed after preview', async () => {
  const context = await fixture();
  const current = await snapshot(context);
  const plan = await run([
    'preview',
    '--snapshot', current.id,
    '--disable', 'codex:skill:/skills/a/SKILL.md',
  ], context.env);
  const planPath = join(context.stateDir, 'plans', `${plan.id}.json`);
  const changedPlan = JSON.parse(await readFile(planPath, 'utf8'));
  changedPlan.operations[0].id = 'codex:skill:/skills/b/SKILL.md';
  await writeFile(planPath, `${JSON.stringify(changedPlan, null, 2)}\n`);

  const failure = await runFailure([
    'apply', '--plan', plan.id, '--confirm', plan.confirmationDigest,
  ], context.env);
  const fakeState = await readFakeState(context.fakeStatePath);

  assert.match(failure.error.message, /integrity/);
  assert.equal(fakeState.log.some((entry) => entry.command === 'disable'), false);
});

test('a later failure rolls back resources disabled earlier in the plan', async () => {
  const context = await fixture({
    failOnDisable: 'codex:skill:/skills/b/SKILL.md',
  });
  const current = await snapshot(context);
  const plan = await run([
    'preview',
    '--snapshot', current.id,
    '--disable', 'codex:skill:/skills/a/SKILL.md',
    '--disable', 'codex:skill:/skills/b/SKILL.md',
  ], context.env);
  const failure = await runFailure([
    'apply', '--plan', plan.id, '--confirm', plan.confirmationDigest,
  ], context.env);
  const fakeState = await readFakeState(context.fakeStatePath);

  assert.equal(failure.error.status, 'rolled-back');
  assert.equal(fakeState.items[0].enabled, true);
  assert.equal(fakeState.items[1].enabled, true);
  assert.equal(fakeState.log.some((entry) => entry.command === 'enable'
    && entry.id === 'codex:skill:/skills/a/SKILL.md'), true);
});

test('unknown costs are excluded from the savings number', async () => {
  const items = baseItems();
  items.push({
    id: 'codex:mcp:unknown',
    name: 'unknown-mcp',
    sourcePath: '/fake/config.toml',
    platform: 'codex',
    scope: 'global',
    resource: 'mcp',
    kind: 'mcp-server-config',
    estimatedTokens: 0,
    estimatedChars: 0,
    activationEstimatedTokens: 0,
    budgetScope: 'startup-selection',
    enabled: true,
    controllable: true,
    controlMethod: 'mcp_servers.unknown.enabled',
    estimateStatus: 'unknown',
  });
  const context = await fixture({ items });
  const current = await snapshot(context, true);
  const plan = await run([
    'preview',
    '--snapshot', current.id,
    '--disable', 'codex:mcp:unknown',
  ], context.env);

  assert.equal(plan.estimate.fixedEstimatedTokens, 0);
  assert.deepEqual(plan.estimate.unknownCostItems, [
    { id: 'codex:mcp:unknown', name: 'unknown-mcp' },
  ]);
});
