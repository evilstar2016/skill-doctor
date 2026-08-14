import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';

import { afterEach, describe, expect, it } from 'vitest';

import { loadEffectiveScanSources } from '../../src/config/scanSources';
import { estimateContextCost } from '../../src/context/estimateContextCost';
import { scanSkills } from '../../src/discovery/scanSkills';
import { resolveInstallTarget } from '../../src/install/resolveInstallPath';
import { scanMcpServers } from '../../src/mcp/scanMcpServers';
import { parseSkill } from '../../src/parsing/parseSkill';
import { getPlatformAdapter } from '../../src/platforms/registry';

const roots: string[] = [];

afterEach(() => {
  for (const root of roots) rmSync(root, { recursive: true, force: true });
  roots.length = 0;
});

function root(): string {
  const value = mkdtempSync(join(tmpdir(), 'skill-doctor-workbuddy-'));
  roots.push(value);
  return value;
}

function write(filePath: string, content: string): void {
  mkdirSync(dirname(filePath), { recursive: true });
  writeFileSync(filePath, content, 'utf8');
}

function skill(name: string, options: { description?: string; disable?: string; userInvocable?: string; allowedTools?: string } = {}): string {
  return [
    '---',
    `name: ${name}`,
    `description: ${options.description ?? `Use ${name}.`}`,
    'when-to-use: When this task is requested.',
    options.disable ?? '',
    options.userInvocable ?? '',
    options.allowedTools ?? '',
    '---',
    '',
    `# ${name}`,
    '',
    'Detailed instructions live here.',
  ].filter(Boolean).join('\n');
}

