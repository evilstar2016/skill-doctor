# Skill Doctor MVP

## Problem Statement

How might we help developers who have installed Agent Skills across multiple platforms (Claude Code, Cursor, Copilot) discover what they have and find behavioral conflicts—before those conflicts silently break their Agent's behavior?

## Recommended Direction

本地 CLI 工具，先做两件事：**发现**（你装了什么）+ **冲突检测**（谁和谁在抢同一类任务）。

不上云、不需要账号、不联网——这是和 ClawHub、Agensi 等平台型竞品的根本差异。平台做分发，Skill Doctor 做本地诊断。用户越信任 Agent，越需要一个独立的诊断工具，就像有了 npm 才需要 `npm audit`。

冲突检测 v0.1 用文本相似度（Jaccard / TF-IDF），不调 embedding API，保证离线可用、结果可解释。用户能看到"这两个 Skill 在 description 和 triggers 上有 73% 的词汇重叠，这就是你的 Agent 行为不稳定的原因"——比一个黑盒 AI 评分更可信。

## Key Assumptions to Validate

- [ ] 用户平均装了 8+ 个 Skill，冲突概率足够高才有感知 — 方法：发布后收集 scan 统计数据
- [ ] 文本相似度冲突检测的误报率可接受（<20%）— 方法：用自己的 Skill 集合先跑一遍
- [ ] 开发者愿意安装一个 CLI 工具来诊断 Skill，而不是手动检查 — 方法：看 npm 下载量和 GitHub star 增长速度

## MVP Scope

**v0.1 包含：**
- `skill-doctor scan` — 扫描 5 个标准路径（见下），输出 Skill 清单 + 冲突摘要
- `skill-doctor show <name>` — 展示单个 Skill 的触发词、描述、来源路径
- `skill-doctor conflicts` — 输出所有冲突对，显示重叠词汇和 severity
- `npx skill-doctor` 零安装运行
- 彩色 CLI 输出，无需 Dashboard

**扫描路径覆盖：**
```
~/.claude/skills/           # Claude Code 全局
~/.cursor/rules/            # Cursor 全局
~/.github/copilot/          # Copilot 全局
<cwd>/.claude/skills/       # 项目级 Claude Code
<cwd>/.cursor/rules/        # 项目级 Cursor
```

## Not Doing (and Why)

- **安全扫描（AST 分析）** — 需要 3-5 天，且需要建立规则库，v0.2 做
- **Web Dashboard** — 1 周内无法做到体验好，v0.3 做
- **语义向量冲突检测** — 需要调 embedding API，破坏离线承诺，v0.2 可选
- **Skill 安装/卸载功能** — 这是包管理器的职责，不是诊断工具的职责
- **云端报告分享** — 隐私风险，暂不做
- **② Agent 行为溯源 / ③ skill-doctor why** — 记录为扩展路径，v0.2+ 考虑

## Open Questions

- Cursor `.cursor/rules/` 里的 `.mdc` 文件格式和 SKILL.md 差异有多大？需要分开解析器吗？
- `npx` 冷启动时间能否控制在 2 秒内？如果 Node.js 依赖太重需要换 Go 重写
- 冲突 severity 的分级标准：HIGH/MED/LOW 的阈值设多少（相似度 >70%/50%/30%？）
