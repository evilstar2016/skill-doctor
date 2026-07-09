# Skill Doctor Architecture Index

This document is the repository index for architecture and functions.

## Indexing Rules

1. Use Domain -> Module -> Component as the primary navigation model.
2. Use `path::symbol` as the unique lookup key for each function.
3. Before adding any new function:
   - check this file for the closest existing module and component;
   - search the codebase for reusable functions in the same domain;
   - only add a new function if no existing function matches the intended responsibility.
4. After adding, renaming, or removing any function, update this file in the same change.

## Lookup Workflow

1. Find the target domain in this document.
2. Find the module that owns the behavior.
3. Reuse an existing component when the behavior already fits.
4. If a new component is required, add it to the owning module section immediately.

## Domain Map

- Domain: CLI orchestration
  - Module: `src/cli/index.ts`
  - Responsibility: parse commands, apply filters, format JSON payloads, and dispatch renderers.
- Domain: Platform adapters
  - Module: `src/platforms/registry.ts`
  - Responsibility: own platform IDs, aliases, discovery paths, install targets, MCP config locations, and context-cost policies.
- Domain: Discovery
  - Module: `src/discovery/resolvePaths.ts`
  - Module: `src/discovery/scanSkills.ts`
  - Responsibility: expand adapter-defined paths and load candidate skill files into shared discovery records.
- Domain: MCP discovery
  - Module: `src/mcp/scanMcpServers.ts`
  - Module: `src/mcp/listMcpTools.ts`
  - Responsibility: scan adapter-defined MCP config files and normalize server/tool records for context-cost estimates.
- Domain: Context cost
  - Module: `src/context/estimateContextCost.ts`
  - Responsibility: classify shared skill and MCP records using adapter-owned cost policies, then estimate token budget impact.
- Domain: Regression scenarios
  - Module: `tests/scenarios/platform-adapter-regression/multi-platform-regression.scenario.ts`
  - Responsibility: verify that platform adapters feed shared scan, conflict, audit, cost, MCP, and dashboard records without command-specific platform logic.
- Domain: Install
  - Module: `src/install/detectPlatform.ts`
  - Module: `src/install/resolveInstallPath.ts`
  - Module: `src/install/installSkill.ts`
  - Module: `src/install/uninstallSkill.ts`
  - Module: `src/install/registry.ts`
  - Responsibility: resolve adapter-defined install targets and maintain stable install registry records.
- Domain: Parsing
  - Module: `src/parsing/parseSkill.ts`
  - Module: `src/parsing/extractTriggers.ts`
  - Responsibility: parse skill files into `SkillRecord` objects and normalize extracted text.
- Domain: Conflict analysis
  - Module: `src/conflicts/detectConflicts.ts`
  - Module: `src/conflicts/tokenize.ts`
  - Module: `src/conflicts/stopwords.ts`
  - Responsibility: convert text to tokens, detect duplicates, and score semantic overlap.
- Domain: Rendering
  - Module: `src/render/renderScan.ts`
  - Module: `src/render/renderShow.ts`
  - Module: `src/render/renderConflicts.ts`
  - Responsibility: render terminal-friendly reports for scan, show, and conflicts.
- Domain: Types
  - Module: `src/types/skill.ts`
  - Responsibility: define shared platform, scope, conflict, and skill contracts.

## Function Catalog

### Domain: CLI orchestration

Module: `src/cli/index.ts`

