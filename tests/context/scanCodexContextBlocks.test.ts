import { describe, expect, it } from 'vitest';

import { analyzeCodexContextBlocks } from '../../src/context/scanCodexContextBlocks';

describe('analyzeCodexContextBlocks', () => {
  it('extracts Skill roots, available Skills and recommended Plugins', () => {
    const result = analyzeCodexContextBlocks([
      '<skills_instructions>',
      '## Skills',
      '### Skill roots',
      '- `r0` = `/project/.codex/skills`',
      '- `r1` = `/home/.codex/skills`',
      '### Available skills',
      '- imagegen: Generate images.',
      '- review-agent: Review code: carefully.',
      '- product-design:audit: Audit product flows.',
      '- sites:sites-building: Build sites.',
      '</skills_instructions>',
      '<recommended_plugins>',
      'Here is a list of plugins that are available but not installed.',
      '',
      '- GitHub (github@openai-curated-remote)',
      '- Gmail (gmail@openai-curated-remote)',
      '</recommended_plugins>',
    ].join('\n'), { sourcePath: '/tmp/context.txt' });

    expect(result.sourcePath).toBe('/tmp/context.txt');
    expect(result.blocks).toHaveLength(2);
    expect(result.totalEstimatedTokens).toBeGreaterThan(0);
    expect(result.diagnostics).toEqual([]);
    expect(result.blocks[0]).toMatchObject({
      id: 'skills_instructions',
      role: 'developer',
      contentKind: 'skills.catalog',
      complete: true,
      rootAliases: [
        { alias: 'r0', path: '/project/.codex/skills' },
        { alias: 'r1', path: '/home/.codex/skills' },
      ],
      availableSkills: [
        { name: 'imagegen', description: 'Generate images.' },
        { name: 'review-agent', description: 'Review code: carefully.' },
        { name: 'product-design:audit', description: 'Audit product flows.' },
        { name: 'sites:sites-building', description: 'Build sites.' },
      ],
    });
    expect(result.blocks[1]).toMatchObject({
      id: 'recommended_plugins',
      role: 'user',
      contentKind: 'plugins.recommendations',
      recommendedPlugins: [
        { name: 'GitHub', id: 'github@openai-curated-remote' },
        { name: 'Gmail', id: 'gmail@openai-curated-remote' },
      ],
    });
  });

  it('reports incomplete blocks and uses the approximate tokenizer when requested', () => {
    const text = '<recommended_plugins>\n- GitHub (github@openai-curated-remote)';
    const result = analyzeCodexContextBlocks(text, { tokenizer: 'approx' });

    expect(result.tokenizer).toEqual({ mode: 'approx' });
    expect(result.blocks[0]).toMatchObject({ id: 'recommended_plugins', complete: false });
    expect(result.diagnostics).toEqual(['Incomplete <recommended_plugins> block at offset 0']);
    expect(result.totalEstimatedTokens).toBe(Math.ceil(text.replace(/\s+/g, ' ').trim().length / 4));
  });

  it('keeps duplicate blocks as separate observations', () => {
    const result = analyzeCodexContextBlocks([
      '<recommended_plugins>- One (one@remote)</recommended_plugins>',
      '<recommended_plugins>- Two (two@remote)</recommended_plugins>',
    ].join('\n'));

    expect(result.blocks.map((block) => block.recommendedPlugins?.[0]?.id)).toEqual(['one@remote', 'two@remote']);
    expect(result.diagnostics).toEqual([]);
  });

  it('does not stop at a literal closing tag mentioned inside a block', () => {
    const result = analyzeCodexContextBlocks([
      '<collaboration_mode>',
      'Use `<collaboration_mode>...</collaboration_mode>` only as documentation.',
      '</collaboration_mode>',
      '<apps_instructions>Apps.</apps_instructions>',
    ].join('\n'));

    expect(result.blocks).toHaveLength(2);
    expect(result.blocks[0]).toMatchObject({ id: 'collaboration_mode', complete: true });
    expect(result.blocks[0]?.text).toContain('Use `<collaboration_mode>...</collaboration_mode>`');
    expect(result.diagnostics).toEqual([]);
  });

  it('can restrict parsing to block kinds supplied by a trusted JSONL item', () => {
    const result = analyzeCodexContextBlocks([
      '<skills_instructions>literal skill catalog</skills_instructions>',
      '<recommended_plugins>- GitHub (github@openai-curated-remote)</recommended_plugins>',
    ].join('\n'), {
      blockIds: ['recommended_plugins'],
      evidenceLevel: 'runtime-item-observed',
      provenance: { sourcePath: '/tmp/session.jsonl', line: 3, role: 'user', contentItemKind: 'plugins.recommendations', contentItemIndex: 0 },
    });

    expect(result.blocks.map((block) => block.id)).toEqual(['recommended_plugins']);
    expect(result.blocks[0]).toMatchObject({
      evidenceLevel: 'runtime-item-observed',
      observationStatus: 'present',
      provenance: { contentItemKind: 'plugins.recommendations', contentItemIndex: 0 },
    });
  });
});
