# Adding a Platform Adapter

Platform-specific discovery, install targets, MCP config files, context-cost rules, and optional behavior hooks live under `src/platforms/adapters/`. Generic discovery and configuration modules consume the registered adapters and must not add platform-name branches for new agents.

## 1. Define the platform ID

Add the canonical lowercase ID to `Platform` in `src/types/skill.ts`.

Keep IDs stable because they appear in CLI JSON, reports, install registry entries, and ignore/budget config.

## 2. Add and register the adapter

Add `src/platforms/adapters/<agent>.ts`, export one `PlatformAdapter`, and register it in `src/platforms/adapters/index.ts`.

Required decisions:

- `platform`: the canonical `Platform` ID.
- `displayName`: human-readable name for docs and future UI.
- `aliases`: CLI aliases accepted by `--platform`, `--platform-budget`, install `--target`, and cost positional filters.
- `confidence`: `high` for documented paths, `low` for best-effort/community paths.
- `global` and `project`: discovery paths, scope, layout, and file filters.
- `extensions`: file extensions allowed in those paths.
- `installTargets`: stable, explicitly scoped destinations. Each needs a unique `targetId`, `scope`, and `layout`. Only declare documented writable `skill-dirs` locations that Skill Doctor may deploy to; discovery-only, `costOnly`, single-file, and system-owned paths must not become deployment targets. Add a project target only when its relative path is safe to resolve under the current project.
- `mcpConfigFiles`: local MCP config files to scan for `cost --source mcp`.
- `costPolicy`: rules that classify records as metadata, always-on, file-scoped, or manual.

Use `costOnly: true` when a path should affect context-cost estimates but should not appear in normal `scan`, `conflicts`, `audit`, `show`, `diff`, or dashboard inventory.

Platforms whose behavior is fully described by those fields need no runtime hooks.

## 3. Keep special behavior in the adapter

The runtime created by `createPlatformRuntime` binds instruction hooks to the current project, home, and application-data directories. Available adapter hooks cover:

- `discoverAdditionalInstructions`: instruction files derived from Agent configuration or recursive discovery.
- `postProcessInstructions`: precedence and override rules after generic discovery.
- `getBuiltinScanSources`: dynamic Skill, plugin, or MCP scan sources.
- `resolveScanSourcePath`: platform-specific path expansion.
- `discoverAdditionalMcpJsonConfigs`: additional MCP server collections inside a JSON configuration.

If adding a platform requires `platform === 'example'` in discovery, scan-source, or MCP orchestration, add or extend an adapter hook instead.

## 4. Preserve shared records

The adapter should feed existing shared records instead of creating command-specific shapes:

- skill discovery returns `SkillFile`, then parsing returns `SkillRecord`;
- MCP discovery returns `McpServerRecord`;
- context estimates return `ContextCostItem`;
- install/uninstall writes `RegistryEntry`.

Renderers and JSON payloads should keep using those records so `scan`, `conflicts`, `audit`, `cost/context`, `dashboard`, `show`, `diff`, `install`, and `uninstall` remain compatible.

## 5. Add fixtures and tests

Add the smallest fixtures needed under `tests/fixtures` or inline in the relevant test when the layout is clearer.

Update or add tests for the adapter features you changed:

- `tests/platforms/registry.test.ts`: platform order, aliases, install target, MCP files, cost policy.
- `tests/platforms/runtime.test.ts`: runtime hook dispatch and platform-specific instruction post-processing.
- `tests/discovery/resolvePaths.test.ts`: global/project discovery, layout, extension filters, `costOnly` behavior.
- `tests/config/scanSources.test.ts`: built-in and dynamic scan sources.
- `tests/mcp/scanMcpServers.test.ts`: MCP config parsing if `mcpConfigFiles` is non-empty.
- `tests/context/estimateContextCost.test.ts`: cost-policy classification and recommendations.
- `tests/install/resolveInstallPath.test.ts` and `tests/install/detectPlatform.test.ts`: legacy install target support.
- `tests/library/deployments.test.ts`: stable target IDs, global/current-project resolution, and managed directory deployment behavior when `skill-dirs` targets change.
- `tests/cli/integration.test.ts`: CLI help/validation, cost filtering, install target aliases, and stable JSON output when user-facing behavior changes.
- `tests/render/render.test.ts` and `tests/render/renderDashboard.test.ts`: renderer compatibility if visible output changes.
- `tests/scenarios/platform-adapter-regression/multi-platform-regression.scenario.ts`: end-to-end coverage for Claude Code, Cursor, Copilot, Codex, Gemini CLI, and Windsurf together. Keep this scenario focused on shared `SkillRecord`, `McpServerRecord`, and `ContextCostItem` behavior rather than adapter internals.

## 6. Update docs

Update `README.md` platform coverage and `doc/architecture-index.md` when the adapter adds new ownership or behavior. CLI help and platform validation are generated from the registry, so do not hard-code platform lists in CLI text.

## 7. Verify

Run focused tests first:

```bash
npm test -- tests/platforms tests/discovery/resolvePaths.test.ts tests/config/scanSources.test.ts tests/mcp/scanMcpServers.test.ts
```

Then run the full repository gates:

```bash
npm test
npm run typecheck:ui
npm run build
git diff --check
```
