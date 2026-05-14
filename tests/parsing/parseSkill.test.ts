import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { parseSkill } from '../../src/parsing/parseSkill';
import type { SkillFile } from '../../src/types/skill';

function fixturePath(name: string): string {
  return join(process.cwd(), 'tests', 'fixtures', name);
}

function makeSkillFile(filePath: string, platform: SkillFile['platform'] = 'claude'): SkillFile {
  return {
    filePath,
    platform,
    scope: 'project',
    confidence: 'high',
    installSource: '.claude/skills',
  };
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('parseSkill', () => {
  it('parses frontmatter-backed skill files', async () => {
    const result = await parseSkill(makeSkillFile(fixturePath('claude-with-frontmatter.md')));

    expect(result).not.toBeNull();
    expect(result?.name).toBe('test-driven-development');
    expect(result?.description).toContain('tests before implementation');
    expect(result?.triggers).toEqual([
      'Write a failing test first',
      'Implement logic changes',
      'Fix regressions with proof',
      'Drives development with tests before implementation.',
    ]);
  });

  it('falls back to the heading and body when frontmatter is missing', async () => {
    const result = await parseSkill(makeSkillFile(fixturePath('claude-no-frontmatter.md')));

    expect(result).not.toBeNull();
    expect(result?.name).toBe('Incremental Implementation');
    expect(result?.description).toContain('Build in thin, verifiable slices');
    expect(result?.triggers).toEqual([
      'Work on multi-file features',
      'Validate each slice before continuing',
    ]);
  });

  it('extracts globs and trigger lines from cursor mdc files', async () => {
    const result = await parseSkill(makeSkillFile(fixturePath('cursor-with-globs.mdc'), 'cursor'));

    expect(result).not.toBeNull();
    expect(result?.name).toBe('Cursor Git Review Rule');
    expect(result?.description).toContain('reviewing pull requests');
    expect(result?.triggers).toEqual([
      'create a pull request',
      'review commit history',
      '**/*.ts',
      '**/*.tsx',
      'Cursor rule for reviewing pull requests and git workflow.',
    ]);
  });

  it('extracts applyTo rules from copilot instruction files', async () => {
    const result = await parseSkill(makeSkillFile(fixturePath('copilot-instructions.instructions.md'), 'copilot'));

    expect(result).not.toBeNull();
    expect(result?.name).toBe('GitHub Copilot Instructions');
    expect(result?.triggers).toContain('**/*.{ts,tsx,js,jsx}');
  });

  it('returns null for empty files', async () => {
    const emptyPath = join(tmpdir(), `skill-doctor-empty-${Date.now()}.md`);
    writeFileSync(emptyPath, '', 'utf8');

    await expect(parseSkill(makeSkillFile(emptyPath))).resolves.toBeNull();
  });

  it('extracts when_to_use and paths from official Claude frontmatter', async () => {
    const filePath = join(tmpdir(), `skill-doctor-official-${Date.now()}.md`);
    writeFileSync(
      filePath,
      [
        '---',
        'name: my-skill',
        'description: Does something useful.',
        'when_to_use: Use when the user asks to do the thing.',
        'paths:',
        '  - "**/*.ts"',
        '  - "**/*.tsx"',
        '---',
        '',
        '# My Skill',
        '',
        'Instructions here.',
      ].join('\n'),
      'utf8',
    );

    const result = await parseSkill(makeSkillFile(filePath));

    expect(result).not.toBeNull();
    expect(result?.triggers).toContain('Use when the user asks to do the thing.');
    expect(result?.triggers).toContain('**/*.ts');
    expect(result?.triggers).toContain('**/*.tsx');
    expect(result?.provenance).toEqual({ installSource: '.claude/skills', confidence: 'high' });
  });

  it('parses folded block scalar frontmatter values', async () => {
    const filePath = join(tmpdir(), `skill-doctor-folded-${Date.now()}.md`);
    writeFileSync(
      filePath,
      [
        '---',
        'name: folded-skill',
        'description: >',
        '  First line of the description,',
        '  still in the same paragraph.',
        '',
        '  Second paragraph.',
        'when_to_use: >',
        '  Use this when the user asks',
        '  for a progress update.',
        '---',
        '',
        '# Folded Skill',
      ].join('\n'),
      'utf8',
    );

    const result = await parseSkill(makeSkillFile(filePath));

    expect(result).not.toBeNull();
    expect(result?.description).toBe(
      'First line of the description, still in the same paragraph.\n\nSecond paragraph.',
    );
    expect(result?.triggers).toContain('Use this when the user asks for a progress update.');
  });

  it('parses literal block scalar frontmatter values', async () => {
    const filePath = join(tmpdir(), `skill-doctor-literal-${Date.now()}.md`);
    writeFileSync(
      filePath,
      [
        '---',
        'name: literal-skill',
        'when_to_use: |',
        '  First line',
        '  Second line',
        'applyTo: |',
        '  **/*.ts',
        '  **/*.tsx',
        '---',
        '',
        '# Literal Skill',
      ].join('\n'),
      'utf8',
    );

    const result = await parseSkill(makeSkillFile(filePath));

    expect(result).not.toBeNull();
    expect(result?.triggers).toContain('First line\nSecond line');
    expect(result?.triggers).toContain('**/*.ts\n**/*.tsx');
  });

  it('extracts inline frontmatter arrays for paths and globs', async () => {
    const filePath = join(tmpdir(), `skill-doctor-inline-arrays-${Date.now()}.md`);
    writeFileSync(
      filePath,
      [
        '---',
        'name: inline-arrays',
        'globs: ["**/*.ts", "**/*.tsx"]',
        'paths: ["src/**/*.ts", "tests/**/*.ts"]',
        '---',
        '',
        '# Inline Arrays',
        '',
        'Instructions here.',
      ].join('\n'),
      'utf8',
    );

    const result = await parseSkill(makeSkillFile(filePath));

    expect(result).not.toBeNull();
    expect(result?.triggers).toContain('**/*.ts');
    expect(result?.triggers).toContain('**/*.tsx');
    expect(result?.triggers).toContain('src/**/*.ts');
    expect(result?.triggers).toContain('tests/**/*.ts');
  });

  it('falls back to sibling manifest metadata for SKILL.md files', async () => {
    const skillDir = join(tmpdir(), `skill-doctor-manifest-${Date.now()}`);
    const filePath = join(skillDir, 'SKILL.md');
    const manifestPath = join(skillDir, 'manifest.json');

    mkdirSync(skillDir, { recursive: true });

    writeFileSync(
      filePath,
      [
        '# Manifest-backed Skill',
        '',
        '## When to Use',
        '',
        '- Review local changes',
      ].join('\n'),
      'utf8',
    );
    writeFileSync(
      manifestPath,
      JSON.stringify({
        name: 'manifest-backed-skill',
        description: 'Loaded from sibling manifest metadata.',
        author: { name: 'Manifest Author' },
        repository: { url: 'https://github.com/example/manifest-backed-skill.git' },
      }),
      'utf8',
    );

    const result = await parseSkill(makeSkillFile(filePath));

    expect(result).not.toBeNull();
    expect(result?.name).toBe('manifest-backed-skill');
    expect(result?.description).toBe('Loaded from sibling manifest metadata.');
    expect(result?.triggers).toContain('Loaded from sibling manifest metadata.');
    expect(result?.triggers).toContain('Review local changes');
    expect(result?.provenance).toEqual({
      installSource: '.claude/skills',
      confidence: 'high',
      author: 'Manifest Author',
      repository: 'https://github.com/example/manifest-backed-skill.git',
    });
  });

  it('prefers skill directory git provenance over metadata and frontmatter', async () => {
    const skillDir = join(tmpdir(), `skill-doctor-git-provenance-${Date.now()}`);
    const filePath = join(skillDir, 'SKILL.md');

    mkdirSync(skillDir, { recursive: true });
    writeFileSync(
      filePath,
      [
        '---',
        'name: git-backed-skill',
        'author: Frontmatter Author',
        'repository: https://example.com/frontmatter.git',
        '---',
        '',
        '# Git Backed Skill',
      ].join('\n'),
      'utf8',
    );
    writeFileSync(
      join(skillDir, 'meta.json'),
      JSON.stringify({
        author: 'Metadata Author',
        repository: 'https://example.com/metadata.git',
      }),
      'utf8',
    );

    execFileSync('git', ['init'], { cwd: skillDir, stdio: 'ignore' });
    execFileSync('git', ['config', 'user.name', 'Git Author'], { cwd: skillDir, stdio: 'ignore' });
    execFileSync('git', ['config', 'user.email', 'git-author@example.com'], { cwd: skillDir, stdio: 'ignore' });
    execFileSync('git', ['remote', 'add', 'origin', 'https://github.com/example/git-backed-skill.git'], {
      cwd: skillDir,
      stdio: 'ignore',
    });
    execFileSync('git', ['add', 'SKILL.md', 'meta.json'], { cwd: skillDir, stdio: 'ignore' });
    execFileSync('git', ['commit', '-m', 'Add skill'], { cwd: skillDir, stdio: 'ignore' });

    const result = await parseSkill(makeSkillFile(filePath));

    expect(result).not.toBeNull();
    expect(result?.provenance).toEqual({
      installSource: '.claude/skills',
      confidence: 'high',
      author: 'Git Author',
      repository: 'https://github.com/example/git-backed-skill.git',
    });
  });

  it('does not inherit enclosing workspace git provenance for nested skill directories', async () => {
    const workspaceDir = join(tmpdir(), `skill-doctor-workspace-${Date.now()}`);
    const skillDir = join(workspaceDir, '.claude', 'skills', 'nested-skill');
    const filePath = join(skillDir, 'SKILL.md');

    mkdirSync(skillDir, { recursive: true });
    writeFileSync(
      filePath,
      [
        '# Nested Skill',
        '',
        '## When to Use',
        '',
        '- review local changes',
      ].join('\n'),
      'utf8',
    );

    execFileSync('git', ['init'], { cwd: workspaceDir, stdio: 'ignore' });
    execFileSync('git', ['config', 'user.name', 'Workspace Author'], { cwd: workspaceDir, stdio: 'ignore' });
    execFileSync('git', ['config', 'user.email', 'workspace@example.com'], { cwd: workspaceDir, stdio: 'ignore' });
    execFileSync('git', ['remote', 'add', 'origin', 'https://github.com/example/workspace.git'], {
      cwd: workspaceDir,
      stdio: 'ignore',
    });
    execFileSync('git', ['add', '.claude/skills/nested-skill/SKILL.md'], { cwd: workspaceDir, stdio: 'ignore' });
    execFileSync('git', ['commit', '-m', 'Add nested skill'], { cwd: workspaceDir, stdio: 'ignore' });

    const result = await parseSkill(makeSkillFile(filePath));

    expect(result).not.toBeNull();
    expect(result?.provenance).toEqual({ installSource: '.claude/skills', confidence: 'high' });
  });

  it('prefers skill directory metadata files over frontmatter for provenance', async () => {
    const skillDir = join(tmpdir(), `skill-doctor-meta-priority-${Date.now()}`);
    const filePath = join(skillDir, 'SKILL.md');

    mkdirSync(skillDir, { recursive: true });
    writeFileSync(
      filePath,
      [
        '---',
        'name: metadata-priority-skill',
        'author: Frontmatter Author',
        'repository: https://example.com/frontmatter.git',
        '---',
        '',
        '# Metadata Priority Skill',
      ].join('\n'),
      'utf8',
    );
    writeFileSync(
      join(skillDir, 'metadata.json'),
      JSON.stringify({
        author: { name: 'Metadata Author' },
        repository: { url: 'https://github.com/example/metadata-priority.git' },
      }),
      'utf8',
    );

    const result = await parseSkill(makeSkillFile(filePath));

    expect(result).not.toBeNull();
    expect(result?.provenance).toEqual({
      installSource: '.claude/skills',
      confidence: 'high',
      author: 'Metadata Author',
      repository: 'https://github.com/example/metadata-priority.git',
    });
  });

  it('falls back to the analysis LLM when git and metadata are missing', async () => {
    const skillDir = join(tmpdir(), `skill-doctor-llm-fallback-${Date.now()}`);
    const filePath = join(skillDir, 'SKILL.md');

    mkdirSync(skillDir, { recursive: true });
    writeFileSync(
      filePath,
      [
        '# LLM-backed Skill',
        '',
        '## When to Use',
        '',
        '- inspect remote provenance',
      ].join('\n'),
      'utf8',
    );

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [{
          message: {
            content: JSON.stringify({
              repository: 'https://github.com/example/llm-backed-skill.git',
              author: 'LLM Author',
            }),
          },
        }],
      }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await parseSkill(makeSkillFile(filePath), {
      llmOptions: {
        baseUrl: 'http://127.0.0.1:11434/v1',
        modelId: 'test-model',
        apiKey: 'secret-key',
      },
    });

    expect(result).not.toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(
      'http://127.0.0.1:11434/v1/chat/completions',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: 'Bearer secret-key',
          'Content-Type': 'application/json',
        }),
      }),
    );
    expect(result?.provenance).toEqual({
      installSource: '.claude/skills',
      confidence: 'high',
      author: 'LLM Author',
      repository: 'https://github.com/example/llm-backed-skill.git',
    });
  });

  it('reuses cached provenance before falling back to the analysis LLM', async () => {
    const skillDir = join(tmpdir(), `skill-doctor-llm-cache-${Date.now()}`);
    const filePath = join(skillDir, 'SKILL.md');

    mkdirSync(skillDir, { recursive: true });
    writeFileSync(filePath, '# Cached Provenance Skill', 'utf8');

    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const provenanceCache = new Map([
      [filePath, { repository: 'https://github.com/example/cached.git', author: 'Cached Author', resolved: true }],
    ]);

    const result = await parseSkill(makeSkillFile(filePath), {
      llmOptions: {
        baseUrl: 'http://127.0.0.1:11434/v1',
        modelId: 'test-model',
      },
      provenanceCache,
    });

    expect(result?.provenance).toEqual({
      installSource: '.claude/skills',
      confidence: 'high',
      author: 'Cached Author',
      repository: 'https://github.com/example/cached.git',
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('treats partial cached provenance as final and skips repeated LLM retries', async () => {
    const skillDir = join(tmpdir(), `skill-doctor-llm-partial-cache-${Date.now()}`);
    const filePath = join(skillDir, 'SKILL.md');

    mkdirSync(skillDir, { recursive: true });
    writeFileSync(filePath, '# Partial Cached Provenance Skill', 'utf8');

    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const provenanceCache = new Map([
      [filePath, { repository: 'https://github.com/example/cached.git', resolved: true }],
    ]);

    const result = await parseSkill(makeSkillFile(filePath), {
      llmOptions: {
        baseUrl: 'http://127.0.0.1:11434/v1',
        modelId: 'test-model',
      },
      provenanceCache,
    });

    expect(result?.provenance).toEqual({
      installSource: '.claude/skills',
      confidence: 'high',
      repository: 'https://github.com/example/cached.git',
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