describe('WorkBuddy adapter', () => {
  it('declares stable skill, memory, MCP, and install contracts', () => {
    const adapter = getPlatformAdapter('workbuddy');

    expect(adapter).toBeDefined();
    expect(adapter?.displayName).toBe('WorkBuddy');
    expect(adapter?.global).toEqual(expect.arrayContaining([
      expect.objectContaining({ path: '~/.workbuddy/skills', maxDepth: 5 }),
      expect.objectContaining({ path: '~/.workbuddy/connectors/skills', maxDepth: 5 }),
      expect.objectContaining({ path: '~/.workbuddy/MEMORY.md', mode: 'single-file' }),
    ]));
    expect(adapter?.project).toEqual([
      expect.objectContaining({ path: '.workbuddy/skills', maxDepth: 5 }),
    ]);
    expect(adapter?.installTargets).toEqual(expect.arrayContaining([
      expect.objectContaining({ targetId: 'workbuddy-global-skills', scope: 'global' }),
      expect.objectContaining({ targetId: 'workbuddy-project-skills', scope: 'project' }),
    ]));
    expect(adapter?.installTargets.some((target) => target.path.includes('connector') || target.path.includes('marketplace'))).toBe(false);
  });

  it('returns empty results when WorkBuddy is not installed and does not scan dynamic paths', async () => {
    const base = root();
    const homeDir = join(base, 'home');
    const projectDir = join(base, 'project');
    write(join(homeDir, '.workbuddy', 'connectors', 'user-1', 'skills', 'dynamic', 'SKILL.md'), skill('dynamic'));

    const sources = loadEffectiveScanSources(projectDir, { homeDir });
    const skills = await scanSkills(projectDir, { homeDir, sources });
    const servers = scanMcpServers(projectDir, { homeDir });

    expect(skills.filter((entry) => entry.platform === 'workbuddy')).toEqual([]);
    expect(servers.filter((entry) => entry.platform === 'workbuddy')).toEqual([]);
  });

  it('supports the project-only acceptance case with project-scoped cost', async () => {
    const base = root();
    const homeDir = join(base, 'home');
    const projectDir = join(base, 'project');
    write(join(projectDir, '.workbuddy', 'skills', 'project-only', 'SKILL.md'), skill('project-only'));

    const skills = await scanSkills(projectDir, {
      homeDir,
      sources: loadEffectiveScanSources(projectDir, { homeDir }),
    });
    const workbuddy = skills.filter((entry) => entry.platform === 'workbuddy');
    const result = estimateContextCost(workbuddy, { tokenizer: 'approx', scope: 'project' });

    expect(workbuddy).toEqual([expect.objectContaining({ name: 'project-only', scope: 'project' })]);
    expect(result.items).toEqual([expect.objectContaining({ name: 'project-only', platform: 'workbuddy', scope: 'project' })]);
  });

  it('scans nested skills, excludes marketplace caches, and applies WorkBuddy precedence', async () => {
    const base = root();
    const homeDir = join(base, 'home');
    const projectDir = join(base, 'project');

    write(join(projectDir, '.workbuddy', 'skills', 'shared', 'SKILL.md'), skill('shared'));
    write(join(projectDir, '.workbuddy', 'skills', 'fifth', 'one', 'two', 'three', 'four', 'SKILL.md'), skill('fifth'));
    write(join(projectDir, '.workbuddy', 'skills', 'sixth', 'one', 'two', 'three', 'four', 'five', 'SKILL.md'), skill('sixth'));
    write(join(projectDir, '.workbuddy', 'skills', 'group', 'level2', 'level3', 'level4', 'nested', 'SKILL.md'), skill('nested'));
    write(join(projectDir, '.workbuddy', 'skills', 'group', 'level2', 'level3', 'level4', 'nested', 'too', 'deep', 'SKILL.md'), skill('too-deep'));
    write(join(homeDir, '.workbuddy', 'skills', 'shared', 'SKILL.md'), skill('shared'));
    write(join(homeDir, '.workbuddy', 'connectors', 'skills', 'shared', 'SKILL.md'), skill('shared'));
    write(join(homeDir, '.workbuddy', 'connectors', 'skills', 'connector-only', 'SKILL.md'), skill('connector-only', { userInvocable: 'user-invocable: false' }));
    write(join(homeDir, '.workbuddy', 'skills-marketplace', 'cached', 'SKILL.md'), skill('cached'));
    write(join(homeDir, '.workbuddy', 'IDENTITY.md'), 'Agent identity.');
    write(join(homeDir, '.workbuddy', 'USER.md'), 'User preferences.');
    write(join(homeDir, '.workbuddy', 'SOUL.md'), 'Agent personality.');
    write(join(homeDir, '.workbuddy', 'MEMORY.md'), 'Long-term memory.');
    write(join(homeDir, '.workbuddy', 'BOOTSTRAP.md'), 'First-run only.');

    const sources = loadEffectiveScanSources(projectDir, { homeDir });
    const skills = await scanSkills(projectDir, { homeDir, sources });
    const workbuddy = skills.filter((entry) => entry.platform === 'workbuddy');

    expect(workbuddy.map((entry) => entry.name)).toEqual(expect.arrayContaining([
      'shared', 'nested', 'fifth', 'connector-only', 'IDENTITY.md', 'USER.md', 'SOUL.md', 'MEMORY.md',
    ]));
    expect(workbuddy.map((entry) => entry.name)).not.toContain('too-deep');
    expect(workbuddy.map((entry) => entry.name)).not.toContain('sixth');
    expect(workbuddy.map((entry) => entry.name)).not.toContain('BOOTSTRAP.md');
    expect(workbuddy.map((entry) => entry.name)).not.toContain('cached');

    const shared = workbuddy.filter((entry) => entry.name === 'shared');
    expect(shared).toHaveLength(3);
    expect(shared.find((entry) => entry.scope === 'project')?.context?.enabled).not.toBe(false);
    expect(shared.filter((entry) => entry.scope === 'global').every((entry) => entry.context?.enabled === false)).toBe(true);
    expect(shared.find((entry) => entry.sourcePath.includes('/connectors/skills/'))?.context?.configSource).toBe('workbuddy-connector-skills');
    expect(workbuddy.find((entry) => entry.name === 'connector-only')?.context?.userInvocable).toBe(false);
    expect(workbuddy.filter((entry) => entry.context?.resource === 'memory')).toHaveLength(4);
  });

  it('counts only effective skills and stable context files', async () => {
    const base = root();
    const homeDir = join(base, 'home');
    const projectDir = join(base, 'project');

    write(join(projectDir, '.workbuddy', 'skills', 'shared', 'SKILL.md'), skill('shared', { description: 'Project copy.' }));
    write(join(homeDir, '.workbuddy', 'skills', 'shared', 'SKILL.md'), skill('shared', { description: 'Global copy.' }));
    write(join(homeDir, '.workbuddy', 'connectors', 'skills', 'shared', 'SKILL.md'), skill('shared', { description: 'Connector copy.' }));
    write(join(homeDir, '.workbuddy', 'skills', 'disabled', 'SKILL.md'), skill('disabled', { disable: 'disable-model-invocation: true' }));
    write(join(homeDir, '.workbuddy', 'MEMORY.md'), 'Long-term memory that is always loaded.');

    const skills = await scanSkills(projectDir, {
      homeDir,
      sources: loadEffectiveScanSources(projectDir, { homeDir }),
    });
    const workbuddy = skills.filter((entry) => entry.platform === 'workbuddy');
    const result = estimateContextCost(workbuddy, { tokenizer: 'approx' });

    expect(result.items.filter((entry) => entry.name === 'shared')).toHaveLength(1);
    expect(result.items.find((entry) => entry.name === 'shared')).toEqual(expect.objectContaining({
      scope: 'project',
      configSource: 'workbuddy-project-skills',
    }));
    expect(result.disabledItems?.filter((entry) => entry.name === 'shared')).toHaveLength(2);
    expect(result.disabledItems?.find((entry) => entry.name === 'disabled')).toEqual(expect.objectContaining({ enabled: false }));
    expect(result.items.find((entry) => entry.name === 'MEMORY.md')).toEqual(expect.objectContaining({
      source: 'memory',
      resource: 'memory',
      kind: 'memory-context-unknown',
    }));
  });

  it('keeps a disabled high-priority copy visible without falling back to a lower-priority name', async () => {
    const base = root();
    const homeDir = join(base, 'home');
    const projectDir = join(base, 'project');

    write(join(projectDir, '.workbuddy', 'skills', 'shared', 'SKILL.md'), skill('shared', { disable: 'disable: true' }));
    write(join(homeDir, '.workbuddy', 'skills', 'shared', 'SKILL.md'), skill('shared'));
    write(join(homeDir, '.workbuddy', 'connectors', 'skills', 'shared', 'SKILL.md'), skill('shared'));

    const skills = await scanSkills(projectDir, {
      homeDir,
      sources: loadEffectiveScanSources(projectDir, { homeDir }),
    });
    const result = estimateContextCost(skills.filter((entry) => entry.platform === 'workbuddy'), { tokenizer: 'approx' });

    expect(skills.filter((entry) => entry.platform === 'workbuddy' && entry.name === 'shared')).toHaveLength(3);
    expect(result.items.filter((entry) => entry.name === 'shared')).toHaveLength(0);
    expect(result.disabledItems?.filter((entry) => entry.name === 'shared')).toHaveLength(3);
    expect(result.disabledItems?.filter((entry) => entry.name === 'shared').every((entry) => entry.enabled === false)).toBe(true);
  });

  it('keeps WorkBuddy precedence isolated from another platform with the same Skill name', async () => {
    const base = root();
    const homeDir = join(base, 'home');
    const projectDir = join(base, 'project');
    write(join(projectDir, '.workbuddy', 'skills', 'shared', 'SKILL.md'), skill('shared'));
    write(join(projectDir, '.claude', 'skills', 'shared', 'SKILL.md'), skill('shared'));

    const skills = await scanSkills(projectDir, {
      homeDir,
      sources: loadEffectiveScanSources(projectDir, { homeDir }),
    });
    expect(skills.find((entry) => entry.platform === 'claude' && entry.name === 'shared')?.context).toBeUndefined();
    expect(skills.find((entry) => entry.platform === 'workbuddy' && entry.name === 'shared')?.context?.enabled).not.toBe(false);
  });

  it('parses WorkBuddy metadata, aliases, model controls, and allowed tools without leaking malformed metadata', async () => {
    const base = root();
    const skillDir = join(base, 'skill');
    const filePath = join(skillDir, 'SKILL.md');
    write(filePath, [
      '---',
      'name: frontmatter-name',
      'description_zh: 中文描述',
      'when-to-use: 处理 WorkBuddy 任务',
      'disable-model-invocation: true',
      'user-invocable: false',
      'allowed-tools: [search, fetch]',
      '---',
      '',
      '# WorkBuddy Skill',
    ].join('\n'));
    write(join(skillDir, '_skillhub_meta.json'), JSON.stringify({
      name: 'metadata-name',
      description: 'Metadata description',
      author: { name: 'Metadata Author' },
      repository: { url: 'https://example.test/repo' },
    }));
    write(join(skillDir, '_marketplace_meta.json'), '{broken-json');

    const record = await parseSkill({
      filePath,
      platform: 'workbuddy',
      scope: 'project',
      confidence: 'high',
      installSource: '.workbuddy/skills',
    });

    expect(record).toEqual(expect.objectContaining({
      name: 'frontmatter-name',
      description: '中文描述',
      triggers: expect.arrayContaining(['处理 WorkBuddy 任务']),
      provenance: expect.objectContaining({ author: 'Metadata Author', repository: 'https://example.test/repo' }),
      context: {
        userInvocable: false,
        allowedTools: ['search', 'fetch'],
        enabled: false,
        controllable: false,
        controlMethod: 'workbuddy-disable-model-invocation',
      },
    }));
  });

  it('scans static user and project MCP files without exposing secrets', () => {
    const base = root();
    const homeDir = join(base, 'home');
    const projectDir = join(base, 'project');

    write(join(homeDir, '.workbuddy', 'mcp.json'), JSON.stringify({
      mcpServers: {
        shared: { command: 'node', env: { WORKBUDDY_TOKEN: 'user-secret' } },
      },
    }));
    write(join(projectDir, '.workbuddy', 'mcp.json'), JSON.stringify({
      mcpServers: {
        shared: { url: 'https://example.test/mcp', headers: { Authorization: 'Bearer project-secret' } },
        projectOnly: { command: 'node' },
      },
    }));

    const servers = scanMcpServers(projectDir, { homeDir }).filter((entry) => entry.platform === 'workbuddy');
    expect(servers).toHaveLength(3);
    expect(servers.filter((entry) => entry.name === 'shared').map((entry) => entry.scope).sort()).toEqual(['global', 'project']);
    expect(JSON.stringify(servers)).not.toContain('secret');
  });

  it('isolates damaged user MCP config, preserves disabled state, and ignores dynamic connector MCP', () => {
    const base = root();
    const homeDir = join(base, 'home');
    const projectDir = join(base, 'project');

    write(join(homeDir, '.workbuddy', 'mcp.json'), '{broken-json');
    write(join(projectDir, '.workbuddy', 'mcp.json'), JSON.stringify({
      mcpServers: {
        disabled: { enabled: false, command: 'node' },
        projectOnly: { command: 'node' },
      },
    }));
    write(join(homeDir, '.workbuddy', 'connectors', 'user-1', 'mcp.json'), JSON.stringify({
      mcpServers: { dynamic: { command: 'node' } },
    }));

    const active = scanMcpServers(projectDir, { homeDir });
    expect(active.map((entry) => entry.name)).toEqual(['projectOnly']);

    const all = scanMcpServers(projectDir, { homeDir, includeDisabled: true });
    expect(all).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: 'projectOnly', scope: 'project', enabled: true }),
      expect.objectContaining({ name: 'disabled', scope: 'project', enabled: false }),
    ]));
    expect(all.map((entry) => entry.name)).not.toContain('dynamic');
  });

  it('resolves project and global installation targets', () => {
    expect(resolveInstallTarget('workbuddy', { homeDir: '/home/tester' })).toEqual({
      platform: 'workbuddy',
      scope: 'global',
      globalDir: '/home/tester/.workbuddy/skills',
      layout: 'skill-dirs',
    });
    expect(resolveInstallTarget('workbuddy', { homeDir: '/home/tester', projectDir: '/workspace/app', scope: 'project' })).toEqual({
      platform: 'workbuddy',
      scope: 'project',
      globalDir: '/workspace/app/.workbuddy/skills',
      layout: 'skill-dirs',
    });
  });
});