| Index Key | Line | Role | Purpose |
| --- | --- | --- | --- |
| `src/cli/index.ts::main` | 11 | exported entry | Parse argv, route `scan`/`show`/`conflicts`, validate flags, and write output. |
| `src/cli/index.ts::getHelpText` | 667 | internal helper | Build CLI usage text, including platform values from the platform registry. |
| `src/cli/index.ts::formatPlatformUsage` | 691 | internal helper | Format registry-owned platform IDs and aliases for CLI help and validation errors. |
| `src/cli/index.ts::hasFlag` | 132 | internal helper | Detect boolean flags such as `--json`. |
| `src/cli/index.ts::readFailOn` | 136 | internal helper | Parse `--fail-on` severity thresholds. |
| `src/cli/index.ts::readScope` | 147 | internal helper | Parse `--scope` and validate allowed values. |
| `src/cli/index.ts::readKind` | 163 | internal helper | Parse `--kind` for duplicate/conflict filtering. |
| `src/cli/index.ts::shouldFail` | 179 | internal helper | Compare actual severity against the configured failure threshold. |
| `src/cli/index.ts::filterSkillsByScope` | 189 | internal helper | Filter scanned skills by project/global scope. |
| `src/cli/index.ts::buildScanPayload` | 197 | internal helper | Create the JSON payload returned by `scan --json`. |
| `src/cli/index.ts::buildConflictsPayload` | 213 | internal helper | Create the JSON payload returned by `conflicts --json`. |
| `src/cli/index.ts::countPlatforms` | 220 | internal helper | Count skills by platform for scan summaries. |
| `src/cli/index.ts::countScopes` | 230 | internal helper | Count skills by scope for scan summaries. |
| `src/cli/index.ts::countPlatformsByScope` | 240 | internal helper | Build nested per-scope platform counts for scan summaries. |
| `src/cli/index.ts::toJson` | 251 | internal helper | Serialize CLI JSON output with stable pretty printing. |
| `src/cli/index.ts::readLimit` | 255 | internal helper | Parse `--limit` as a positive integer. |
| `src/cli/index.ts::sortConflicts` | 272 | internal helper | Sort conflict pairs by kind, severity, similarity, and name. |
| `src/cli/index.ts::limitConflicts` | 294 | internal helper | Trim sorted conflicts to the requested top-N result set. |
| `src/cli/index.ts::filterConflictsByKind` | 302 | internal helper | Keep only duplicates or semantic conflicts when requested. |
| `src/cli/index.ts::rankKind` | 313 | internal helper | Convert conflict kinds to sortable priority values. |
| `src/cli/index.ts::rankSeverity` | 317 | internal helper | Convert severities to sortable priority values. |

### Domain: Platform adapters

Module: `src/platforms/registry.ts`

| Index Key | Line | Role | Purpose |
| --- | --- | --- | --- |
| `src/platforms/registry.ts::PLATFORM_ADAPTERS` | 86 | exported constant | Define canonical platform adapters for discovery, install, MCP, and cost behavior. |
| `src/platforms/registry.ts::UNKNOWN_PLATFORM_ADAPTER` | 437 | exported constant | Define the fallback adapter for custom `paths.extra` records. |
| `src/platforms/registry.ts::getPlatformAdapters` | 452 | exported helper | Return canonical platform adapters excluding `unknown`. |
| `src/platforms/registry.ts::getAllPlatformAdapters` | 456 | exported helper | Return canonical adapters plus `unknown`. |
| `src/platforms/registry.ts::getPlatformCliValues` | 460 | exported helper | Return ordered platform IDs for CLI help and validation text. |
| `src/platforms/registry.ts::getPlatformAliasMappings` | 465 | exported helper | Return adapter alias-to-platform mappings for CLI help and validation text. |
| `src/platforms/registry.ts::getPlatformAdapter` | 470 | exported helper | Resolve canonical IDs or aliases to an adapter. |
| `src/platforms/registry.ts::getCanonicalPlatformAdapter` | 476 | exported helper | Resolve only canonical adapter IDs. |
| `src/platforms/registry.ts::normalizePlatformName` | 481 | exported helper | Normalize platform CLI input and aliases to canonical `Platform` IDs. |
| `src/platforms/registry.ts::getDefaultInstallTarget` | 494 | exported helper | Return the first adapter install target as a recursive path target. |
| `src/platforms/registry.ts::resolvePlatformPathTemplate` | 504 | exported helper | Expand `~`, `%USERPROFILE%`, and `%APPDATA%` in adapter path templates. |
| `src/platforms/registry.ts::resolveCustomPath` | 513 | exported helper | Expand user custom paths for `paths.extra`. |

### Domain: Discovery

Module: `src/discovery/scanSkills.ts`

| Index Key | Line | Role | Purpose |
| --- | --- | --- | --- |
| `src/discovery/scanSkills.ts::scanSkills` | 5 | exported service | Resolve candidate files, parse them, and return valid `SkillRecord` entries. |

Module: `src/discovery/resolvePaths.ts`

| Index Key | Line | Role | Purpose |
| --- | --- | --- | --- |
| `src/discovery/resolvePaths.ts::resolvePaths` | 102 | exported service | Resolve all supported platform paths for both project and global scope. |
| `src/discovery/resolvePaths.ts::collectPath` | 119 | internal helper | Walk configured paths, recurse when allowed, and collect matching files. |
| `src/discovery/resolvePaths.ts::getParentDir` | 155 | exported helper | Return the containing directory for a skill file path. |
| `src/discovery/resolvePaths.ts::isAllowedFile` | 159 | internal helper | Check whether a discovered file matches the module's allowed extensions. |

