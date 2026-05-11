#!/usr/bin/env node

import packageJson from '../../package.json';
import { detectConflicts } from '../conflicts/detectConflicts';
import { scanSkills } from '../discovery/scanSkills';
import { renderConflicts } from '../render/renderConflicts';
import { renderScan } from '../render/renderScan';
import { renderShow } from '../render/renderShow';
import type { ConflictPair, Scope, SkillRecord } from '../types/skill';

export function main(argv: string[] = process.argv.slice(2)): void {
  const [command, ...rest] = argv;
  const cwd = process.cwd();
  const jsonOutput = hasFlag(rest, '--json');

  if (!command || command === '--help' || command === '-h') {
    process.stdout.write(getHelpText());
    return;
  }

  if (command === '--version' || command === '-v') {
    process.stdout.write(`${packageJson.version}\n`);
    return;
  }

  if (command === 'scan') {
    const scope = readScope(rest);

    if (scope === 'invalid') {
      process.stderr.write('Invalid scope. Use --scope project|global|all\n');
      process.exitCode = 1;
      return;
    }

    const skills = filterSkillsByScope(scanSkills(cwd), scope);
    const conflicts = detectConflicts(skills);
    if (jsonOutput) {
      process.stdout.write(`${toJson(buildScanPayload(skills, conflicts))}\n`);
      return;
    }

    process.stdout.write(`${renderScan(skills, conflicts)}\n`);
    return;
  }

  if (command === 'show') {
    const [name] = rest;

    if (!name) {
      process.stderr.write('Usage: skill-doctor show <name>\n');
      process.exitCode = 1;
      return;
    }

    const skill = scanSkills(cwd).find((entry) => entry.name === name);

    if (!skill) {
      process.stderr.write(`Skill not found: ${name}\n`);
      process.exitCode = 1;
      return;
    }

    if (jsonOutput) {
      process.stdout.write(`${toJson(skill)}\n`);
      return;
    }

    process.stdout.write(`${renderShow(skill)}\n`);
    return;
  }

  if (command === 'conflicts') {
    const threshold = readFailOn(rest);
    const scope = readScope(rest);
    const limit = readLimit(rest);
    const kind = readKind(rest);

    if (scope === 'invalid') {
      process.stderr.write('Invalid scope. Use --scope project|global|all\n');
      process.exitCode = 1;
      return;
    }

    if (limit === 'invalid') {
      process.stderr.write('Invalid limit. Use --limit <positive integer>\n');
      process.exitCode = 1;
      return;
    }

    if (kind === 'invalid') {
      process.stderr.write('Invalid kind. Use --kind duplicate|conflict|all\n');
      process.exitCode = 1;
      return;
    }

    const skills = filterSkillsByScope(scanSkills(cwd), scope);
    const conflicts = limitConflicts(
      sortConflicts(filterConflictsByKind(detectConflicts(skills), kind)),
      limit,
    );
    if (jsonOutput) {
      process.stdout.write(`${toJson(buildConflictsPayload(conflicts))}\n`);
    } else {
      process.stdout.write(`${renderConflicts(conflicts)}\n`);
    }

    if (threshold && conflicts.some((pair) => shouldFail(pair.severity, threshold))) {
      process.exitCode = 1;
    }

    return;
  }

  process.stderr.write(`Unknown command: ${command}\n\n${getHelpText()}`);
  process.exitCode = 1;
}

main();

function getHelpText(): string {
  return [
    'skill-doctor',
    '',
    'Usage:',
    '  skill-doctor scan [--scope project|global|all] [--json]',
    '  skill-doctor show <name> [--json]',
    '  skill-doctor conflicts [--scope project|global|all] [--kind duplicate|conflict|all] [--fail-on high|med|low] [--limit N] [--json]',
    '  skill-doctor --version',
  ].join('\n');
}

function hasFlag(args: string[], flag: string): boolean {
  return args.includes(flag);
}

function readFailOn(args: string[]): 'high' | 'med' | 'low' | null {
  const index = args.indexOf('--fail-on');

  if (index === -1) {
    return null;
  }

  const value = args[index + 1];
  return value === 'high' || value === 'med' || value === 'low' ? value : null;
}

function readScope(args: string[]): Scope | 'all' | 'invalid' {
  const index = args.indexOf('--scope');

  if (index === -1) {
    return 'all';
  }

  const value = args[index + 1];

  if (value === 'project' || value === 'global' || value === 'all') {
    return value;
  }

  return 'invalid';
}

