import { describe, expect, it } from 'vitest';

import {
  getDefaultInstallTarget,
  getPlatformAliasMappings,
  getPlatformAdapter,
  getPlatformAdapters,
  getPlatformCliValues,
  normalizePlatformName,
} from '../../src/platforms/registry';

describe('platform registry', () => {
  it('registers the supported discovery platforms once', () => {
    const platforms = getPlatformAdapters().map((adapter) => adapter.platform);

    expect(platforms).toEqual([
      'claude',
      'cursor',
      'copilot',
      'codex',
      'gemini',
      'windsurf',
      'trae',
      'opencode',
      'kiro',
      'openclaw',
      'hermes',
    ]);
    expect(new Set(platforms).size).toBe(platforms.length);
  });

  it('normalizes canonical platforms and aliases', () => {
    expect(normalizePlatformName('claude')).toBe('claude');
    expect(normalizePlatformName('claudecode')).toBe('claude');
    expect(normalizePlatformName('claude-code')).toBe('claude');
    expect(normalizePlatformName('nonexistent')).toBeNull();
  });

  it('keeps canonical names and aliases unique', () => {
    const names = getPlatformAdapters().flatMap((adapter) => [adapter.platform, ...adapter.aliases]);

    expect(new Set(names).size).toBe(names.length);
  });

  it('exposes CLI platform values and aliases from the registry', () => {
    expect(getPlatformCliValues({ includeUnknown: true })).toEqual([
      'claude',
      'cursor',
      'copilot',
      'codex',
      'gemini',
      'windsurf',
      'trae',
      'opencode',
      'kiro',
      'openclaw',
      'hermes',
      'unknown',
    ]);
    expect(getPlatformAliasMappings()).toEqual([
      { alias: 'claudecode', platform: 'claude' },
      { alias: 'claude-code', platform: 'claude' },
    ]);
  });

  it('exposes the default install target from adapter definitions', () => {
    const adapter = getPlatformAdapter('cursor');
    expect(adapter).toBeDefined();

    const target = getDefaultInstallTarget(adapter!);

    expect(target).toEqual({
      path: '~/.cursor/rules',
      mode: 'recursive-dir',
      layout: 'files',
    });
  });

  it('declares MCP config files on platform adapters', () => {
    expect(getPlatformAdapter('codex')?.mcpConfigFiles).toEqual([
      { scope: 'global', path: '~/.codex/config.toml', format: 'toml' },
      { scope: 'project', path: '.codex/config.toml', format: 'toml' },
    ]);
    expect(getPlatformAdapter('claude')?.mcpConfigFiles).toEqual([
      { scope: 'global', path: '~/.claude.json', format: 'json' },
      { scope: 'project', path: '.mcp.json', format: 'json' },
    ]);
    expect(getPlatformAdapter('gemini')?.mcpConfigFiles).toEqual([
      { scope: 'global', path: '~/.gemini/settings.json', format: 'json' },
      { scope: 'project', path: '.gemini/settings.json', format: 'json' },
    ]);
    expect(getPlatformAdapter('cursor')?.mcpConfigFiles).toEqual([
      { scope: 'global', path: '~/.cursor/mcp.json', format: 'json' },
      { scope: 'project', path: '.cursor/mcp.json', format: 'json' },
    ]);
    expect(getPlatformAdapter('copilot')?.mcpConfigFiles).toEqual([
      { scope: 'project', path: '.vscode/mcp.json', format: 'json' },
      { scope: 'project', path: '.github/mcp.json', format: 'json' },
    ]);
  });

  it('keeps context cost policies on platform adapters', () => {
    for (const platform of ['claude', 'codex', 'copilot', 'cursor', 'gemini', 'windsurf'] as const) {
      const adapter = getPlatformAdapter(platform);

      expect(adapter?.costPolicy.defaultProfile).toBeDefined();
      expect(adapter?.costPolicy.rules.length).toBeGreaterThan(0);
    }
  });
});
