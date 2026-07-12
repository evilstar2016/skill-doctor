import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { loadUserConfig, saveUserConfig } from '../../src/config/loadUserConfig';
import { loadEffectiveScanSources, validateScanSourcesConfig, withScanSources } from '../../src/config/scanSources';

describe('scan source configuration', () => {
  it('shows builtin paths even when they do not exist', () => {
    const homeDir = mkdtempSync(join(tmpdir(), 'skill-doctor-home-'));
    const projectDir = join(homeDir, 'project');
    mkdirSync(projectDir);

    const sources = loadEffectiveScanSources(projectDir, { homeDir });

    expect(sources).toEqual(expect.arrayContaining([
      expect.objectContaining({ platform: 'claude', resource: 'skill', path: '~/.claude/skills', origin: 'builtin', status: 'missing' }),
      expect.objectContaining({ platform: 'codex', resource: 'plugin', origin: 'builtin' }),
    ]));
  });

  it('merges builtin overrides and user entries by stable id', () => {
    const homeDir = mkdtempSync(join(tmpdir(), 'skill-doctor-home-'));
    const projectDir = join(homeDir, 'project');
    const customDir = join(homeDir, 'custom-skills');
    mkdirSync(projectDir);
    mkdirSync(customDir);
    saveUserConfig({
      scanSources: {
        claude: {
          skills: [
            { id: 'builtin-claude-skill-global-1', scope: 'global', path: '~/.claude/skills', enabled: false },
            { id: 'user-custom', scope: 'global', path: customDir, enabled: true, mode: 'recursive-dir', layout: 'skill-dirs' },
          ],
        },
      },
    }, homeDir);

    const sources = loadEffectiveScanSources(projectDir, { homeDir });
    expect(sources).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'builtin-claude-skill-global-1', enabled: false, origin: 'override' }),
      expect.objectContaining({ id: 'user-custom', resolvedPath: customDir, status: 'exists', origin: 'user' }),
    ]));
  });

  it('validates agent, scope, duplicate ids and MCP format', () => {
    expect(() => validateScanSourcesConfig({ alien: {} })).toThrow('不支持的 Agent');
    expect(() => validateScanSourcesConfig({ claude: { tools: [] } })).toThrow('不支持的资源类型');
    expect(() => validateScanSourcesConfig({ claude: { skills: [{ id: 'x', path: '/x', scope: 'other' }] } })).toThrow('scope 无效');
    expect(() => validateScanSourcesConfig({ claude: { mcp: [{ id: 'x', path: '/x', scope: 'global', format: 'yaml' }] } })).toThrow('MCP format');
    expect(() => validateScanSourcesConfig({ claude: { skills: [
      { id: 'x', path: '/x', scope: 'global' }, { id: 'x', path: '/y', scope: 'global' },
    ] } })).toThrow('重复 id');
  });

  it('atomically saves scanSources without dropping other user settings', () => {
    const homeDir = mkdtempSync(join(tmpdir(), 'skill-doctor-home-'));
    const loaded = { analysis: { baseUrl: 'http://localhost', model: 'local' }, ignore: { skillNames: ['keep-me'] } };
    saveUserConfig(withScanSources(loaded, { codex: { skills: [] } }), homeDir);

    const result = loadUserConfig(homeDir);
    expect(result.config.analysis?.model).toBe('local');
    expect(result.config.ignore?.skillNames).toEqual(['keep-me']);
    expect(result.config.scanSources?.codex?.skills).toEqual([]);
    expect(existsSync(`${result.path}.tmp`)).toBe(false);
    expect(JSON.parse(readFileSync(result.path, 'utf8'))).toMatchObject({ scanSources: { codex: { skills: [] } } });
  });
});
