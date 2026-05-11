# Skill 会消亡吗？—— 针对 Skill Doctor 商业计划的风险审查

> **问题**：Skill 现在非常火，但半年或一年后有没有可能 Skill 就不被需要了？  
> **方法**：横扫 HackerNews、GitHub、海外开发者社区，寻找真实讨论信号  
> **日期**：2026-05-11  
> **报告对象**：Skill Doctor 商业计划（[cn-dev-radar-skill-doctor-商业计划-2026-05-10.md](cn-dev-radar-skill-doctor-商业计划-2026-05-10.md)）

---

## TL;DR（结论先行）

**Skill 不会消亡，但会分化。真正的风险不是 Skill 消亡，而是平台原生化把"发现和安装"做掉，留给你的是"管理和诊断"这个更大的市场。Skill Doctor 的定位恰好落在这个位置。**

---

## 一、本次信号来源

| 来源 | 检索关键词 | 有效信号数 |
|------|-----------|----------|
| HackerNews Algolia API | `SKILL.md claude code future` / `claude code hooks CLAUDE.md memory` / `MCP tools replace agent skills` | 7 条 |
| HackerNews Algolia API | `prompt engineering dead models smarter` | 1 条 |
| GitHub Trending（中文仓库，本周） | Agent / Memory / Claude Code 方向 | 观察方向 |
| Agensi.io HN Show HN 原文 | 同类竞品创始人第一手表述 | 1 条核心信号 |

---

## 二、"Skill 会消亡"的四个论点 + 反驳

### ❶ 论点：模型越来越聪明，不再需要 Skill 注入上下文

**支撑信号**：
多个 HN 开发者反映，用 Claude Sonnet 4.x 时 CLAUDE.md 的指令遵守率比以前更好。

**反驳信号**（更强）：

> *"The hard lesson: markdown instructions don't work. AI needs enforcement."*  
> — meloncafe，Ask HN，2025-11-10（在 Claude Code 上花费 $2k 后的感悟）

具体问题清单（真实用户，非假设）：
- **Post-compact amnesia**：context 被压缩后，Claude 系统性地忽略 CLAUDE.md
- **Session memory loss**：每个 session 像新员工入职，不记得上次说的话
- **Guidelines = suggestions**：指令遵守是"感觉对了就跟，不对就算了"
- **TODO epidemic**："我实现了！"（旁白：只是写了个 TODO）

另一位 Onyx AI 创始人（YC W24，Nov 2025）分享内部测试数据：

> *"LLMs really struggle to remember both system prompts and previous user messages in long conversations. Even simple instructions like 'ignore sources of type X' in the system prompt are very often ignored."*

**结论**：模型变聪明是真，但它解决的是"推理能力"不是"遵从约束"。指令执行可靠性是系统工程问题，不会自动被更大的参数量解决。

---

### ❷ 论点：Anthropic/Cursor/GitHub 会上线官方 Skill Store，第三方失去意义

**支撑信号（最强的风险信号）**：

这一点被 **Agensi 创始人**（同类产品，HN Show HN，2026-04-21）**亲口说出**：

> *"Moat. Anthropic, Cursor, and others could launch first-party skill stores whenever they want. My thesis is that a curated cross-agent marketplace is defensible because first-party stores are always vendor-locked. I would like to hear counterarguments."*

他在 HN 上主动发问，说明**这是一个已知的、已被创业者清醒认知的风险**，不是盲点。

**反驳框架**：

Agensi 的护城河逻辑是"跨平台"。Skill Doctor 的护城河更强——**不是卖 Skill，而是管理已有 Skill**：

| 能力 | Anthropic 官方 | Cursor 官方 | Skill Doctor |
|------|---------------|------------|-------------|
| 官方 Skill Store | 可能有 | 可能有 | 无（不竞争） |
| 跨平台 Skill 清单 | ❌ 只管自己的 | ❌ 只管自己的 | ✅ 全部平台 |
| 跨 Skill 冲突检测 | ❌ 不会做 | ❌ 不会做 | ✅ 核心功能 |
| 安全扫描（第三方 Skill） | 利益冲突 | 利益冲突 | ✅ 独立可信 |
| 健康仪表盘 | 不会做 | 不会做 | ✅ Pro 功能 |

