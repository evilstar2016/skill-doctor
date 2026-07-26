import * as fs from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import { diffSkillDirectories } from '../../src/library/skillConflictDiff.js';

const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
});

describe('diffSkillDirectories', () => {
  it('reports changed files and line additions and removals without reading ignored folders', () => {
    const root = fs.mkdtempSync('/tmp/skill-doctor-conflict-diff-');
    roots.push(root);
    const managed = join(root, 'managed');
    const candidate = join(root, 'candidate');
    fs.mkdirSync(join(managed, '.git'), { recursive: true });
    fs.mkdirSync(join(candidate, 'scripts'), { recursive: true });
    fs.writeFileSync(join(managed, 'SKILL.md'), 'keep\nremove\n', 'utf8');
    fs.writeFileSync(join(candidate, 'SKILL.md'), 'keep\nadd\n', 'utf8');
    fs.writeFileSync(join(managed, '.git', 'ignored'), 'ignored\n', 'utf8');
    fs.writeFileSync(join(candidate, 'scripts', 'check.sh'), 'echo check\n', 'utf8');

    const result = diffSkillDirectories(managed, candidate);

    expect(result).toMatchObject({ added: 2, deleted: 1 });
    expect(result.files.map((file) => file.path)).toEqual(['SKILL.md', 'scripts/check.sh']);
    expect(result.files[0].lines).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: 'removed', content: 'remove' }),
      expect.objectContaining({ type: 'added', content: 'add' }),
    ]));
  });

  it('returns an empty diff for identical Skill directories', () => {
    const root = fs.mkdtempSync('/tmp/skill-doctor-conflict-diff-');
    roots.push(root);
    const managed = join(root, 'managed');
    const candidate = join(root, 'candidate');
    fs.mkdirSync(managed, { recursive: true });
    fs.mkdirSync(candidate, { recursive: true });
    fs.writeFileSync(join(managed, 'SKILL.md'), '# Same\n', 'utf8');
    fs.writeFileSync(join(candidate, 'SKILL.md'), '# Same\n', 'utf8');

    expect(diffSkillDirectories(managed, candidate)).toEqual({ files: [], added: 0, deleted: 0 });
  });
});
