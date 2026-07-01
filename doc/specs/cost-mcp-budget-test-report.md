# cost MCP token 预算支持测试报告

## 基本信息

- Worktree: `/Users/evilstar/GitHub/skill-doctor-cost-mcp-budget`
- Branch: `codex/cost-mcp-budget`
- 日期: 2026-07-01
- Main 合并验证日期: 2026-07-02

## 实现摘要

- `cost` / `context` 新增 `--source skill|mcp|all`，默认 `all`。
- 新增静态 MCP 配置扫描，覆盖 Codex TOML、Claude Code JSON、Gemini JSON、Cursor JSON。
- 新增 `mcp-server-config` 成本类型，并复用现有预算、分级、按平台汇总和 JSON 输出。
- 新增 `claudecode` / `claude-code` 平台别名，输出仍使用 canonical `claude`。
- MCP env/header 只保留 key 名，实际值不会进入扫描结果或成本估算文本。
- disabled MCP server 会被排除。

## 测试命令与结果

| 命令 | 结果 | 说明 |
| --- | --- | --- |
| `npm test -- tests/mcp/scanMcpServers.test.ts tests/context/estimateContextCost.test.ts tests/cli/integration.test.ts` | PASS | 3 个测试文件，81 个测试通过。覆盖新增 MCP 扫描、成本估算和 CLI 集成路径。 |
| `npm test` | PASS | 40 个测试文件，350 个测试通过。 |
| `npm run build` | PASS | ESM、CJS、DTS 构建均成功。 |
| `npm test -- tests/context/estimateContextCost.test.ts tests/mcp/scanMcpServers.test.ts tests/cli/integration.test.ts` | PASS | main 合并后验证，3 个测试文件，85 个测试通过。 |
| `npm test` | PASS | main 合并后验证，40 个测试文件，359 个测试通过。 |
| `npm run build` | PASS | main 合并后验证，ESM、CJS、DTS 构建均成功。 |

## 覆盖场景

- Codex `[mcp_servers.<name>]` TOML 解析。
- Claude Code `.mcp.json` JSON 解析。
- Gemini `.gemini/settings.json` `mcpServers` 与 `mcp.allowed` / `mcp.excluded` 解析。
- Cursor `.cursor/mcp.json` JSON 解析。
- MCP secret 值不出现在扫描结果中。
- disabled MCP server 不计入预算。
- `mcp-server-config` 成本估算。
- `--source mcp`、`--source skill` 和默认 `all` 行为。
- `--platform codex` 和位置参数 `claudecode` 过滤。
- MCP 预算超限时 `--fail-on-budget` 返回非 0。
- 非法 `--source` 报错。

## 注意事项

- 本实现只做静态本地配置读取；测试没有启动 MCP server，没有连接配置中的 URL，也没有调用工具发现接口。
- 安装依赖时 `npm install` 报告了当前依赖树中的 npm audit 告警：1 low、1 high、2 critical。本次没有自动运行 `npm audit fix`，避免引入与功能无关的依赖版本变更。
- 全量测试第一次运行时因为新 worktree 缺少可跟踪的 `doc/scenarios/**/manifest.json` 而失败；随后为本功能补充了场景 manifest，并只在 `.gitignore` 中放开本功能相关文档路径。复跑全量测试通过。