function readKind(args: string[]): ConflictPair['kind'] | 'all' | 'invalid' {
  const index = args.indexOf('--kind');

  if (index === -1) {
    return 'all';
  }

  const value = args[index + 1];

  if (value === 'duplicate' || value === 'conflict' || value === 'all') {
    return value;
  }

  return 'invalid';
}

function shouldFail(severity: 'high' | 'med' | 'low', threshold: 'high' | 'med' | 'low'): boolean {
  const ranks = {
    high: 3,
    med: 2,
    low: 1,
  } as const;

  return ranks[severity] >= ranks[threshold];
}

function filterSkillsByScope(skills: SkillRecord[], scope: Scope | 'all'): SkillRecord[] {
  if (scope === 'all') {
    return skills;
  }

  return skills.filter((skill) => skill.scope === scope);
}

function buildScanPayload(skills: SkillRecord[], conflicts: ReturnType<typeof detectConflicts>) {
  return {
    summary: {
      totalSkillsInstalled: skills.length,
      duplicatesDetected: conflicts.filter((pair) => pair.kind === 'duplicate').length,
      conflictsDetected: conflicts.filter((pair) => pair.kind === 'conflict').length,
      platforms: countPlatforms(skills),
      scopes: countScopes(skills),
      platformsByScope: countPlatformsByScope(skills),
    },
    skills,
    duplicates: conflicts.filter((pair) => pair.kind === 'duplicate'),
    conflicts: conflicts.filter((pair) => pair.kind === 'conflict'),
  };
}

function buildConflictsPayload(conflicts: ReturnType<typeof detectConflicts>) {
  return {
    duplicates: conflicts.filter((pair) => pair.kind === 'duplicate'),
    conflicts: conflicts.filter((pair) => pair.kind === 'conflict'),
  };
}

function countPlatforms(skills: SkillRecord[]): Record<string, number> {
  const counts: Record<string, number> = {};

  for (const skill of skills) {
    counts[skill.platform] = (counts[skill.platform] ?? 0) + 1;
  }

  return counts;
}

function countScopes(skills: SkillRecord[]): Record<string, number> {
  const counts: Record<string, number> = {};

  for (const skill of skills) {
    counts[skill.scope] = (counts[skill.scope] ?? 0) + 1;
  }

  return counts;
}

function countPlatformsByScope(skills: SkillRecord[]): Record<string, Record<string, number>> {
  const counts: Record<string, Record<string, number>> = {};

  for (const skill of skills) {
    counts[skill.scope] ??= {};
    counts[skill.scope][skill.platform] = (counts[skill.scope][skill.platform] ?? 0) + 1;
  }

  return counts;
}

function toJson(value: unknown): string {
  return JSON.stringify(value, null, 2);
}

function readLimit(args: string[]): number | null | 'invalid' {
  const index = args.indexOf('--limit');

  if (index === -1) {
    return null;
  }

  const rawValue = args[index + 1];
  const parsed = Number(rawValue);

  if (!Number.isInteger(parsed) || parsed <= 0) {
    return 'invalid';
  }

  return parsed;
}

function sortConflicts(conflicts: ConflictPair[]): ConflictPair[] {
  return [...conflicts].sort((left, right) => {
    const kindDelta = rankKind(right.kind) - rankKind(left.kind);
    if (kindDelta !== 0) {
      return kindDelta;
    }

    const severityDelta = rankSeverity(right.severity) - rankSeverity(left.severity);
    if (severityDelta !== 0) {
      return severityDelta;
    }

    if (right.similarity !== left.similarity) {
      return right.similarity - left.similarity;
    }

    const leftName = `${left.a.name}:${left.b.name}`;
    const rightName = `${right.a.name}:${right.b.name}`;
    return leftName.localeCompare(rightName);
  });
}

function limitConflicts(conflicts: ConflictPair[], limit: number | null): ConflictPair[] {
  if (limit === null) {
    return conflicts;
  }

  return conflicts.slice(0, limit);
}

function filterConflictsByKind(
  conflicts: ConflictPair[],
  kind: ConflictPair['kind'] | 'all',
): ConflictPair[] {
  if (kind === 'all') {
    return conflicts;
  }

  return conflicts.filter((pair) => pair.kind === kind);
}

function rankKind(kind: ConflictPair['kind']): number {
  return kind === 'duplicate' ? 2 : 1;
}

function rankSeverity(severity: ConflictPair['severity']): number {
  const ranks = {
    high: 3,
    med: 2,
    low: 1,
  } as const;

  return ranks[severity];
}