Ownership note: platform path definitions live only in `src/platforms/registry.ts` adapter records. Discovery owns path expansion, precedence, file walking, and conversion to `SkillFile`.

### Domain: MCP discovery

Module: `src/mcp/scanMcpServers.ts`

| Index Key | Line | Role | Purpose |
| --- | --- | --- | --- |
| `src/mcp/scanMcpServers.ts::scanMcpServers` | 26 | exported service | Resolve adapter-owned MCP config files and normalize server records. |
| `src/mcp/scanMcpServers.ts::parseCodexToml` | 69 | exported parser | Parse Codex TOML MCP server config into `McpServerRecord` values. |
| `src/mcp/scanMcpServers.ts::getMcpPrivateConfig` | 192 | exported helper | Retrieve private server command/URL details used by MCP tool discovery. |

Module: `src/mcp/listMcpTools.ts`

| Index Key | Line | Role | Purpose |
| --- | --- | --- | --- |
| `src/mcp/listMcpTools.ts::discoverMcpToolsForServers` | 16 | exported service | Query normalized MCP servers and attach discovered tool lists or connection findings. |

### Domain: Context cost

Module: `src/context/estimateContextCost.ts`

| Index Key | Line | Role | Purpose |
| --- | --- | --- | --- |
| `src/context/estimateContextCost.ts::estimateContextCost` | 35 | exported service | Estimate cost for shared `SkillRecord` and `McpServerRecord` inputs. |
| `src/context/estimateContextCost.ts::estimateTokens` | 69 | exported helper | Approximate token count for normalized text. |
| `src/context/estimateContextCost.ts::buildMcpConfigText` | 324 | exported helper | Build the public MCP config text used for MCP token estimates. |

Ownership note: platform-specific cost behavior is configured in adapter `costPolicy` records; this module owns applying those policies and building `ContextCostItem` output.

### Domain: Install

Module: `src/install/detectPlatform.ts`

| Index Key | Line | Role | Purpose |
| --- | --- | --- | --- |
| `src/install/detectPlatform.ts::detectPlatform` | 18 | exported service | Detect an active install platform from adapter install target directories. |

Module: `src/install/resolveInstallPath.ts`

| Index Key | Line | Role | Purpose |
| --- | --- | --- | --- |
| `src/install/resolveInstallPath.ts::InstallTargetError` | 22 | exported error | Report unknown platforms or unsupported install layouts. |
| `src/install/resolveInstallPath.ts::resolveInstallTarget` | 32 | exported service | Resolve a platform target or alias to a concrete global install directory. |
| `src/install/resolveInstallPath.ts::resolveInstallPath` | 59 | exported helper | Build the final path for a skill-dirs or files layout install. |

Module: `src/install/installSkill.ts`

| Index Key | Line | Role | Purpose |
| --- | --- | --- | --- |
| `src/install/installSkill.ts::installSkill` | 38 | exported service | Copy or link a skill into the resolved target and record the install. |

Module: `src/install/uninstallSkill.ts`

| Index Key | Line | Role | Purpose |
| --- | --- | --- | --- |
| `src/install/uninstallSkill.ts::uninstallSkill` | 20 | exported service | Remove or unregister an installed skill using stable registry records. |

Module: `src/install/registry.ts`

| Index Key | Line | Role | Purpose |
| --- | --- | --- | --- |
| `src/install/registry.ts::loadRegistry` | 7 | exported helper | Load install registry JSON into `InstallRegistry`. |
| `src/install/registry.ts::saveRegistry` | 16 | exported helper | Persist install registry JSON. |
| `src/install/registry.ts::addRegistryEntry` | 21 | exported helper | Add or replace one stable `RegistryEntry`. |
| `src/install/registry.ts::removeRegistryEntry` | 34 | exported helper | Remove one platform/name registry entry. |
| `src/install/registry.ts::findRegistryEntry` | 42 | exported helper | Find a registry entry by name and platform. |

### Domain: Parsing

Module: `src/parsing/extractTriggers.ts`

| Index Key | Line | Role | Purpose |
| --- | --- | --- | --- |
| `src/parsing/extractTriggers.ts::extractBulletLines` | 1 | exported helper | Extract markdown bullet items from a section body. |
| `src/parsing/extractTriggers.ts::uniqueStrings` | 10 | exported helper | Deduplicate strings while preserving input order. |

Module: `src/parsing/parseSkill.ts`

