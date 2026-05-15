import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { spawn, spawnSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { tmpdir } from 'node:os';

const tempRoots: string[] = [];
const cliEntry = resolve(process.cwd(), 'dist', 'index.cjs');

export interface AsyncCliResult {
  status: number | null;
  stdout: string;
  stderr: string;
}

export function buildCli(): void {
  const build = spawnSync('npm', ['run', 'build'], {
    cwd: process.cwd(),
    encoding: 'utf8',
    shell: true,
  });

  if (build.status !== 0) {
    throw new Error(build.stderr || build.stdout || 'build failed');
  }
}

export function createTempRoot(prefix = 'skill-doctor-cli-'): string {
  const root = mkdtempSync(join(tmpdir(), prefix));
  tempRoots.push(root);
  return root;
}

export function cleanupTempRoots(): void {
  for (const root of tempRoots) {
    rmSync(root, { recursive: true, force: true });
  }

  tempRoots.length = 0;
}

export function writeFile(filePath: string, content: string): void {
  mkdirSync(dirname(filePath), { recursive: true });
  writeFileSync(filePath, content, 'utf8');
}

export function runCli(args: string[], cwd: string, homeDir: string, stdin?: string) {
  return spawnSync(process.execPath, [cliEntry, ...args], {
    cwd,
    env: {
      ...process.env,
      HOME: homeDir,
      USERPROFILE: homeDir,
    },
    encoding: 'utf8',
    input: stdin,
  });
}

export function runCliAsync(args: string[], cwd: string, homeDir: string): Promise<AsyncCliResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [cliEntry, ...args], {
      cwd,
      env: {
        ...process.env,
        HOME: homeDir,
        USERPROFILE: homeDir,
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';

    child.stdout.setEncoding('utf8');
    child.stdout.on('data', (chunk) => {
      stdout += chunk;
    });

    child.stderr.setEncoding('utf8');
    child.stderr.on('data', (chunk) => {
      stderr += chunk;
    });

    child.on('error', reject);
    child.on('close', (status) => {
      resolve({ status, stdout, stderr });
    });
  });
}
