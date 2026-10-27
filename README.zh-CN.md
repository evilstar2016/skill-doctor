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

按功能浏览[使用手册目录](docs/manuals/README.zh-CN.md)。

| 需求 | 文档 |
|------|------|
| 第一次做项目体检：操作步骤、真实截图与结果解读 | [项目体检使用手册](docs/manuals/health-check.zh-CN.md) |
| 查找资源、追溯来源、核对共享关系与关联问题 | [资源清单使用手册](docs/manuals/resources.zh-CN.md) |
| 核对重复副本、诊断触发冲突与验证处理结果 | [重复与冲突诊断手册](docs/manuals/conflicts.zh-CN.md) |
| 理解上下文估算、定位高成本资源与调整预算 | [上下文成本与预算手册](docs/manuals/context-budget.zh-CN.md) |
| 理解安全等级、定位可疑指令与进行人工复核 | [安全审计手册](docs/manuals/security-audit.zh-CN.md) |
| Codex 上下文优化、确认与新会话验证 | [优化流程](docs/manuals/codex-optimization.zh-CN.md#optimization-workflow) · [历史收益预估](docs/manuals/codex-optimization.zh-CN.md#history-estimate) |
| 技能导入与纳管 | [导入新技能](docs/manuals/skill-library.zh-CN.md#import) · [纳管现有技能](docs/manuals/skill-library.zh-CN.md#take-over) · [同名冲突](docs/manuals/skill-library.zh-CN.md#name-conflicts) |
| 技能部署与卸载 | [部署方式与目标冲突](docs/manuals/skill-library.zh-CN.md#deploy) · [卸载与删除的区别](docs/manuals/skill-library.zh-CN.md#uninstall) |
| 技能同步与批量操作 | [安装状态](docs/manuals/skill-library.zh-CN.md#installation-status) · [同步](docs/manuals/skill-library.zh-CN.md#sync) · [批量操作](docs/manuals/skill-library.zh-CN.md#batch-operations) |
| 命令、参数、配置与 CI | [命令参考](docs/README.zh-CN.md) |
| 带终端和界面截图的操作讲解 | [中文交互式手册](https://evilstar2016.github.io/skill-doctor/zh-CN/pages/manual.html) |
| 平台路径与测试成熟度 | [平台支持说明](docs/platform-support.zh-CN.md) |
| 样例输出 | [安全 demo 结果](DEMO_OUTPUT.md) |
| 与手动审计对比 | [方案对比](COMPARISON.md) |
| 参与贡献或添加平台 | [贡献指南](CONTRIBUTING.md) · [平台适配器指南](ADDING_PLATFORM.md) |
| 项目进度与安全 | [Roadmap](ROADMAP.md) · [Changelog](CHANGELOG.md) · [安全策略](SECURITY.md) |

反馈误报、缺失平台或真实配置漂移案例时，可前往 [GitHub Discussions](https://github.com/evilstar2016/skill-doctor/discussions/6) 或[反馈 issue](https://github.com/evilstar2016/skill-doctor/issues/4)，请先脱敏。

## License

MIT — 见 [LICENSE](LICENSE)。

## 可选安全设计与代码审计组件

“问题”页提供默认关闭、按项目启用的 Cloudflare security-audit 组件。选择设计评审或代码审计，填写范围与代码版本，生成任务后复制到已有编码 Agent 执行，再导入 `security-report.json`。skill-doctor 不启动 Agent、不管理其凭据、不上传源码；运行前请在外部 Agent 检查模型数据共享、工具权限与隔离环境。

CLI 对应命令为 `security-component enable|disable|status`、`security-component prepare --mode design|code --scope <范围> --revision <版本> [--design-report <设计报告ID>]` 和 `security-component import --file <路径>`。

组件固定上游版本并保留 MIT 许可证。设计报告单独记录信任边界、威胁、假设和稳定的安全要求 ID；代码报告使用上游发现格式与校验器。关联设计报告时必须逐条提供验证状态与证据，“有问题”必须关联已确认发现。导入只校验格式，不代表 skill-doctor 独立确认漏洞，目标版本由外部报告声明。

报告最大 1 MiB，保存在用户目录 `.skill-doctor/security-component/`，按项目路径隔离。重复导入不产生副本，关闭组件保留报告，现有扫描不受影响。安全设计评审属于 skill-doctor 的适配功能。
