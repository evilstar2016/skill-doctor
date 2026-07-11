# skill-doctor

[English](README.md) | [中文](README.zh-CN.md)

[![npm version](https://img.shields.io/npm/v/%40evilstar2025%2Fskill-doctor.svg)](https://www.npmjs.com/package/@evilstar2025/skill-doctor)
[![Node.js](https://img.shields.io/badge/node-%3E%3D20-339933.svg)](https://nodejs.org/)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](#license)

`skill-doctor` 是一个本地 CLI，用来诊断 AI Agent 的 skills、rules、instructions：重复安装、触发冲突、安全风险、上下文成本和多工具漂移。

当 Claude Code、Cursor、Copilot、Codex、Gemini CLI、Windsurf 等工具因为配置重叠而表现不一致时，可以先用它做一次本地体检。

![skill-doctor terminal demo](assets/terminal-demo.svg)

## 30 秒试用

当前版本：npm 上的 [`v0.3.5`](https://github.com/evilstar2016/skill-doctor/releases/tag/v0.3.5)。

```bash
npx @evilstar2025/skill-doctor scan
```

如果扫描到了本地 skills，可以继续跑更深入的检查：

```bash
npx @evilstar2025/skill-doctor conflicts
npx @evilstar2025/skill-doctor audit
npx @evilstar2025/skill-doctor cost
npx @evilstar2025/skill-doctor dashboard
```

如果结果显示 `0` 个 project skills，建议先跑下面的安全 demo。demo 会展示已知的重复、冲突和审计结果，不需要先扫描你的私人配置。

`skill-doctor` 不会上传你的 skills。它只读取本地 skill/rule/instruction 文件，并在你的机器上输出诊断结果。

## 安全 demo 项目

```bash
git clone https://github.com/evilstar2016/skill-doctor.git
cd skill-doctor/examples/conflicted-agent-project
npx @evilstar2025/skill-doctor scan --scope project
npx @evilstar2025/skill-doctor conflicts --scope project
npx @evilstar2025/skill-doctor audit --scope project
npx @evilstar2025/skill-doctor cost --scope project
```

这个 demo 使用脱敏测试夹具，模拟 GitHub Copilot instructions 重叠和可疑导出措辞。

预期输出见：[Safe demo output](docs/demo-output.md)。

如果你正在比较手工审查、grep、内部 lint 和自动扫描的取舍，见：[skill-doctor vs manual AI agent config audits](docs/comparisons/manual-agent-config-audit.md)。

## 反馈入口

如果你遇到误报、缺失的 Agent 路径，或者真实的 skill/rule 漂移案例，请把脱敏信息提交到：[Feedback wanted: real AI agent skill/rule drift cases](https://github.com/evilstar2016/skill-doctor/issues/4)。

轻量问题和示例可以放到：[GitHub Discussion #6](https://github.com/evilstar2016/skill-doctor/discussions/6)。

## 项目状态

- [Roadmap](ROADMAP.md)
- [Changelog](CHANGELOG.md)
- [Contributing](CONTRIBUTING.md)

## 能发现什么

- 同一个 skill 被安装到多个 global/project 路径
- 多个 skills 触发词或描述重叠，导致 Agent 抢任务或行为不稳定
- 可疑指令，例如 shell 执行、破坏性命令、凭据暴露、网络上传
- Claude skill 描述和 always-on instruction 文件带来的每轮上下文 token 成本
- Claude Code、Cursor、Copilot、Codex、Gemini CLI、Windsurf、Kiro、Trae、OpenCode、OpenClaw、Hermes 等生态之间的配置漂移

## 为什么需要它

AI Agent 的配置层正在快速膨胀：skills、rules、instructions、项目记忆、全局记忆、团队约定都会逐渐堆起来。

问题通常不是某个模型突然变差，而是两个配置在同一个任务上同时触发，或者某个旧文件里藏着没人再记得的高风险指令。

`skill-doctor` 的定位类似 `npm audit`，但审计对象是你本地已经安装或写下的 Agent skills 和 instructions。它不负责分发 skills，只负责帮你看清现有配置层的问题。

## 安装

```bash
npm install -g @evilstar2025/skill-doctor
```

也可以不安装，直接运行：

```bash
npx @evilstar2025/skill-doctor scan
```

要求 Node.js 20+。

## 常用命令

### `scan`

发现本地已安装的 skills，并输出健康概览。

```bash
skill-doctor scan
skill-doctor scan --scope project
skill-doctor scan --scope global
skill-doctor scan --report
skill-doctor scan --json
```

### `conflicts`

找出重复 skills 和触发词/描述重叠。

```bash
skill-doctor conflicts
skill-doctor conflicts --kind duplicate
skill-doctor conflicts --kind conflict
skill-doctor conflicts --fail-on high
skill-doctor conflicts --json
```

### `audit`

扫描可疑安全风险，例如凭据暴露、破坏性命令、shell 执行、网络上传。

```bash
skill-doctor audit
skill-doctor audit --severity high
skill-doctor audit --fail-on high
skill-doctor audit --report
skill-doctor audit --json
```

### `cost` / `context`

估算每轮对话都会付出的上下文 token 成本，并按预算给出等级。

```bash
skill-doctor cost
skill-doctor cost --platform codex
skill-doctor cost claudecode
skill-doctor cost --source skill
skill-doctor cost --source mcp
skill-doctor cost --platform codex --scope project
skill-doctor cost --platform codex --scope global
skill-doctor cost --platform codex --resource plugin --include-disabled
skill-doctor cost --platform codex --resource plugin --include-cache
skill-doctor cost --platform codex --codex-config ./codex-config.json
skill-doctor context disable --id codex:skill:/path/to/SKILL.md --platform codex
skill-doctor context disable --id codex:mcp:github:tool:search_repositories --platform codex
skill-doctor cost --tokenizer approx       # 使用旧版 chars / 4 估算
skill-doctor cost --tokenizer openai --tokenizer-model gpt-4o
skill-doctor cost --budget-tokens 2000 --fail-on-budget
skill-doctor context --json
```

对 Claude Code skills，`cost` 估算始终注入的 name、description、trigger 元数据，而不是完整 skill 正文。对 `AGENTS.md` 这类 always-on 文件，它会估算本地文件内容。

`--source skill|mcp|all` 可以选择只统计 skills/rules/instruction/prompt files、只统计 MCP 工具列表，或两者都统计。Copilot 模式会覆盖 `.github/copilot-instructions.md`、`.github/instructions/**/*.instructions.md`、`.github/prompts/**/*.prompt.md`、Copilot skills、`AGENTS.md` 以及 `.vscode/mcp.json`/`.github/mcp.json` 中的 MCP。MCP 模式会先读取本地配置，再尝试访问每个 MCP server：HTTP 服务会通过配置 URL 调用，stdio 服务会按配置命令启动，并调用 `tools/list` 读取工具名称、说明和 schema 后估算 token。如果服务不可访问或无法启动，报告会保留一个 0 token 的 MCP 项，并在修复建议里提示失败原因。MCP 工具数量是一次 live preview，不保证下一次 Agent 会话看到的 runtime 工具完全一致。

Codex 模式使用独立配置驱动。内置默认值在 `src/platforms/codex-config.json`，覆盖当前 Codex 的 `AGENTS.md`、skills、plugins、MCP 配置和 memories 位置。高级用户可以用 `~/.skill-doctor/codex-config.json` 追加或覆盖路径，也可以临时传 `--codex-config <path>`。数组按 `id` 合并：同 id 覆盖内置项，新 id 追加，`enabled: false` 禁用该扫描源。

Codex 可用 `--resource all|agents|skill|mcp|plugin|memory` 过滤资源：

```bash
skill-doctor cost --platform codex --scope project      # 预览项目启动上下文
skill-doctor cost --platform codex --scope global       # 预览用户空间启动上下文
skill-doctor cost --platform codex --resource agents
skill-doctor cost --platform codex --resource skill
skill-doctor cost --platform codex --resource mcp
skill-doctor cost --platform codex --resource plugin
skill-doctor cost --platform codex --resource memory
skill-doctor cost --platform codex --include-disabled   # 单独显示已禁用资源的成本
skill-doctor cost --platform codex --resource plugin --include-cache  # 盘点缓存 UI 条目，不增加 token 成本
```

不传 `--scope` 时，`cost` 使用 `all` 范围：当前项目资源加上已启用的用户/全局资源。例如，`~/.codex/plugins/` 下 plugin 的已启用 skill 会以 `scope: global` 出现，因为它会影响所有 Codex 项目；`[[skills.config]]` 选择器仍可单独禁用 plugin skill。使用 `--scope project` 可只查看当前项目配置的文件。

Codex 报告中的 `Estimated token tax` 只计算当前启用的上下文。加上 `--include-disabled` 后，已禁用资源会出现在明细里，并汇总到 `Disabled token tax (not counted)`，但不会增加当前启用的总成本。

`--include-cache` 会单独盘点 `~/.codex/plugins/cache` 中插件和 Skill 的 UI 元数据，包括显示名称、描述、图标路径、缓存来源，以及允许隐式调用还是仅显式调用。缓存目录条目统一标记为 `cached` 和 `not counted`；仅仅能在 Codex 界面里看到某个入口，不会被当成它已经进入模型上下文的证据。该选项用于 Codex 的 `--resource all|plugin`，JSON 输出会把结构化盘点放在 `catalog` 字段中。

Codex 控制能力：

| 资源 | 成本预览 | 自动启用/禁用 | 写入位置 |
|------|----------|---------------|----------|
| Skills | 启动时的 skill 元数据和 activation-risk 文本 | 支持 | `[[skills.config]]` 的 `path` 和 `enabled` |
| MCP servers | server 配置，以及可访问时的 live `tools/list` | 支持 | `[mcp_servers.<name>] enabled` |
| MCP tools | 可控 MCP server 下的单个 live tool | 支持 | `[mcp_servers.<name>]` 的 `enabled_tools` / `disabled_tools` |
| Plugins | plugin 提供的 skills 和 MCP tools | 支持，按 plugin 级别控制 | `[plugins."<id>"] enabled` |
| `AGENTS.md` 文件 | 项目和用户空间 always-on 指导文件 | 不支持 | 标记为 `unsupported`；需要手动编辑或移动文件 |
| Memories | memory 存在状态，以及可近似读取时的文本 | 不支持 | 标记为 `memory-context-unknown`；需要手动改 Codex memory 设置/配置 |

`context enable|disable` 只写入配置中的项目级 Codex 控制文件，通常是 `.codex/config.toml`；它不会编辑全局 `~/.codex/config.toml`、plugin manifest、skill 文件、`AGENTS.md` 或 memory 存储。支持自动切换的资源会返回 `requiresNewSession: true`；需要新建 Codex session 或重启 Codex 后，runtime context 才会体现变化。

估算限制：

- token 估算默认使用 OpenAI tokenizer（`--tokenizer openai --tokenizer-model gpt-4o`），报告会显示 tokenizer 元数据。需要旧版 `chars / 4` 估算时使用 `--tokenizer approx`。非 OpenAI agent 的数字仍是预算估算，不代表对应平台的官方计费。
- live MCP 检查依赖当前 server 可访问，并且 `tools/list` 返回的工具与之后 Codex runtime 看到的一致。
- runtime dynamic context 仍可能在启动后增加或减少 instructions、tool schemas、memories 或 plugin 内容。
- Memories 可能显示为 `memory-context-unknown`，因为 Codex memory storage 会影响未来会话，但不一定暴露可确定的注入文本给 preview。

### `dashboard`

生成 HTML 仪表盘，方便审查扫描结果。

```bash
skill-doctor dashboard
skill-doctor dashboard --report ./skill-doctor-report.html
```

## 安全边界

- 默认只读取本地文件
- 不默认上传你的 skills、rules 或 instructions
- 适合先在 demo 项目里试，再决定是否扫描真实项目
- 如果要分享反馈，请先脱敏路径、密钥、客户名、内部 URL 和私有代码

## License

MIT
