# skill-doctor

[English](README.md) | [中文](README.zh-CN.md)

<p align="center">
  <img src="assets/brand/skill-doctor-logo.svg" alt="Skill Doctor" width="320">
</p>

[![npm 版本](https://img.shields.io/npm/v/%40evilstar2025%2Fskill-doctor.svg)](https://www.npmjs.com/package/@evilstar2025/skill-doctor)
[![Node.js](https://img.shields.io/badge/node-%3E%3D20-339933.svg)](https://nodejs.org/)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](#license)

**本地 AI Agent 配置体检工具。** 跨平台发现重复 Skill、触发重叠、可疑指令，以及持续占用上下文的配置。

随着项目和平台增多，Skills、Rules、Instructions 容易重复或互相干扰。`skill-doctor` 帮你看清当前安装了什么、哪些配置可能抢任务、哪些内容值得做安全审查，以及每轮对话会加载多少上下文。

## 快速开始

需要 Node.js 20 或更高版本。无需安装即可先扫描：

```bash
npx @evilstar2025/skill-doctor scan
```

接着检查当前项目，或打开本地界面：

```bash
npx @evilstar2025/skill-doctor check --scope project --fail-on high
npx @evilstar2025/skill-doctor ui
```

想先看已知样例，可运行[安全 demo 项目](examples/conflicted-agent-project/README.md)，并对照[预期结果](DEMO_OUTPUT.md)。

## 它能帮你做什么

- **盘点配置：** 查看多个平台上的 Skills 和相关 Agent 配置。
- **减少冲突：** 找出重复安装，以及描述或触发条件相互重叠的 Skills。
- **安全审查：** 标记可疑 shell、破坏性操作、凭据和网络指令，供人工复核。
- **估算上下文成本：** 估算 Skills、Rules、常驻文件和受支持 MCP 工具的 Token 占用。
- **接入自动化：** 生成报告，或用 `check` 在 CI 中设置健康门槛。

项目定位是诊断你本机已有的配置；默认不会分发或安装 Skills。

## 信任边界

- 默认本地检查不会上传扫描内容；可选的模型分析使用你配置的服务商。
- 安全审计提供静态线索，不能保证某个 Skill 一定安全或有风险。
- Token 数量是估算。
- 当前 13 个平台适配器的支持范围和测试证据各不相同，详见[平台路径、功能覆盖和已知限制](docs/platform-support.zh-CN.md)。

## 文档

| 需求 | 文档 |
|------|------|
| 命令、参数、配置与 CI | [命令参考](docs/README.zh-CN.md) |
| 带终端和界面截图的操作讲解 | [中文交互式手册](https://evilstar2016.github.io/skill-doctor/zh-CN/pages/manual.html) |
| 平台路径与测试成熟度 | [平台支持说明](docs/platform-support.zh-CN.md) |
| Codex 上下文优化与证据边界 | [Codex 优化指南](docs/codex-optimization.zh-CN.md) |
| 样例输出 | [安全 demo 结果](DEMO_OUTPUT.md) |
| 与手动审计对比 | [方案对比](COMPARISON.md) |
| 参与贡献或添加平台 | [贡献指南](CONTRIBUTING.md) · [平台适配器指南](ADDING_PLATFORM.md) |
| 项目进度与安全 | [Roadmap](ROADMAP.md) · [Changelog](CHANGELOG.md) · [安全策略](SECURITY.md) |

反馈误报、缺失平台或真实配置漂移案例时，可前往 [GitHub Discussions](https://github.com/evilstar2016/skill-doctor/discussions/6) 或[反馈 issue](https://github.com/evilstar2016/skill-doctor/issues/4)，请先脱敏。

## License

MIT — 见 [LICENSE](LICENSE)。
