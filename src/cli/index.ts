#!/usr/bin/env node

import { rmSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { createInterface } from 'node:readline';
import packageJson from '../../package.json';
import { runAudit } from '../audit/runAudit';
import { suggestCleanup } from '../cleanup/suggestCleanup';
import { filterConflicts, filterFindings } from '../config/applyIgnoreList';
import { loadUserConfig } from '../config/loadUserConfig';
import { detectConflicts } from '../conflicts/detectConflicts';
import { scanSkills } from '../discovery/scanSkills';
import { buildExplanation } from '../explain/buildExplanation';
import { groupSkills } from '../explain/groupSkills';
import { loadGroupLabelCache, saveGroupLabelCache } from '../explain/groupLabelCache';
import { loadWhenToUseCache, saveWhenToUseCache } from '../explain/whenToUseCache';
import { parseSkill } from '../parsing/parseSkill';
import { loadProvenanceCache, saveProvenanceCache } from '../parsing/provenanceCache';
import type { LlmExplainOptions } from '../types/explain';
import { DiffError, runDiff } from '../diff/runDiff';
import { detectPlatform } from '../install/detectPlatform.js';
import { fetchMarketplaceSkill } from '../install/fetchMarketplace.js';
import { installSkill } from '../install/installSkill.js';
import { uninstallSkill } from '../install/uninstallSkill.js';
import { renderInstallSuccess, renderUninstallSuccess } from '../render/renderInstall.js';
import { renderAudit } from '../render/renderAudit';
import { renderAuditReport } from '../render/renderAuditReport';
import { renderCleanup } from '../render/renderCleanup';
import { renderConflicts } from '../render/renderConflicts';
import { renderDiff } from '../render/renderDiff';
import { renderDashboard } from '../render/renderDashboard';
import { renderDiffReport } from '../render/renderDiffReport';
import { renderGroup } from '../render/renderGroup';
import { renderReport } from '../render/renderReport';
import { renderScan } from '../render/renderScan';
import { renderShow } from '../render/renderShow';
import type { AuditFinding } from '../types/audit';
import type {
  ConflictDetectionOptions,
  ConflictDetectionStrategy,
  ConflictPair,
  Platform,
  Scope,
  SkillFile,
  SkillRecord,
} from '../types/skill';

function getRegistryPath(): string {
  return join(homedir(), '.skill-doctor', 'registry.json');
}

export async function main(argv: string[] = process.argv.slice(2)): Promise<void> {
  const [command, ...rest] = argv;
  const cwd = process.cwd();
  const jsonOutput = hasFlag(rest, '--json');
  const extraPaths = loadUserConfig().config.paths?.extra;

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
    const groupMode = hasFlag(rest, '--group');

    if (scope === 'invalid') {
      process.stderr.write('Invalid scope. Use --scope project|global|all\n');
      process.exitCode = 1;
      return;
    }

    const llmOptions = readAnalysisLlmOptions();

    if (groupMode) {
      const skills = filterSkillsByScope(await scanSkills(cwd, { extraPaths }), scope);
      const labelCache = loadGroupLabelCache();
      const groupResult = await groupSkills(skills, { llmOptions: llmOptions ?? undefined, labelCache });
      saveGroupLabelCache(labelCache);
      if (jsonOutput) {
        process.stdout.write(`${toJson(groupResult)}\n`);
      } else {
        process.stdout.write(`${renderGroup(groupResult)}\n`);
      }
      return;
    }

    const provenanceCache = loadProvenanceCache();
    const skills = filterSkillsByScope(
      await scanSkills(cwd, { llmOptions: llmOptions ?? undefined, provenanceCache, extraPaths }),
      scope,
    );
    if (llmOptions && provenanceCache.size > 0) {
      saveProvenanceCache(provenanceCache);
    }

    const conflictOptions = readConflictOptions(rest);

    if (conflictOptions.error) {
      process.stderr.write(`${conflictOptions.error}\n`);
      process.exitCode = 1;
      return;
    }

    const conflicts = await detectConflicts(skills, conflictOptions.options);

    const reportPath = readReport(rest);
    if (reportPath !== null) {
      const outPath = reportPath === true ? 'skill-doctor-report.html' : reportPath;
      writeFileSync(outPath, renderReport(skills, conflicts), 'utf-8');
      process.stdout.write(`Report written to: ${outPath}\n`);
      return;
    }

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

    const llmOptions = readAnalysisLlmOptions();
    const provenanceCache = loadProvenanceCache();
    const allSkills = await scanSkills(cwd, { provenanceCache, extraPaths });
    const skill = allSkills.find((entry) => entry.name === name);

    if (!skill) {
      process.stderr.write(`Skill not found: ${name}\n`);
      process.exitCode = 1;
      return;
    }

    const detailedSkill =
      llmOptions
        ? ((await parseSkill(toSkillFile(skill), { llmOptions, provenanceCache })) ?? skill)
        : skill;

    if (llmOptions && provenanceCache.size > 0) {
      saveProvenanceCache(provenanceCache);
    }

    const whenToUseCache = loadWhenToUseCache();
    const explanation = await buildExplanation(detailedSkill, allSkills, {
      llmOptions: llmOptions ?? undefined,
      whenToUseCache,
    });
    saveWhenToUseCache(whenToUseCache);

    if (jsonOutput) {
      process.stdout.write(`${toJson(explanation)}\n`);
      return;
    }

    process.stdout.write(`${renderShow(explanation)}\n`);
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

    const conflictOptions = readConflictOptions(rest);

    if (conflictOptions.error) {
      process.stderr.write(`${conflictOptions.error}\n`);
      process.exitCode = 1;
      return;
    }

    const skills = filterSkillsByScope(await scanSkills(cwd, { extraPaths }), scope);
    const ignore = loadUserConfig().config.ignore ?? {};
    const conflicts = limitConflicts(
      sortConflicts(filterConflictsByKind(filterConflicts(await detectConflicts(skills, conflictOptions.options), ignore), kind)),
      limit,
    );
    const suggestions = suggestCleanup(conflicts);
    if (jsonOutput) {
      process.stdout.write(`${toJson(buildConflictsPayload(conflicts, suggestions))}\n`);
    } else {
      process.stdout.write(`${renderConflicts(conflicts, suggestions)}\n`);
    }

    if (threshold && conflicts.some((pair) => shouldFail(pair.severity, threshold))) {
      process.exitCode = 1;
    }

    return;
  }

  if (command === 'audit') {
    const scope = readScope(rest);
    const minSeverity = readSeverity(rest);
    const threshold = readFailOn(rest);

    if (scope === 'invalid') {
      process.stderr.write('Invalid scope. Use --scope project|global|all\n');
      process.exitCode = 1;
      return;
    }

    const llmOptions = readAnalysisLlmOptions();
    const provenanceCache = loadProvenanceCache();
    const skills = filterSkillsByScope(
      await scanSkills(cwd, { llmOptions: llmOptions ?? undefined, provenanceCache, extraPaths }),
      scope,
    );
    if (llmOptions && provenanceCache.size > 0) {
      saveProvenanceCache(provenanceCache);
    }
    const ignore = loadUserConfig().config.ignore ?? {};
    const result = runAudit(skills);
    let findings = filterFindings(result.findings, ignore);
    if (minSeverity) findings = filterFindingsBySeverity(findings, minSeverity);
    const filtered = { ...result, findings };

    const reportPath = readReport(rest);
    if (reportPath !== null) {
      const outPath = reportPath === true ? 'skill-doctor-audit.html' : reportPath;
      writeFileSync(outPath, renderAuditReport(filtered), 'utf-8');
      process.stdout.write(`Audit report written to: ${outPath}\n`);
      return;
    }

    if (jsonOutput) {
      process.stdout.write(`${toJson(filtered)}\n`);
    } else {
      process.stdout.write(`${renderAudit(filtered)}\n`);
    }

    if (threshold && filtered.findings.some((f) => shouldFail(f.severity, threshold))) {
      process.exitCode = 1;
    }

    return;
  }

  if (command === 'cleanup') {
    const scope = readScope(rest);

    if (scope === 'invalid') {
      process.stderr.write('Invalid scope. Use --scope project|global|all\n');
      process.exitCode = 1;
      return;
    }

    const ignore = loadUserConfig().config.ignore ?? {};
    const skills = filterSkillsByScope(await scanSkills(cwd, { extraPaths }), scope);
    const conflicts = filterConflicts(await detectConflicts(skills), ignore);
    const duplicates = conflicts.filter((p) => p.kind === 'duplicate');

    if (jsonOutput) {
      process.stdout.write(
        `${toJson(duplicates.map((p) => ({ name: p.a.name, paths: [p.a.sourcePath, p.b.sourcePath] })))}\n`,
      );
      return;
    }

    if (hasFlag(rest, '--execute')) {
      if (duplicates.length === 0) {
        process.stdout.write('No duplicate skills found.\n');
        return;
      }
      const rl = createInterface({ input: process.stdin, output: process.stdout });
      const ask = (q: string) => new Promise<string>((resolve) => rl.question(q, resolve));
      for (const pair of duplicates) {
        process.stdout.write(`\nDuplicate: ${pair.a.name}\n  [1] ${pair.a.sourcePath}\n  [2] ${pair.b.sourcePath}\n`);
        const answer = await ask('Remove which copy? [1/2/s to skip]: ');
        if (answer === '1') {
          rmSync(dirname(pair.a.sourcePath), { recursive: true });
          process.stdout.write(`Removed: ${pair.a.sourcePath}\n`);
        } else if (answer === '2') {
          rmSync(dirname(pair.b.sourcePath), { recursive: true });
          process.stdout.write(`Removed: ${pair.b.sourcePath}\n`);
        } else {
          process.stdout.write('Skipped.\n');
        }
      }
      rl.close();
      return;
    }

    process.stdout.write(`${renderCleanup(duplicates)}\n`);
    return;
  }

  if (command === 'diff') {
    const [nameA, nameB] = rest.filter((a) => !a.startsWith('-'));
    if (!nameA || !nameB) {
      process.stderr.write('Usage: skill-doctor diff <skill-a> <skill-b> [--report [path]]\n');
      process.exitCode = 1;
      return;
    }
    const llmOptions = readAnalysisLlmOptions();
    try {
      const result = await runDiff(nameA, nameB, cwd, { llmOptions: llmOptions ?? undefined });
      const reportPath = readReport(rest);
      if (reportPath !== null) {
        const outPath = reportPath === true ? `skill-doctor-diff-${nameA}-vs-${nameB}.html` : reportPath;
        writeFileSync(outPath, renderDiffReport(result), 'utf-8');
        process.stdout.write(`Diff report written to: ${outPath}\n`);
      } else {
        process.stdout.write(`${renderDiff(result)}\n`);
      }
    } catch (err) {
      if (err instanceof DiffError) {
        process.stderr.write(`${err.message}\n`);
        process.exitCode = 1;
      } else {
        throw err;
      }
    }
    return;
  }

  if (command === 'dashboard') {
    const scope = readScope(rest);
    if (scope === 'invalid') {
      process.stderr.write('Invalid scope. Use --scope project|global|all\n');
      process.exitCode = 1;
      return;
    }

    const skills = filterSkillsByScope(await scanSkills(cwd, { extraPaths }), scope);
    const ignore = loadUserConfig().config.ignore ?? {};
    const allConflicts = filterConflicts(await detectConflicts(skills), ignore);
    const conflicts = allConflicts.filter((p) => p.kind === 'conflict');
    const duplicates = allConflicts.filter((p) => p.kind === 'duplicate');
    const suggestions = suggestCleanup(allConflicts);
    const auditResult = runAudit(skills);
    const filteredAudit = { ...auditResult, findings: filterFindings(auditResult.findings, ignore) };

    const reportPath = readReport(rest);
    const outPath = reportPath === true ? 'skill-doctor-dashboard.html'
      : typeof reportPath === 'string' ? reportPath
      : 'skill-doctor-dashboard.html';

    writeFileSync(outPath, renderDashboard({
      skills,
      conflicts,
      auditResult: filteredAudit,
      duplicates,
      suggestions,
    }), 'utf-8');
    process.stdout.write(`Dashboard written to: ${outPath}\n`);

    if (hasFlag(rest, '--open')) {
      const { exec } = await import('node:child_process');
      const cmd = process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'start' : 'xdg-open';
      exec(`${cmd} ${outPath}`);
    }

    return;
  }

  if (command === 'install') {
    const [source] = rest.filter((a) => !a.startsWith('-'));
    const targetFlag = rest.find((a) => a.startsWith('--target='))?.split('=')[1]
      ?? rest[rest.indexOf('--target') + 1];
    const link = hasFlag(rest, '--link');

    if (!source) {
      process.stderr.write('Usage: skill-doctor install <path|slug> [--target <platform>] [--link]\n');
      process.exitCode = 1;
      return;
    }

    let platform: Platform;
    let globalDir: string;
    let layout: 'skill-dirs' | 'files';

    if (targetFlag) {
      const { PLATFORM_PATHS } = await import('../discovery/resolvePaths.js');
      const def = PLATFORM_PATHS.find((p) => p.platform === targetFlag);
      if (!def) {
        process.stderr.write(`Error: Unknown platform '${targetFlag}'\n`);
        process.exitCode = 1;
        return;
      }
      const globalTarget = def.global.find((t) => t.mode === 'recursive-dir' && t.layout);
      if (!globalTarget || !globalTarget.layout) {
        process.stderr.write(`Error: Platform '${targetFlag}' uses a single-file layout and does not support individual skill installs.\n`);
        process.exitCode = 1;
        return;
      }
      const { normalize } = await import('node:path');
      globalDir = normalize(globalTarget.path.replace(/^~(?=[/\\]|$)/, homedir()));
      platform = targetFlag as Platform;
      layout = globalTarget.layout;
    } else {
      const detected = detectPlatform();
      if (!detected) {
        process.stderr.write('Error: Could not detect an active AI platform. Use --target to specify one.\n');
        process.exitCode = 1;
        return;
      }
      platform = detected.platform as Platform;
      globalDir = detected.globalDir;
      layout = detected.layout;
    }

    const isLocalPath = source.startsWith('/') || source.startsWith('./') || source.includes('/');

    if (isLocalPath) {
      const { statSync } = await import('node:fs');
      const { join: pathJoin } = await import('node:path');
      let sourcePath = source;
      try {
        const stat = statSync(sourcePath);
        if (stat.isDirectory()) sourcePath = pathJoin(sourcePath, 'SKILL.md');
      } catch {
        process.stderr.write(`Error: Path not found: ${source}\n`);
        process.exitCode = 1;
        return;
      }
      try {
        const result = await installSkill({
          source: sourcePath,
          platform,
          globalDir,
          layout,
          registryPath: getRegistryPath(),
          link,
          sourceRef: sourcePath,
          marketplaceSource: false,
        });
        process.stdout.write(renderInstallSuccess(result.name, platform, result.installedPath));
      } catch (err) {
        process.stderr.write(`Error: ${(err as Error).message}\n`);
        process.exitCode = 1;
      }
    } else {
      let skillContent: string;
      try {
        skillContent = await fetchMarketplaceSkill(source);
      } catch (err) {
        process.stderr.write(`Error: ${(err as Error).message}\n`);
        process.exitCode = 1;
        return;
      }
      const { mkdtempSync, writeFileSync: fsWriteFileSync, rmSync: fsRmSync } = await import('node:fs');
      const { tmpdir } = await import('node:os');
      const tempDir = mkdtempSync(join(tmpdir(), 'skill-doctor-install-'));
      const tempFile = join(tempDir, 'SKILL.md');
      try {
        fsWriteFileSync(tempFile, skillContent, 'utf8');
        const result = await installSkill({
          source: tempFile,
          platform,
          globalDir,
          layout,
          registryPath: getRegistryPath(),
          link: false,
          sourceRef: source,
          marketplaceSource: true,
        });
        process.stdout.write(renderInstallSuccess(result.name, platform, result.installedPath));
      } catch (err) {
        process.stderr.write(`Error: ${(err as Error).message}\n`);
        process.exitCode = 1;
      } finally {
        fsRmSync(tempDir, { recursive: true, force: true });
      }
    }
    return;
  }

  if (command === 'uninstall') {
    const [name] = rest.filter((a) => !a.startsWith('-'));
    const targetFlag = rest.find((a) => a.startsWith('--target='))?.split('=')[1]
      ?? rest[rest.indexOf('--target') + 1];
    const force = hasFlag(rest, '--force');

    if (!name) {
      process.stderr.write('Usage: skill-doctor uninstall <name> [--target <platform>] [--force]\n');
      process.exitCode = 1;
      return;
    }

    let platform: Platform;
    if (targetFlag) {
      const { PLATFORM_PATHS } = await import('../discovery/resolvePaths.js');
      if (!PLATFORM_PATHS.some((p) => p.platform === targetFlag)) {
        process.stderr.write(`Error: Unknown platform '${targetFlag}'\n`);
        process.exitCode = 1;
        return;
      }
      platform = targetFlag as Platform;
    } else {
      const detected = detectPlatform();
      if (!detected) {
        process.stderr.write('Error: Could not detect an active AI platform. Use --target to specify one.\n');
        process.exitCode = 1;
        return;
      }
      platform = detected.platform as Platform;
    }

    try {
      await uninstallSkill({ name, platform, registryPath: getRegistryPath(), force });
      process.stdout.write(renderUninstallSuccess(name, platform));
    } catch (err) {
      process.stderr.write(`Error: ${(err as Error).message}\n`);
      process.exitCode = 1;
    }
    return;
  }

  process.stderr.write(`Unknown command: ${command}\n\n${getHelpText()}`);
  process.exitCode = 1;
}

