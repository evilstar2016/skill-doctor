import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  getDefaultUserConfigPath,
  loadUserConfig,
} from '../../src/config/loadUserConfig';

describe('loadUserConfig', () => {
  it('returns an empty config when the user config file is missing', () => {
    const homeDir = mkdtempSync(join(tmpdir(), 'skill-doctor-home-'));

    const result = loadUserConfig(homeDir);

    expect(result.config).toEqual({});
    expect(result.path).toBe(join(homeDir, '.skill-doctor', 'config.json'));
  });

  it('loads embedding settings from the default user config path', () => {
    const homeDir = mkdtempSync(join(tmpdir(), 'skill-doctor-home-'));
    const configPath = getDefaultUserConfigPath(homeDir);
    mkdirSync(join(homeDir, '.skill-doctor'), { recursive: true });
    writeFileSync(
      configPath,
      JSON.stringify(
        {
          embedding: {
            baseUrl: 'http://127.0.0.1:3000/v1',
            model: 'bge-m3',
            apiKey: 'secret',
          },
        },
        null,
        2,
      ),
      'utf-8',
    );

    const result = loadUserConfig(homeDir);

    expect(result.config).toEqual({
      embedding: {
        baseUrl: 'http://127.0.0.1:3000/v1',
        model: 'bge-m3',
        apiKey: 'secret',
      },
    });
  });

  it('loads analysis settings from the user config', () => {
    const homeDir = mkdtempSync(join(tmpdir(), 'skill-doctor-home-'));
    const configPath = getDefaultUserConfigPath(homeDir);
    mkdirSync(join(homeDir, '.skill-doctor'), { recursive: true });
    writeFileSync(
      configPath,
      JSON.stringify(
        {
          embedding: { baseUrl: 'http://127.0.0.1:3000/v1', model: 'bge-m3' },
          analysis: { baseUrl: 'http://127.0.0.1:11434/v1', model: 'llama3.2', apiKey: 'local' },
        },
        null,
        2,
      ),
      'utf-8',
    );

    const result = loadUserConfig(homeDir);

    expect(result.config.analysis).toEqual({
      baseUrl: 'http://127.0.0.1:11434/v1',
      model: 'llama3.2',
      apiKey: 'local',
    });
  });

  it('throws a clear error for invalid config json', () => {
    const homeDir = mkdtempSync(join(tmpdir(), 'skill-doctor-home-'));
    const configPath = getDefaultUserConfigPath(homeDir);
    mkdirSync(join(homeDir, '.skill-doctor'), { recursive: true });
    writeFileSync(configPath, '{ invalid', 'utf-8');

    expect(() => loadUserConfig(homeDir)).toThrow(
      `Failed to read skill-doctor config "${configPath}".`,
    );
  });
});