| Index Key | Line | Role | Purpose |
| --- | --- | --- | --- |
| `src/parsing/parseSkill.ts::parseSkill` | 14 | exported service | Parse one skill file into a normalized `SkillRecord`. |
| `src/parsing/parseSkill.ts::splitFrontmatter` | 46 | internal helper | Split a raw markdown file into frontmatter and body sections. |
| `src/parsing/parseSkill.ts::parseFrontmatter` | 69 | internal helper | Parse known frontmatter keys such as `name`, `description`, `globs`, and `applyTo`. |
| `src/parsing/parseSkill.ts::extractHeading` | 117 | internal helper | Extract the first markdown heading as a fallback display name. |
| `src/parsing/parseSkill.ts::extractSectionTriggers` | 122 | internal helper | Pull trigger bullets from named markdown sections. |
| `src/parsing/parseSkill.ts::extractNamedSection` | 127 | internal helper | Return the raw text content for a named markdown section. |
| `src/parsing/parseSkill.ts::stripQuotes` | 150 | internal helper | Remove wrapping single or double quotes from parsed values. |

### Domain: Conflict analysis

Module: `src/conflicts/tokenize.ts`

| Index Key | Line | Role | Purpose |
| --- | --- | --- | --- |
| `src/conflicts/tokenize.ts::tokenize` | 3 | exported helper | Normalize text and convert it to a deduplicated token set. |
| `src/conflicts/tokenize.ts::normalizeToken` | 29 | internal helper | Canonicalize tokens before stopword and length filtering. |

Module: `src/conflicts/detectConflicts.ts`

| Index Key | Line | Role | Purpose |
| --- | --- | --- | --- |
| `src/conflicts/detectConflicts.ts::detectConflicts` | 8 | exported service | Compare skills pairwise and emit duplicates or semantic conflicts. |
| `src/conflicts/detectConflicts.ts::buildConflictText` | 56 | internal helper | Build the text corpus used for token comparison. |
| `src/conflicts/detectConflicts.ts::getSeverity` | 60 | internal helper | Map similarity scores to `high`, `med`, or `low`. |
| `src/conflicts/detectConflicts.ts::isDuplicatePair` | 72 | internal helper | Detect exact duplicates from normalized names. |
| `src/conflicts/detectConflicts.ts::normalizeName` | 76 | internal helper | Canonicalize skill names before duplicate checks. |

Module: `src/conflicts/stopwords.ts`

| Index Key | Line | Role | Purpose |
| --- | --- | --- | --- |
| `src/conflicts/stopwords.ts::STOPWORDS` | 1 | exported constant | Provide language stopwords used by tokenization. |

### Domain: Rendering

Module: `src/render/renderScan.ts`

| Index Key | Line | Role | Purpose |
| --- | --- | --- | --- |
| `src/render/renderScan.ts::renderScan` | 3 | exported renderer | Render the scan summary report for terminal output. |
| `src/render/renderScan.ts::countByPlatform` | 22 | internal helper | Count skills by platform for the text report. |

Module: `src/render/renderShow.ts`

| Index Key | Line | Role | Purpose |
| --- | --- | --- | --- |
| `src/render/renderShow.ts::renderShow` | 3 | exported renderer | Render a single skill detail view for terminal output. |

Module: `src/render/renderConflicts.ts`

| Index Key | Line | Role | Purpose |
| --- | --- | --- | --- |
| `src/render/renderConflicts.ts::renderConflicts` | 3 | exported renderer | Render duplicate and conflict sections for terminal output. |

Module: `src/render/renderReport.ts`

| Index Key | Line | Role | Purpose |
| --- | --- | --- | --- |
| `src/render/renderReport.ts::renderReport` | 3 | exported renderer | Generate a self-contained HTML report for browser viewing. |

### Domain: Types

Module: `src/types/skill.ts`

Key contracts:

- `Platform`: supported platform identifier.
- `Scope`: project or global discovery scope.
- `Severity`: conflict severity level.
- `ConflictKind`: duplicate or semantic conflict.
- `Confidence`: path-definition confidence marker.
- `SkillFile`: discovered file metadata before parsing.
- `SkillRecord`: normalized skill record used across domains.
- `ConflictPair`: normalized conflict result.

## Change Checklist

Before adding or changing a function:

1. Check this index for the owning domain and module.
2. Search existing functions in that module before introducing a new helper.
3. If reuse is not possible, add the smallest new function in the owning module.
4. Update this index in the same patch so the new function is searchable by `path::symbol`.
