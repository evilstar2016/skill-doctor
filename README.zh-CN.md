# skill-doctor

[English](README.md) | [中文](README.zh-CN.md)

[![npm version](https://img.shields.io/npm/v/%40evilstar2025%2Fskill-doctor.svg)](https://www.npmjs.com/package/@evilstar2025/skill-doctor)
[![Node.js](https://img.shields.io/badge/node-%3E%3D20-339933.svg)](https://nodejs.org/)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](#license)

`skill-doctor` 是一个本地 CLI，用来诊断 AI Agent 的 skills、rules、instructions：重复安装、触发冲突、安全风险、上下文成本和多工具漂移。

当 Claude Code、Cursor、Copilot、Codex、Gemini CLI、Windsurf 等工具因为配置重叠而表现不一致时，可以先用它做一次本地体检。

![skill-doctor terminal demo](assets/terminal-demo.svg)

## 30 秒试用

当前版本：npm 上的 [`v0.3.4`](https://github.com/evilstar2016/skill-doctor/releases/tag/v0.3.4)。

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
skill-doctor cost --budget-tokens 2000 --fail-on-budget
skill-doctor context --json
```

对 Claude Code skills，`cost` 估算始终注入的 name、description、trigger 元数据，而不是完整 skill 正文。对 `AGENTS.md` 这类 always-on 文件，它会估算本地文件内容。

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