关键逻辑：**你不可能指望 Anthropic 告诉你"你装的那个第三方 Skill 有安全风险"**——它不会这样做。这是平台商业逻辑决定的，不是技术问题。

另一个数据点：**Claude Code Manager（HN Show HN，2026-04-24，11分）**，这是一个独立开发者做的管理工具：

> *"I built this for myself but I figured why not share. The aim of CCM is to be able to fully manage all Claude Code configuration files, both globally and those in your project... Manages your CLAUDE.md, rules, hooks, agents, memories and so on."*

一个独立开发者用业余时间做的工具获得 11 分——说明用户需求真实，而且**目前市场上没有好的解决方案**。

---

### ❸ 论点：MCP 将取代 Skill，成为主流扩展机制

**支撑信号**：
MCP（Model Context Protocol）生态在 2025-2026 年快速膨胀，成为多平台默认的工具调用协议。

**这不是威胁，这是加速器**：

MCP 和 Skill 是两个不同维度：
- **MCP** = 外部工具调用（给 Agent 装"手"——能操作什么）
- **Skill** = 内部行为约束（给 Agent 装"脑"——怎么思考和工作）

两者不互相替代。更关键的是：**MCP 生态的膨胀也会带来新的 MCP Server 管理问题**——这反而扩大了 Skill Doctor 可以覆盖的范围（未来版本可以扫描 MCP 配置安全风险）。

Agensi 创始人已经注意到这个融合：他们提供了 MCP 订阅入口，让 Agent 能在 task 过程中动态拉取 Skill——**Skill 和 MCP 在合并，不是在竞争**。

---

### ❹ 论点：用户安装完 Skill 就忘了，管理需求不存在

**这是最弱的论点**，反而是 Skill Doctor 最大的机会：

HN 上一个开发者 blas0（Dec 2025）分享了一个有意思的"往复路径"：

> 最开始：装了 10k 行向量数据库 + 知识图谱的 memory 系统  
> 发现：慢、复杂、难维护  
> 结论：**"threw it all out. started over. two bash scripts + CLAUDE.md files + claude code hooks. 1,500 lines total."**

这个故事说明：开发者是会陷入"过度工程"然后简化回来的。Skill Doctor 扫描报告的价值，就在于让用户**在简化之前先看清楚自己装了什么**——这是一个在任何成熟度阶段都有用的工具，无论用户是重度用户还是轻度用户。

---

## 三、真正需要警惕的风险（被低估的）

以下风险在原版商业计划书中**未被充分讨论**：

### 🔴 风险 1：技术锁定风险（SKILL.md 格式可能变化）

Anthropic 可能随时改变 SKILL.md / CLAUDE.md 的格式规范，导致 Skill Doctor 的解析器需要跟进。这类基础设施变化成本高，且没有提前通知。

**应对**：在 v0.1 就建立 Skill 格式适配层，隔离解析器与检测逻辑。

### 🔴 风险 2：用户不知道自己有问题（认知触达难）

最大的获客难题：**用户不知道自己装的 Skill 有冲突**，所以不会主动找解决方案。这是"潜伏病"——症状是"Agent 行为不稳定"，但没有人会把它归因到 Skill 冲突。

需要一个"引爆认知"的内容策略（ClawHub 投毒数据 + 示例冲突案例），而不只是等用户自己发现。

### 🟡 风险 3：Anthropic 内置基础扫描（功能蚕食）

Anthropic 可能在 Claude Code 内置一个**基础的** Skill 健康检查（比如重复 Skill 检测），蚕食免费版功能空间。

**应对**：这不会做深度冲突分析和跨平台管理，可以接受。

### 🟡 风险 4：市场窗口可能只有 18 个月

Skill 生态是 Anthropic 在 2025 年初推出的，Claude Code / Skills 体系现在还很早期。从 npm 的历史来看，`npm audit` 是在 npm 成立**5 年后**才出现的（生态成熟需要时间）。

Skill Doctor 的赌注是"Skill 生态会在 2026-2027 年快速成熟"。如果成熟速度慢（用户装 Skill 少），早期市场规模会比预测小。

