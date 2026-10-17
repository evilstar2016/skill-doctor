# 平台支持与验证范围

[English](platform-support.md) | [中文](platform-support.zh-CN.md)

本文记录当前仓库实现的平台路径与测试证据。列出某个平台，不代表它的所有平台专项行为都经过了同等程度的测试。

## 发现路径

| 平台 | 全局路径 | 项目路径 |
|------|----------|----------|
| Claude Code | `~/.claude/skills/` | `.claude/skills/` |
| Cursor | `~/.cursor/rules/` | `.cursor/rules/`、`.cursorrules` |
| GitHub Copilot | `~/.copilot/skills/` | `.github/copilot-instructions.md`、`.github/instructions/`、`.github/prompts/`、`.github/skills/`、`.vscode/mcp.json` |
| Codex | `~/.codex/AGENTS.md` | `AGENTS.md` |
| Gemini CLI | `~/.gemini/skills/` | `.gemini/skills/`、`GEMINI.md` |
| Windsurf | `~/.codeium/windsurf/skills/` | `.windsurfrules` |
| Kiro | `~/.kiro/skills/` | `.kiro/skills/` |
| Trae | `~/.trae/skills/` | `.trae/skills/` |
| OpenCode | `~/.config/opencode/skills/` | `skills/`、`AGENTS.md` |
| OpenClaw | `~/.openclaw/skills/` | — |
| Hermes | `~/.config/hermes/skills/` | — |
| WorkBuddy | `~/.workbuddy/skills/`、`~/.workbuddy/connectors/skills/`、`~/.workbuddy/IDENTITY.md`、`~/.workbuddy/USER.md`、`~/.workbuddy/SOUL.md`、`~/.workbuddy/MEMORY.md` | `.workbuddy/skills/` |
| InfCode | `~/.infcode/skills/`、`~/.infcode/rules/` | `.infcode/skills/`、`.infcode/rules/`、`.infcode/mcpServers/mcp.json` |

WorkBuddy 还会读取 `~/.workbuddy/mcp.json` 和 `.workbuddy/mcp.json` 中的静态 MCP 配置；Skill 安装目标包括 `workbuddy-global-skills` 和 `workbuddy-project-skills`。动态连接器 MCP 汇总、市场缓存及插件/内置运行时状态不会被视为已启用资源。InfCode 只从项目级配置发现 MCP。可通过 `paths.extra` 增加目录，详见[命令参考](README.zh-CN.md)。

## 功能测试成熟度

标记表示仓库中的测试证据，不表示未覆盖的功能一定不可用：

- `✓` — 该平台的此项功能纳入多平台回归场景。
- `◐` — 扫描有路径/发现专项测试，但该平台未纳入上述回归场景。
- `○` — 除适配器注册级覆盖外，此项功能没有平台专项测试证据。
- `—` — 适配器没有声明静态 MCP 配置路径。

| 平台 | 路径置信度 | 扫描 | 冲突 | 静态审计 | Skill 成本 | 静态 MCP 成本 | 已知边界 |
|------|------------|------|------|----------|-----------|---------------|----------|
| Claude Code | 高 | ✓ | ✓ | ✓ | ✓ | ✓ | 使用通用 Skill 流程和静态 MCP 配置 |
| Cursor | 高 | ✓ | ✓ | ✓ | ✓ | ✓ | 使用通用 Skill 流程和静态 MCP 配置 |
| GitHub Copilot | 高 | ✓ | ✓ | ✓ | ✓ | ✓ | Instructions/prompts 可仅计入成本；冲突和审计面向 Skills |
| Codex | 高 | ✓ | ✓ | ✓ | ✓ | ✓ | 历史分析与控制是 Codex 专属；不支持控制 `AGENTS.md` |
| Gemini CLI | 高 | ✓ | ✓ | ✓ | ✓ | ✓ | `GEMINI.md` 和配置的上下文文件计入成本估算 |
| Windsurf | 高 | ✓ | ✓ | ✓ | ✓ | — | `AGENTS.md` 仅计入成本；未适配静态 MCP 配置路径 |
| Kiro | 高 | ○ | ○ | ○ | ○ | — | 已注册路径，尚无平台专项发现测试 |
| Trae | 低 | ○ | ○ | ○ | ○ | — | 尽力兼容/社区路径，尚无平台专项发现测试 |
| OpenCode | 低 | ◐ | ○ | ○ | ○ | — | 有路径专项测试；属于尽力兼容/社区路径 |
| OpenClaw | 高 | ◐ | ○ | ○ | ○ | — | 仅全局 Skill 路径；没有项目级路径 |
| Hermes | 高 | ◐ | ○ | ○ | ○ | — | 仅全局 Skill 路径；没有项目级路径 |
| WorkBuddy | 高 | ✓ | ✓ | ✓ | ✓ | ✓ | 不把动态连接器、市场缓存及插件/运行时状态当作已启用资源 |
| InfCode | 高 | ✓ | ✓ | ✓ | ✓ | ✓ | 静态 MCP 发现仅支持项目级配置 |

路径置信度表示适配器路径与文档的明确程度，不代表测试成熟度。多平台回归场景覆盖 8 个平台的扫描、冲突检测、静态审计和 Skill 上下文成本；适配器声明了 MCP 配置路径的 7 个平台覆盖静态 MCP 成本。

冲突检测和静态审计处理已发现的 Skills。标记为 cost-only 的 instructions/rules 只参与上下文成本估算。Token 总量是估算值，不等于实际运行时上下文或计费。实时 MCP 详情依赖服务可连接；运行时上下文也可能与本地配置预览不同。

平台开发说明见[添加平台适配器](../ADDING_PLATFORM.md)，命令和参数见[命令参考](README.zh-CN.md)。
