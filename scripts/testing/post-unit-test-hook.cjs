const { existsSync, readdirSync } = require('node:fs');
const { resolve } = require('node:path');
const { spawnSync } = require('node:child_process');

const repoRoot = resolve(__dirname, '..', '..');
const scenariosRoot = resolve(repoRoot, 'doc', 'scenarios');

function readStdin() {
  return new Promise((resolvePromise, rejectPromise) => {
    let body = '';

    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (chunk) => {
      body += chunk;
    });
    process.stdin.on('end', () => {
      resolvePromise(body);
    });
    process.stdin.on('error', rejectPromise);
  });
}

function normalize(value) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

function isUnitTestCommand(command) {
  const normalized = command.replace(/\s+/g, ' ').trim();

  if (!normalized) {
    return false;
  }

  if (normalized.includes('test:scenarios') || normalized.includes('verify:feature')) {
    return false;
  }

  return [/^npm test(?:\s|$)/, /^npm run test(?:\s|$)/, /^npm run test:watch(?:\s|$)/, /^npx vitest(?:\s|$)/].some((pattern) => pattern.test(normalized));
}

function listFeatures() {
  if (!existsSync(scenariosRoot)) {
    return [];
  }

  return readdirSync(scenariosRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && existsSync(resolve(scenariosRoot, entry.name, 'manifest.json')))
    .map((entry) => entry.name);
}

function getCurrentBranch() {
  const branch = spawnSync('git', ['branch', '--show-current'], {
    cwd: repoRoot,
    encoding: 'utf8',
    shell: true,
  });

  return branch.status === 0 ? branch.stdout.trim() : '';
}

function inferFeature(branch, features) {
  const normalizedBranch = normalize(branch);
  const exactMatches = features.filter((feature) => normalizedBranch.includes(normalize(feature)));

  if (exactMatches.length === 1) {
    return exactMatches[0];
  }

  if (exactMatches.length > 1) {
    return null;
  }

  const prefixMatches = features.filter((feature) => {
    const prefix = normalize(feature).split('-').slice(0, 2).join('-');
    return prefix && normalizedBranch.includes(prefix);
  });

  return prefixMatches.length === 1 ? prefixMatches[0] : null;
}

async function main() {
  const raw = await readStdin();
  const payload = raw ? JSON.parse(raw) : {};
  const command = payload.tool_input?.command;

  if (typeof command !== 'string' || !isUnitTestCommand(command)) {
    return;
  }

  const features = listFeatures();
  if (features.length === 0) {
    return;
  }

  const branch = getCurrentBranch();
  const feature = inferFeature(branch, features);

  if (!feature) {
    console.log(`[scenario-hook] skipped: branch '${branch || 'unknown'}' does not map to a single feature manifest.`);
    return;
  }

  console.log(`[scenario-hook] running feature scenarios for ${feature}`);
  const result = spawnSync('npm', ['run', 'test:scenarios', '--', '--feature', feature], {
    cwd: repoRoot,
    stdio: 'inherit',
    shell: true,
  });

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
