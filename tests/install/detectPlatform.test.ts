import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, describe, expect, it } from 'vitest';
import { detectPlatform } from '../../src/install/detectPlatform.js';

const tempRoots: string[] = [];

afterEach(() => {
  for (const root of tempRoots) {
    rmSync(root, { recursive: true, force: true });
  }
  tempRoots.length = 0;
});

function makeTempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'skill-doctor-detect-'));
  tempRoots.push(dir);
  return dir;
}

describe('detectPlatform', () => {
  it('detects claude when .claude/skills directory exists', () => {
    const homeDir = makeTempDir();
    mkdirSync(join(homeDir, '.claude', 'skills'), { recursive: true });
    const result = detectPlatform({ homeDir });
    expect(result?.platform).toBe('claude');
    expect(result?.layout).toBe('skill-dirs');
  });

  it('detects cursor when .cursor/rules directory exists', () => {
    const homeDir = makeTempDir();
    mkdirSync(join(homeDir, '.cursor', 'rules'), { recursive: true });
    const result = detectPlatform({ homeDir });
    expect(result?.platform).toBe('cursor');
    expect(result?.layout).toBe('files');
  });

  it('prefers claude over cursor when both exist (high confidence first)', () => {
    const homeDir = makeTempDir();
    mkdirSync(join(homeDir, '.claude', 'skills'), { recursive: true });
    mkdirSync(join(homeDir, '.cursor', 'rules'), { recursive: true });
    const result = detectPlatform({ homeDir });
    expect(result?.platform).toBe('claude');
  });

  it('returns undefined when no platform is detected', () => {
    const homeDir = makeTempDir();
    const result = detectPlatform({ homeDir });
    expect(result).toBeUndefined();
  });
});
