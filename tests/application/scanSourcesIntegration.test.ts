import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { compareResources } from '../../src/application/resourceQueries';
import { runHealthCheck } from '../../src/application/runHealthCheck';
import { saveUserConfig } from '../../src/config/loadUserConfig';

describe('configured scan source integration', () => {
  it.skipIf(process.platform === 'win32')('scans custom Skill, MCP and Codex Plugin sources from one user config', async () => {
    const root = mkdtempSync(join(tmpdir(), 'skill-doctor-sources-'));
    const homeDir = join(root, 'home');
    const projectDir = join(root, 'project');
    const skillRoot = join(root, 'skills');
    const codexSkillRoot = join(root, 'codex-skills');
    const pluginRoot = join(root, 'plugin');
    mkdirSync(join(skillRoot, 'custom-skill'), { recursive: true });
    mkdirSync(join(codexSkillRoot, 'codex-skill'), { recursive: true });
    mkdirSync(join(pluginRoot, '.codex-plugin'), { recursive: true });
    mkdirSync(join(pluginRoot, 'skills', 'plugin-skill'), { recursive: true });
    mkdirSync(projectDir, { recursive: true });
    writeFileSync(join(skillRoot, 'custom-skill', 'SKILL.md'), '---\nname: custom-skill\ndescription: custom\n---\n');
    writeFileSync(join(codexSkillRoot, 'codex-skill', 'SKILL.md'), '---\nname: codex-skill\ndescription: codex\n---\n');
    writeFileSync(join(root, 'mcp.json'), JSON.stringify({ mcpServers: { customMcp: { url: 'https://example.test/mcp' } } }));
    writeFileSync(join(pluginRoot, '.codex-plugin', 'plugin.json'), JSON.stringify({ name: 'custom-plugin' }));
    writeFileSync(join(pluginRoot, 'skills', 'plugin-skill', 'SKILL.md'), '---\nname: plugin-skill\ndescription: plugin\n---\n');

    saveUserConfig({ scanSources: {
      claude: {
        skills: [{ id: 'custom-skill-root', scope: 'global', path: skillRoot, enabled: true, mode: 'recursive-dir', layout: 'skill-dirs' }],
        mcp: [{ id: 'custom-mcp', scope: 'global', path: join(root, 'mcp.json'), enabled: true, format: 'json' }],
      },
      codex: {
        skills: [{ id: 'custom-codex-skill-root', scope: 'global', path: codexSkillRoot, enabled: true, mode: 'recursive-dir', layout: 'skill-dirs' }],
        plugins: [{ id: 'custom-plugin', scope: 'global', path: join(pluginRoot, '.codex-plugin', 'plugin.json'), enabled: true }],
      },
    } }, homeDir);

    const result = await runHealthCheck({ projectDir, homeDir, includeContext: true, includeCache: false, discoverMcpTools: false });

    expect(result.resources).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: 'custom-skill' }),
      expect.objectContaining({ name: 'codex-skill' }),
      expect.objectContaining({ name: 'customMcp', kind: 'mcp' }),
      expect.objectContaining({ name: 'plugin-skill', kind: 'plugin' }),
    ]));

    const customSkill = result.resources.find((resource) => resource.name === 'custom-skill');
    const codexSkill = result.resources.find((resource) => resource.name === 'codex-skill');
    const comparison = await compareResources(result, customSkill!.id, codexSkill!.id, homeDir);

    expect(comparison.skillA.name).toBe('custom-skill');
    expect(comparison.skillB.name).toBe('codex-skill');
  });
});
