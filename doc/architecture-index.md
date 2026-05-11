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
- Domain: Discovery
  - Module: `src/discovery/resolvePaths.ts`
  - Module: `src/discovery/scanSkills.ts`
  - Responsibility: resolve supported platform paths and load candidate skill files.
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
| `src/cli/index.ts::getHelpText` | 120 | internal helper | Build CLI usage text. |
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