---

## 四、各平台信号汇总

### Anthropic（Claude Code）
- **动作**：Hooks 系统（SessionStart / PostToolUse / Stop）、CLAUDE.md、Auto Memory、Sub-agents
- **方向**：在强化"行为约束"层，但没有做"冲突检测"或"跨 Skill 分析"
- **结论**：在做基础设施，不在做管理工具

### GitHub Copilot
- **动作**：`.github/copilot-instructions.md`、GitHub Copilot Workspace、agent customization（VS Code 1.98+）
- **方向**：在做仓库级指令注入，不在做 Skill 市场或冲突检测
- **结论**：不构成直接竞争

### Cursor
- **动作**：`.cursor/rules`、多个 mdc 规则文件
- **挑战**：HN 开发者 adam_gyroscope 直接反馈："Cursor generally respects this, **but other tools struggle to consistently read or follow these rules no matter how many agent.md-style files we add.**"
- **结论**：平台自己都没解决合规问题，更不会做管理层工具

### 第三方生态（同类竞品）
- **Agensi.io**（2026-04）：Skill 发现/分发市场，200+ Skills，7k DAU，MRR < $200，Pre-seed 阶段
- **ClawHub**：57k+ Skills，有安全问题但无管理工具
- **Claude Code Manager**（2026-04）：个人开发者工具，11 HN分，功能基础

**Skill Doctor 的差异化空间**：市场上有分发（ClawHub/Agensi），有简单管理（CCM），但**没有诊断 + 冲突检测 + 安全扫描 + 可视化一体**的工具。这个空位是真实的。

---

## 五、给商业计划的建议补充

### 建议 1：明确区分"分发层"和"管理层"的竞争逻辑

商业计划书目前把 Skill Doctor 的护城河讲成了"没人做过"，但更强的论点是：

**Skill 发现/分发终将平台化（Anthropic 会做），但 Skill 管理/诊断只能第三方做**——因为平台有利益冲突（不会告诉你它卖给你的 Skill 有问题）。

### 建议 2：增加"格式变化"风险应对策略

SKILL.md 格式是 Anthropic 的私有格式，随时可能变化。建议：
- 在 README 明确声明支持的格式版本
- 建立格式适配层，将解析逻辑与业务逻辑解耦
- 监控 Anthropic/Cursor/Copilot changelog，快速跟进

### 建议 3：GTM 上增加"ClawHub 安全事件"内容策略

ClawHub 1.78% 投毒率 + Snyk 36.82% 安全缺陷率这两个数字是极好的 GTM 素材。应该：
1. 制作"我扫了自己的 Skills，发现了这个"的博客/Twitter 内容
2. 找几个有安全问题的公开 Skill 做案例拆解
3. 这类内容自带传播动力（恐惧感）

### 建议 4：缩短 v0.1 到 v0.2 的时间窗口

商业计划中冲突检测是 v0.2（暗示 v0.1 上线后还有一段时间才到核心功能），但**冲突检测才是"惊讶感"的核心来源**，是驱动付费的关键。建议 v0.1 就包含简版冲突检测（即使只是 keyword overlap）。

---

## 六、最终结论

```
问题：Skill 半年或一年后会消亡吗？

答案：不会消亡。但会分化：
  - 分发层（上架/发现）→ 平台原生化（高风险）
  - 管理层（冲突/安全/可视化）→ 第三方机会（低风险，你的位置）

真实风险不是消亡，而是：
  1. 格式变化导致技术债
  2. 用户认知触达慢（没人知道自己有问题）
  3. 市场成熟慢（窗口期变短）

Skill Doctor 的定位，恰好踩在"平台做不来、用户最需要"的位置上。
这个需求不会因模型变聪明而消失——越是功能强大的 Agent，行为越难预测，管理工具越有价值。
```

---

*报告生成时间：2026-05-11*  
*信号来源：HackerNews Algolia API、GitHub Trending、Agensi HN Show HN、Claude Code 社区讨论*  
*相关计划书：[cn-dev-radar-skill-doctor-商业计划-2026-05-10.md](cn-dev-radar-skill-doctor-商业计划-2026-05-10.md)*
