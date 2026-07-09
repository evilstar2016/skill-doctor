# Adding a Platform Adapter

Platform-specific discovery, install targets, MCP config files, and context-cost rules live in `src/platforms/registry.ts`. Add a platform there first, then update tests and fixtures around the behavior the adapter enables.

## 1. Define the platform ID

Add the canonical lowercase ID to `Platform` in `src/types/skill.ts`.

Keep IDs stable because they appear in CLI JSON, reports, install registry entries, and ignore/budget config.

## 2. Add the adapter

Add one `PlatformAdapter` entry to `PLATFORM_ADAPTERS` in `src/platforms/registry.ts`.

Required decisions:

- `platform`: the canonical `Platform` ID.
- `displayName`: human-readable name for docs and future UI.
- `aliases`: CLI aliases accepted by `--platform`, `--platform-budget`, install `--target`, and cost positional filters.
- `confidence`: `high` for documented paths, `low` for best-effort/community paths.
- `global` and `project`: discovery paths, scope, layout, and file filters.
- `extensions`: file extensions allowed in those paths.
- `installTargets`: global destinations used by `install`, `uninstall`, and auto-detection.
- `mcpConfigFiles`: local MCP config files to scan for `cost --source mcp`.
- `costPolicy`: rules that classify records as metadata, always-on, file-scoped, or manual.

Use `costOnly: true` when a path should affect context-cost estimates but should not appear in normal `scan`, `conflicts`, `audit`, `show`, `diff`, or dashboard inventory.

## 3. Preserve shared records

The adapter should feed existing shared records instead of creating command-specific shapes:

- skill discovery returns `SkillFile`, then parsing returns `SkillRecord`;
- MCP discovery returns `McpServerRecord`;
- context estimates return `ContextCostItem`;
- install/uninstall writes `RegistryEntry`.

Renderers and JSON payloads should keep using those records so `scan`, `conflicts`, `audit`, `cost/context`, `dashboard`, `show`, `diff`, `install`, and `uninstall` remain compatible.

## 4. Add fixtures and tests

Add the smallest fixtures needed under `tests/fixtures` or inline in the relevant test when the layout is clearer.

Update or add tests for the adapter features you changed:

- `tests/platforms/registry.test.ts`: platform order, aliases, install target, MCP files, cost policy.
- `tests/discovery/resolvePaths.test.ts`: global/project discovery, layout, extension filters, `costOnly` behavior.
- `tests/mcp/scanMcpServers.test.ts`: MCP config parsing if `mcpConfigFiles` is non-empty.
- `tests/context/estimateContextCost.test.ts`: cost-policy classification and recommendations.
- `tests/install/resolveInstallPath.test.ts` and `tests/install/detectPlatform.test.ts`: install target support.
- `tests/cli/integration.test.ts`: CLI help/validation, cost filtering, install target aliases, and stable JSON output when user-facing behavior changes.
- `tests/render/render.test.ts` and `tests/render/renderDashboard.test.ts`: renderer compatibility if visible output changes.
- `tests/scenarios/platform-adapter-regression/multi-platform-regression.scenario.ts`: end-to-end coverage for Claude Code, Cursor, Copilot, Codex, Gemini CLI, and Windsurf together. Keep this scenario focused on shared `SkillRecord`, `McpServerRecord`, and `ContextCostItem` behavior rather than adapter internals.

## 5. Update docs

Update `README.md` platform coverage and `doc/architecture-index.md` when the adapter adds new ownership or behavior. CLI help and platform validation are generated from the registry, so do not hard-code platform lists in CLI text.

## 6. Verify

Run focused tests first:

```bash
npm test -- tests/cli/integration.test.ts tests/render/render.test.ts tests/render/renderDashboard.test.ts
```

Then run the full suite:

```bash
npm test
```
