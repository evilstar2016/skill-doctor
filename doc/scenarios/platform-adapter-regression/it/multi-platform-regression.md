# Multi-platform adapter regression

This scenario exercises one project containing Claude Code, Cursor, GitHub Copilot, Codex, Gemini CLI, and Windsurf records.

The regression boundary is:

- platform adapters own paths, aliases, MCP config files, install targets, and context-cost policy;
- shared capabilities consume normalized `SkillRecord`, `McpServerRecord`, and `ContextCostItem` values;
- CLI JSON output remains stable while the commands scan, detect conflicts, audit safety rules, estimate cost, parse MCP config, and render the dashboard.