void main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
});

function getHelpText(): string {
  return [
    'skill-doctor',
    '',
    'Usage:',
    '  skill-doctor scan [--scope project|global|all] [--strategy token|embedding] [--threshold N] [--embedding-model ID] [--json] [--report [path]]',
    '  skill-doctor show <name> [--json]',
    '  skill-doctor conflicts [--scope project|global|all] [--strategy token|embedding] [--threshold N] [--embedding-model ID] [--analyze] [--kind duplicate|conflict|all] [--fail-on high|med|low] [--limit N] [--json]',
    '  skill-doctor audit [--scope project|global|all] [--severity high|med|low] [--fail-on high|med|low] [--json] [--report [path]]',
    '  skill-doctor cleanup [--scope project|global|all] [--json]',
    '  skill-doctor diff <skill-a> <skill-b> [--report [path]]',
    '  skill-doctor dashboard [--scope project|global|all] [--report [path]] [--open]',
    '  skill-doctor install <path|slug> [--target <platform>] [--link]',
    '  skill-doctor uninstall <name> [--target <platform>] [--force]',
    '  skill-doctor --version',
    '',
    'Embedding config file:',
    '  ~/.skill-doctor/config.json',
    '  { "embedding": { "baseUrl": "http://host/v1", "model": "bge-m3", "apiKey": "..." } }',
  ].join('\n');
}

