import type { ContextCostOfficialLimit, ContextInjectionKind } from '../types/context';
import type { Confidence, Platform, Scope, SkillFile } from '../types/skill';

export interface PlatformPathTarget {
  path: string;
  mode: 'recursive-dir' | 'single-file';
  layout?: 'files' | 'skill-dirs';
  includeFileNames?: string[];
  includeFileNameSuffixes?: string[];
  costOnly?: boolean;
}

export interface PlatformInstallTarget {
  targetId: string;
  scope: 'global' | 'project';
  path: string;
  layout: 'files' | 'skill-dirs';
}

export interface PlatformMcpConfigSource {
  scope: 'global' | 'project';
  path: string;
  format: 'json' | 'toml';
}

export interface PlatformRuntimeContext {
  projectDir: string;
  homeDir: string;
  appDataDir: string;
}

export interface PlatformInstructionCandidate {
  filePath: string;
  installSource: string;
  scope: Scope;
}

export interface PlatformScanSource {
  id: string;
  platform: Platform;
  resource: 'skill' | 'mcp' | 'plugin';
  scope: Scope;
  path: string;
  enabled: boolean;
  origin: 'builtin' | 'override';
  format?: 'json' | 'toml';
  mode?: 'recursive-dir' | 'single-file';
  layout?: 'files' | 'skill-dirs';
  skillsField?: string;
  defaultSkillsDir?: string;
  costOnly?: boolean;
}

export interface PlatformMcpJsonConfig {
  servers: Record<string, unknown>;
  baseConfig?: Record<string, unknown>;
  scope: Scope;
}

export interface PlatformMcpJsonContext {
  projectDir: string;
  scope: Scope;
}

export interface PlatformAdapter {
  platform: Platform;
  displayName: string;
  aliases: string[];
  confidence: Confidence;
  global: PlatformPathTarget[];
  project: PlatformPathTarget[];
  extensions: string[];
  installTargets: PlatformInstallTarget[];
  mcpConfigFiles: PlatformMcpConfigSource[];
  costPolicy: PlatformCostPolicy;
  discoverAdditionalInstructions?: (context: PlatformRuntimeContext) => PlatformInstructionCandidate[];
  postProcessInstructions?: (files: SkillFile[]) => SkillFile[];
  getBuiltinScanSources?: (context: PlatformRuntimeContext) => PlatformScanSource[];
  resolveScanSourcePath?: (
    source: { path: string; scope: Scope },
    context: PlatformRuntimeContext,
  ) => string;
  discoverAdditionalMcpJsonConfigs?: (
    parsed: Record<string, unknown>,
    context: PlatformMcpJsonContext,
  ) => PlatformMcpJsonConfig[];
}

export type PlatformPathDefinition = PlatformAdapter;
export type PathTarget = PlatformPathTarget;

export type PlatformCostProfileMode = 'metadata' | 'always-on' | 'file-scoped' | 'manual';

export interface PlatformCostPolicyProfile {
  mode: PlatformCostProfileMode;
  kind: ContextInjectionKind;
  includePath?: boolean;
  officialLimit?: ContextCostOfficialLimit;
}

export interface PlatformCostPolicyMatch {
  entryFile?: boolean;
  fileName?: string;
  fileNameIn?: string[];
  fileNameSuffix?: string;
  pathIncludes?: string;
  frontmatterTruthy?: string;
  frontmatterExists?: string;
  frontmatterEquals?: Record<string, string>;
}

export interface PlatformCostPolicyRule {
  match: PlatformCostPolicyMatch;
  profile: PlatformCostPolicyProfile;
}

export interface PlatformCostPolicy {
  rules: PlatformCostPolicyRule[];
  defaultProfile: PlatformCostPolicyProfile;
}
