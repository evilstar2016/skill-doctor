# cost MCP token 预算支持计划

## 已完成事项

- `cost` / `context` 子命令已经存在，可估算每轮上下文 token tax。
- 已支持 `--platform`、平台位置参数、`--scope`、`--budget-tokens`、`--fail-on-budget` 和 `--json`。
- 已输出总估算 token、预算、等级、是否超预算、扫描项数量和按平台汇总。
- 已支持显式项目目录参数，并默认统计当前项目配置加全局配置。
- 已有平台感知估算模式：
  - Claude Code `SKILL.md` 估算 name、description、trigger 元数据。
  - 非 Claude skill-dir agent 估算激活元数据。
  - Cursor rule 文件估算本地规则正文。
  - GitHub Copilot instruction 文件估算本地 instruction 正文。
  - `AGENTS.md`、`.codex/AGENTS.md`、`GEMINI.md`、`.windsurfrules` 等 always-on 文件估算本地文件内容。
- 已有平台发现覆盖 Claude、Cursor、Copilot、Codex、Gemini、Windsurf、Trae、OpenCode、Kiro、OpenClaw、Hermes 和 unknown extra paths。
- 已有 README、CHANGELOG 和测试覆盖当前 `cost` 行为。

## 待办事项

以下为本分支计划的待办项，当前均已完成：

- [x] 增加静态 MCP 配置发现，不启动 MCP server，不连接远程 URL。
- [x] 增加 Codex TOML MCP 配置解析。
- [x] 增加 Claude Code、Gemini、Cursor JSON MCP 配置解析。
- [x] 增加 `mcp-server-config` 成本类型。
- [x] 增加 `--source skill|mcp|all`，默认 `all`。
- [x] 增加 `claudecode` / `claude-code` 平台别名，输出仍使用 canonical `claude`。
- [x] 对 MCP env/header 只保留 key 名，屏蔽实际 secret 值。
- [x] 跳过 disabled MCP server。
- [x] 更新终端渲染和 JSON 输出，标明 item 来源。
- [x] 增加 MCP 扫描、secret 屏蔽、source 过滤、平台别名、预算失败等测试。
- [x] 更新 README 和中文 README 的 `cost` 文档。

## 当前实现状态

- 本计划已在 `/Users/evilstar/GitHub/skill-doctor-cost-mcp-budget` 的 `codex/cost-mcp-budget` 分支实现。
- 详细测试结果见 `doc/specs/cost-mcp-budget-test-report.md`。
