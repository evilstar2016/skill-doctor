import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { scanCodexPluginCache } from '../../src/context/scanCodexPluginCache';

const roots: string[] = [];

afterEach(() => {
  for (const root of roots) rmSync(root, { recursive: true, force: true });
  roots.length = 0;
});

function tempRoot(): string {
  const root = mkdtempSync(join(tmpdir(), 'skill-doctor-plugin-cache-'));
  roots.push(root);
  return root;
}

function writeFile(path: string, content: string): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content, 'utf8');
}

describe('scanCodexPluginCache', () => {
  it('inventories cached plugin UI entries without treating them as context cost', () => {
    const cacheRoot = tempRoot();
    const pluginRoot = join(cacheRoot, 'openai-curated-remote', 'openai-templates', '0.1.0');
    writeFile(
      join(pluginRoot, '.codex-plugin', 'plugin.json'),
      JSON.stringify({
        name: 'openai-templates',
        version: '0.1.0',
        description: 'OpenAI templates.',
        skills: './skills/',
        interface: {
          displayName: 'Default templates',
          shortDescription: 'Default artifact templates',
          logo: './assets/icon.svg',
        },
      }),
    );
    const skillRoot = join(pluginRoot, 'skills', 'artifact-template-system-design');
    writeFile(
      join(skillRoot, 'SKILL.md'),
      ['---', 'name: artifact-template-system-design', 'description: Model routing description.', '---'].join('\n'),
    );
    writeFile(
      join(skillRoot, 'agents', 'openai.yaml'),
      [
        'interface:',
        '  display_name: "System Design"',
        '  short_description: "Create documents with the System Design template"',
        '  icon_large: "./assets/preview.png"',
        '  default_prompt: "Create a new document with this template."',
        'policy:',
        '  allow_implicit_invocation: false',
      ].join('\n'),
    );

    const result = scanCodexPluginCache({ cacheRoot });

    expect(result).toEqual(expect.objectContaining({
      cacheRoot,
      status: 'cached',
      countedInContextCost: false,
      summary: { plugins: 1, uiEntries: 1, explicitOnlyEntries: 1 },
    }));
    expect(result.plugins[0]).toEqual(expect.objectContaining({
      id: 'openai-curated-remote:openai-templates@0.1.0',
      displayName: 'Default templates',
      description: 'Default artifact templates',
      cacheSource: 'openai-curated-remote',
      countedInContextCost: false,
    }));
    expect(result.plugins[0]?.entries[0]).toEqual(expect.objectContaining({
      id: 'openai-templates:artifact-template-system-design',
      displayName: 'System Design',
      description: 'Create documents with the System Design template',
      invocation: 'explicit-only',
      iconPath: join(skillRoot, 'assets', 'preview.png'),
      countedInContextCost: false,
    }));
  });

  it('returns an empty catalog for a missing cache directory', () => {
    const cacheRoot = join(tempRoot(), 'missing');

    expect(scanCodexPluginCache({ cacheRoot })).toEqual({
      cacheRoot,
      status: 'cached',
      countedInContextCost: false,
      summary: { plugins: 0, uiEntries: 0, explicitOnlyEntries: 0 },
      plugins: [],
    });
  });
});