function hasFlag(args: string[], flag: string): boolean {
  return args.includes(flag);
}

interface ConflictOptionsResult {
  options: ConflictDetectionOptions;
  error?: string;
}

function readConflictOptions(args: string[]): ConflictOptionsResult {
  const strategy = readStrategy(args);
  if (strategy === 'invalid') {
    return {
      options: {},
      error: 'Invalid strategy. Use --strategy token|embedding',
    };
  }

  const threshold = readThreshold(args);
  if (threshold === 'invalid') {
    return {
      options: {},
      error: 'Invalid threshold. Use --threshold <number between 0 and 1>',
    };
  }

  const modelId = readEmbeddingModel(args);
  if (modelId === 'invalid') {
    return {
      options: {},
      error: 'Invalid embedding model. Use --embedding-model <model-id>',
    };
  }

  const analyze = args.includes('--analyze');
  const options: ConflictDetectionOptions = {
    ...(strategy ? { strategy } : {}),
    ...(threshold === null ? {} : { threshold }),
    ...(modelId ? { modelId } : {}),
    ...(analyze ? { analyze } : {}),
  };

  if (strategy !== 'embedding') {
    return { options };
  }

  try {
    const { config, path } = loadUserConfig();
    const embeddingConfig = config.embedding ?? {};
    const resolvedBaseUrl = embeddingConfig.baseUrl;
    const resolvedModelId = modelId ?? embeddingConfig.model;
    const resolvedApiKey = embeddingConfig.apiKey;

    if (!resolvedBaseUrl || !resolvedModelId) {
      return {
        options,
        error: `Embedding config is incomplete. Set embedding.baseUrl and embedding.model in ${path}.`,
      };
    }

    const analysisOptions: Partial<ConflictDetectionOptions> = {};
    if (analyze) {
      const analysisConfig = config.analysis ?? {};
      analysisOptions.analysisBaseUrl = analysisConfig.baseUrl ?? embeddingConfig.baseUrl;
      analysisOptions.analysisModelId = analysisConfig.model;
      analysisOptions.analysisApiKey = analysisConfig.apiKey ?? embeddingConfig.apiKey;
    }

    return {
      options: {
        ...options,
        baseUrl: resolvedBaseUrl,
        modelId: resolvedModelId,
        ...(resolvedApiKey ? { apiKey: resolvedApiKey } : {}),
        ...analysisOptions,
      },
    };
  } catch (error) {
    return {
      options,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

function readStrategy(args: string[]): ConflictDetectionStrategy | null | 'invalid' {
  const index = args.indexOf('--strategy');
  if (index === -1) {
    return null;
  }

  const value = args[index + 1];
  return value === 'token' || value === 'embedding' ? value : 'invalid';
}

function readThreshold(args: string[]): number | null | 'invalid' {
  const index = args.indexOf('--threshold');
  if (index === -1) {
    return null;
  }

  const rawValue = args[index + 1];
  const parsed = Number(rawValue);

  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 1) {
    return 'invalid';
  }

  return parsed;
}

function readEmbeddingModel(args: string[]): string | null | 'invalid' {
  const index = args.indexOf('--embedding-model');
  if (index === -1) {
    return null;
  }

  const value = args[index + 1];
  if (!value || value.startsWith('-')) {
    return 'invalid';
  }

  return value;
}

function readSeverity(args: string[]): 'high' | 'med' | 'low' | null {
  const index = args.indexOf('--severity');
  if (index === -1) return null;
  const value = args[index + 1];
  return value === 'high' || value === 'med' || value === 'low' ? value : null;
}

function filterFindingsBySeverity(
  findings: AuditFinding[],
  minSeverity: 'high' | 'med' | 'low',
): AuditFinding[] {
  return findings.filter((f) => shouldFail(f.severity, minSeverity));
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

function buildScanPayload(skills: SkillRecord[], conflicts: ConflictPair[]) {
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

function buildConflictsPayload(conflicts: ConflictPair[], suggestions: ReturnType<typeof suggestCleanup>) {
  return {
    duplicates: conflicts.filter((pair) => pair.kind === 'duplicate'),
    conflicts: conflicts.filter((pair) => pair.kind === 'conflict'),
    suggestions,
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

function readReport(args: string[]): string | true | null {
  const index = args.indexOf('--report');
  if (index === -1) return null;
  const next = args[index + 1];
  if (next && !next.startsWith('-')) return next;
  return true;
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

function toSkillFile(skill: SkillRecord): SkillFile {
  return {
    filePath: skill.sourcePath,
    platform: skill.platform,
    scope: skill.scope,
    confidence: skill.provenance?.confidence ?? 'low',
    installSource: skill.provenance?.installSource ?? skill.sourcePath,
  };
}

function readAnalysisLlmOptions(): LlmExplainOptions | null {
  try {
    const { config } = loadUserConfig();
    const analysis = config.analysis ?? {};
    const baseUrl = analysis.baseUrl;
    const modelId = analysis.model;
    if (!baseUrl || !modelId) return null;
    return {
      baseUrl,
      modelId,
      ...(analysis.apiKey ? { apiKey: analysis.apiKey } : {}),
      ...(analysis.timeoutMs ? { timeoutMs: analysis.timeoutMs } : {}),
    };
  } catch {
    return null;
  }
}