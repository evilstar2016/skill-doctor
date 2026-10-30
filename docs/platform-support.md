# Platform support and validation

[English](platform-support.md) | [中文](platform-support.zh-CN.md)

This page records the paths and test evidence implemented in the current repository. A path being listed does not mean every platform-specific behavior has equal test coverage.

## Discovery paths

| Platform | Global paths | Project paths |
|----------|--------------|---------------|
| Claude Code | `~/.claude/skills/`, `~/.claude/commands/`, `~/.claude/rules/`, `~/.claude/agents/` (cost only) | `.claude/skills/`, `.claude/commands/`, `.claude/rules/`, `CLAUDE.local.md`, `.claude/agents/` (cost only) |
| Cursor | `~/.cursor/rules/` | `.cursor/rules/`, `.cursorrules` |
| GitHub Copilot | `~/.copilot/skills/` | `.github/copilot-instructions.md`, `.github/instructions/`, `.github/prompts/`, `.github/skills/`, `.vscode/mcp.json` |
| Codex | `~/.codex/AGENTS.md` | `AGENTS.md` |
| Gemini CLI | `~/.gemini/skills/` | `.gemini/skills/`, `GEMINI.md` |
| Windsurf | `~/.codeium/windsurf/skills/` | `.windsurfrules` |
| Kiro | `~/.kiro/skills/` | `.kiro/skills/` |
| Trae | `~/.trae/skills/` | `.trae/skills/` |
| OpenCode | `~/.config/opencode/skills/` | `skills/`, `AGENTS.md` |
| OpenClaw | `~/.openclaw/skills/` | — |
| Hermes | `~/.config/hermes/skills/` | — |
| WorkBuddy | `~/.workbuddy/skills/`, `~/.workbuddy/connectors/skills/`, `~/.workbuddy/IDENTITY.md`, `~/.workbuddy/USER.md`, `~/.workbuddy/SOUL.md`, `~/.workbuddy/MEMORY.md` | `.workbuddy/skills/` |
| InfCode | `~/.infcode/skills/`, `~/.infcode/rules/` | `.infcode/skills/`, `.infcode/rules/`, `.infcode/mcpServers/mcp.json` |

WorkBuddy also reads static MCP configuration from `~/.workbuddy/mcp.json` and `.workbuddy/mcp.json`. Skills can be installed to the `workbuddy-global-skills` and `workbuddy-project-skills` targets. Dynamic connector MCP aggregation, marketplace caches, and plugin or built-in runtime state are not treated as active resources. InfCode MCP discovery is project-level. Additional directories can be added through `paths.extra`; see the [CLI reference](README.md).

## Feature test maturity

The markers describe repository test evidence, not whether an untested feature is supported:

- `✓` — the platform and feature are exercised in the multi-platform regression scenario.
- `◐` — focused path/discovery tests exist for Scan, but the platform is not in that scenario.
- `○` — no platform-specific test evidence for that feature beyond registry-level coverage.
- `—` — no static MCP config path is declared by the adapter.

| Platform | Path confidence | Scan | Conflicts | Static audit | Skill cost | Static MCP cost | Known boundary |
|----------|-----------------|------|-----------|--------------|------------|-----------------|----------------|
| Claude Code | High | ✓ | ✓ | ✓ | ✓ | ✓ | Shared Skill pipeline and static MCP config; subagent files are cost-only |
| Cursor | High | ✓ | ✓ | ✓ | ✓ | ✓ | Shared Skill pipeline and static MCP config |
| GitHub Copilot | High | ✓ | ✓ | ✓ | ✓ | ✓ | Instructions/prompts may be cost-only; conflicts and audit operate on Skills |
| Codex | High | ✓ | ✓ | ✓ | ✓ | ✓ | History-based analysis and controls are Codex-specific; `AGENTS.md` control is unsupported |
| Gemini CLI | High | ✓ | ✓ | ✓ | ✓ | ✓ | `GEMINI.md` and configured context files contribute to cost estimates |
| Windsurf | High | ✓ | ✓ | ✓ | ✓ | — | `AGENTS.md` is cost-only; no static MCP config path |
| Kiro | High | ○ | ○ | ○ | ○ | — | Registered paths; no platform-specific discovery fixture yet |
| Trae | Low | ○ | ○ | ○ | ○ | — | Best-effort/community path; no platform-specific discovery fixture yet |
| OpenCode | Low | ◐ | ○ | ○ | ○ | — | Focused path tests; best-effort/community path |
| OpenClaw | High | ◐ | ○ | ○ | ○ | — | Global Skill path only; no project path |
| Hermes | High | ◐ | ○ | ○ | ○ | — | Global Skill path only; no project path |
| WorkBuddy | High | ✓ | ✓ | ✓ | ✓ | ✓ | Dynamic connectors, marketplace cache, and plugin/runtime state are excluded |
| InfCode | High | ✓ | ✓ | ✓ | ✓ | ✓ | Static MCP discovery is project-level |

Path confidence describes how directly the adapter path is documented; it is separate from test maturity. The multi-platform scenario covers Scan, conflict detection, static audit, and Skill context cost for eight platforms. Static MCP cost is exercised for the seven platforms whose adapters declare MCP config paths.

Conflict detection and static audit operate on discovered Skills. Instruction/rule entries marked cost-only contribute to context cost only. Token totals are estimates rather than exact runtime or billing measurements. Live MCP details depend on the server being reachable, and runtime context may differ from the local configuration preview.

See [Adding a platform adapter](../ADDING_PLATFORM.md) for contributor guidance and the [CLI reference](README.md) for commands and options.
