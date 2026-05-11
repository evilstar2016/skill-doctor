# Skill Doctor — 商业计划书

> **产品定位**: 本地 Agent Skill 分析、可视化与冲突检测工具  
> **一句话**: 给你的 AI Agent 做一次全面体检  
> **日期**: 2026-05-10  
> **依据**: [cn-dev-radar-skill管理平台-2026-05-10.md](cn-dev-radar-skill管理平台-2026-05-10.md)

---

## 一、为什么做这个

### 1.1 市场时机

| 信号 | 数据 |
|------|------|
| ClawHub 已有 Skill 数量 | 57,580+ |
| ClawHub 投毒率 | 1.78%（1,025 个明确恶意） |
| Snyk 采样安全缺陷率 | 36.82%（CRITICAL 13.4%） |
| Agent Skills 支持平台数 | 7+（Claude Code, Cursor, Codex, Gemini CLI, Windsurf, OpenClaw, Hermes...） |
| GitHub 上 "agent skill marketplace" 仓库 | 599 个（都在做市场，没人做本地管理） |
| GitHub 上 "skill analyzer local viewer" 仓库 | **0 个** |

**核心洞察**：所有人都在做 Skill 的"上架和分发"，没有人关心用户**装完以后**的事。

这就像 npm 有 200 万个包、npm install 遍地都是，但如果没有 `npm ls`、`npm audit`、`npm dedupe` 和各种 dependency analyzer——开发者的 node_modules 就是黑洞。

Agent Skill 生态现在就处在这个阶段：**安装容易，管理无门**。

### 1.2 用户痛点画像

```
你是一个重度 AI Agent 用户。
你在 Claude Code 装了 15 个 Skill，Cursor 装了 8 个，OpenClaw 装了 20 个。
你还在不同项目的 .claude/skills/ 下放了各种项目级 Skill。

有一天你发现：
- Agent 回答某类问题时行为不稳定，有时走流程 A 有时走流程 B
- 你不确定到底装了哪些 Skill，也不记得哪些是全局的哪些是项目级的
- 有个 Skill 你 3 个月前装的，完全忘了它干什么
- 你怀疑两个 Skill 在"抢"同一类任务
- 你看了一篇 ClawHub 投毒的报道，开始担心自己装的 Skill 里有没有恶意的

你打开终端，不知道该怎么排查。
```

**这就是 Skill Doctor 要解决的问题。**

---

## 二、产品设计

### 2.1 核心功能矩阵

| 功能 | 用户价值 | 技术难度 | 付费门槛 | 版本 |
|------|---------|---------|---------|------|
| **全路径 Skill 发现** | 知道自己装了什么 | 低 | Free | v0.1 |
| **健康检查报告** | 一眼看出问题 | 低 | Free | v0.1 |
| **Skill 原理解析** | 理解每个 Skill 在干什么 | 中 | Free | v0.1 |
| **冲突检测** | 找到行为不稳定的根因 | 高 | Free 基础 / Pro 详情 | v0.2 |
| **安全扫描** | 发现恶意 Skill | 中高 | Free 基础 / Pro 详情 | v0.2 |
| **可视化 Dashboard** | 全局视图 | 中 | Pro | v0.3 |
| **一键修复建议** | 解决冲突和风险 | 高 | Pro | v0.3 |
| **团队 Skill 同步** | 统一团队配置 | 中 | Team | v0.4 |
| **Skill 推荐引擎** | 发现缺少的能力 | 高 | Pro | v0.5 |

### 2.2 CLI 交互设计

#### `skill-doctor scan`（免费，核心引流）

```
$ skill-doctor scan

🔍 Scanning skill directories...

  ~/.claude/skills/             → 12 skills found
  ~/.openclaw/skills/           → 8 skills found
  ~/projects/app/.claude/skills → 3 skills found
  ~/.cursor/skills/             → 5 skills found

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📊 SKILL DOCTOR REPORT
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  ✅ Total skills installed:      28
  ⚠️  Conflicts detected:         3 pairs
  🔴 Security risks:              2 skills
  ❌ Broken/incomplete:           1 skill
  📦 Duplicates across paths:     2 skills

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

⚠️  CONFLICTS (3 pairs)
┌──────────────────────┬──────────────────────┬──────────┐
│ Skill A              │ Skill B              │ Severity │
├──────────────────────┼──────────────────────┼──────────┤
│ git-workflow          │ github-automation    │ 🔴 HIGH  │
│ code-review           │ test-driven-dev      │ 🟡 MED   │
│ ppt-generator         │ slide-maker          │ 🟡 MED   │
└──────────────────────┴──────────────────────┴──────────┘

  → Run `skill-doctor conflicts` for details
  → Run `skill-doctor fix` to resolve (Pro)

🔴 SECURITY RISKS (2 skills)
┌──────────────────────┬─────────────────────────────────┐
│ Skill                │ Issue                           │
├──────────────────────┼─────────────────────────────────┤
│ data-exporter        │ Sends files to external URL     │
│ env-manager          │ Reads .env and SSH keys         │
└──────────────────────┴─────────────────────────────────┘

  → Run `skill-doctor audit` for full security report (Pro)

📄 Full report saved to: ./skill-doctor-report.html
   Share this link: https://skilldoctor.dev/r/a3f2...  ← 可分享
```

**关键设计决策**：
- 免费版展示**问题数量和概要**，制造紧迫感
- 详细原因和修复建议在 Pro 版解锁
- 自动生成 HTML 报告 + 可分享链接（传播引擎）

#### `skill-doctor show <skill-name>`（免费）

```
$ skill-doctor show git-workflow

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📖 SKILL: git-workflow
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  Name:        git-workflow
  Location:    ~/.claude/skills/git-workflow/
  Size:        3 files (12.4 KB)
  Agent:       Claude Code (global)

  📝 DESCRIPTION
  Enforces conventional commits, branch naming,
  and PR workflow with automated review checklist.

  🎯 TRIGGERS (what activates this skill)
  • "commit this code"
  • "create a PR"
  • "push to main"
  • Any git-related conversation

  ⚙️ WORKFLOW
  ┌─────────────┐    ┌──────────────┐    ┌────────────┐
  │ Detect git   │───▶│ Check branch │───▶│ Format     │
  │ operation    │    │ naming       │    │ commit msg │
  └─────────────┘    └──────────────┘    └────────────┘
                                               │
                                               ▼
                                        ┌────────────┐
                                        │ Run pre-   │
                                        │ commit hook│
                                        └────────────┘

  🔗 DEPENDENCIES
  • Requires: git CLI
  • Optional: gh CLI (for PR creation)
  • No API keys needed

  ⚠️ CONFLICTS WITH: github-automation (87% overlap)
     └─ Both handle PR creation with different strategies

  💡 USAGE EXAMPLES
  You: "帮我提交这段代码"
  You: "create a pull request for this feature"
  You: "review my recent commits"
```

#### `skill-doctor conflicts --detail`（Pro 功能）

```
$ skill-doctor conflicts --detail

⚠️  CONFLICT #1: git-workflow ↔ github-automation
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  Severity:     🔴 HIGH
  Overlap:      87% description similarity
  Impact:       Agent randomly picks between them for PR tasks

  📖 git-workflow says:
     "Always create feature branches from develop, squash commits"

  📖 github-automation says:
     "Create branches from main, preserve individual commits"

  🔍 WHY THIS IS A PROBLEM:
     When you say "create a PR", the agent sees both skills as
     relevant (87% similarity). It will non-deterministically
     activate one or the other, leading to inconsistent branch
     strategies across your project.

  🛠️ RECOMMENDED FIXES:
     Option A: Remove github-automation (less specific)
     Option B: Add exclusion scope — set github-automation
               to only trigger on "GitHub Actions" / "CI/CD"
     Option C: Merge both into a single unified git-skill
               [AUTO-GENERATE ▶]

  → Run `skill-doctor fix conflict-1 --option a` to apply
```

### 2.3 Web Dashboard（Pro/Team）

```
┌─────────────────────────────────────────────────────┐
│  🩺 Skill Doctor Dashboard              [Pro] [⚙️]  │
├─────────────────────────────────────────────────────┤
│                                                     │
│  ┌─── Skills Map ─────────────────────────────────┐ │
│  │                                                │ │
│  │    [Git & Code] ──⚠️── [GitHub & PR]           │ │
│  │         │                    │                  │ │
│  │    [Testing]            [Deployment]            │ │
│  │         │                                      │ │
│  │    [Code Review]   [Documentation]             │ │
│  │                                                │ │
│  │    [Design] ──⚠️── [PPT Maker]                 │ │
│  │                                                │ │
│  │    🔴 data-exporter    🔴 env-manager          │ │
│  └────────────────────────────────────────────────┘ │
│                                                     │
│  Score: 72/100  │  3 conflicts  │  2 risks          │
│                                                     │
│  [📊 Report]  [🔧 Fix All]  [📤 Export]  [🔄 Sync]  │
└─────────────────────────────────────────────────────┘
```

核心交互：
- **Skill 关系图**：节点是 Skill，边是功能关联，红色虚线是冲突
- **点击 Skill 节点** → 弹出原理卡片（Workflow 流程图 + 触发词 + 依赖）
- **点击冲突线** → 弹出冲突详情 + 一键修复
- **健康分数**（0-100）：综合冲突数、安全风险、完整度打分

---

## 三、商业模式与闭环

### 3.1 定价体系

| 层级 | 价格 | 功能 | 目标用户 |
|------|------|------|---------|
| **Free** | $0 | 扫描 + 清单 + 冲突概要 + 基础原理展示 | 所有 AI Agent 用户 |
| **Pro** | $12/月 或 $99/年 | 冲突详情 + 修复建议 + 安全深度扫描 + Web Dashboard + 分享报告 | 重度用户/独立开发者 |
| **Team** | $49/月 (5 seats) | 团队 Skill 库同步 + 合规报告 + Slack/飞书告警 + 管理员面板 | 开发团队 |
| **Enterprise** | 按需报价 | 私有部署 + SSO + 审计日志 + SLA + 自定义扫描规则 | 企业 |

### 3.2 增长飞轮

```
                    ┌──────────────────────┐
                    │  用户装了很多 Skill   │
                    │  (Agent 行为不稳定)   │
                    └──────────┬───────────┘
                               │
                               ▼
                    ┌──────────────────────┐
                    │  运行 skill-doctor    │
              ┌────▶│  scan（免费）         │
              │     └──────────┬───────────┘
              │                │
              │                ▼
              │     ┌──────────────────────┐
              │     │  看到：3 个冲突！     │
              │     │  2 个安全风险！       │◄─── 惊讶感 = 传播动力
              │     └──────────┬───────────┘
              │                │
              │       ┌────────┴────────┐
              │       ▼                 ▼
              │  ┌──────────┐   ┌──────────────┐
              │  │ 截图分享  │   │ 想修复 →     │
              │  │ X/朋友圈  │   │ 升级 Pro     │
              │  └────┬─────┘   └──────┬───────┘
              │       │                │
              │       ▼                ▼
              │  ┌──────────┐   ┌──────────────┐
              │  │ 别人看到  │   │ 获得修复建议  │
              │  │ "我也试试"│   │ 问题解决！    │
              │  └────┬─────┘   └──────┬───────┘
              │       │                │
              └───────┘                ▼
                              ┌──────────────────┐
                              │ 继续安装新 Skill   │
                              │ 定期重新 scan      │
                              └──────────────────┘
```

**飞轮的关键齿轮**：

1. **惊讶感驱动传播**："你装的 Skill 里有 2 个安全风险"——这句话天然引发截图分享
2. **焦虑驱动付费**：看到冲突和风险，不修复不放心——转化率极高
3. **习惯驱动留存**：每次安装新 Skill 都会习惯性 `skill-doctor scan`
4. **报告驱动裂变**：可分享的 HTML 报告自带品牌水印和 CTA

### 3.3 收入模型推算

| 阶段 | 时间 | 免费用户 | 付费用户 | 转化率 | MRR |
|------|------|---------|---------|--------|-----|
| **种子期** | 0-3 月 | 3,000 | 60 | 2% | $720 |
| **增长期** | 3-6 月 | 15,000 | 450 | 3% | $5,400 |
| **加速期** | 6-12 月 | 50,000 | 2,000 | 4% | $24,000 |
| **成熟期** | 12-18 月 | 150,000 | 7,500 | 5% | $90,000 |

假设条件：
- Agent Skill 用户在 2026 年预计达到 200-500 万（保守估计）
- 工具类产品典型免费→付费转化率 2-5%
- 均价以 Pro $12/月计算

### 3.4 成本结构

| 项目 | 月成本 | 说明 |
|------|--------|------|
| 服务器（报告托管+API） | $200-500 | 初期极低，报告用 Cloudflare Pages |
| 向量数据库（冲突检测） | $50-200 | embedding 计算用本地模型也可零成本 |
| 域名+邮件+SaaS 工具 | $100 | 基础运营 |
| 人力（1-2 人） | 看情况 | 如果副业模式，初期零成本 |
| **合计（初期）** | **$350-800/月** | Pro 30 个付费用户即回本 |

---

## 四、技术架构

### 4.1 技术选型

```
┌─────────────────────────────────────────────┐
│               skill-doctor                   │
├────────────┬──────────────┬─────────────────┤
│   CLI      │  Web UI      │  API Service    │
│  (Rust/Go) │ (Next.js)    │  (Hono/Bun)     │
├────────────┴──────────────┴─────────────────┤
│                Core Engine                   │
│  ┌──────────┐  ┌──────────┐  ┌───────────┐ │
│  │ Scanner  │  │ Analyzer │  │ Conflict  │ │
│  │ (FS walk)│  │ (Parser) │  │ Detector  │ │
│  └──────────┘  └──────────┘  └───────────┘ │
│  ┌──────────┐  ┌──────────┐  ┌───────────┐ │
│  │ Security │  │ Visualiz │  │ Report    │ │
│  │ (AST+AI) │  │ (Mermaid)│  │ (HTML gen)│ │
│  └──────────┘  └──────────┘  └───────────┘ │
└─────────────────────────────────────────────┘
```

| 模块 | 技术 | 原因 |
|------|------|------|
| **CLI** | Rust 或 Go | 单二进制分发、跨平台、极快 |
| **SKILL.md 解析器** | 自研 Markdown AST + YAML frontmatter | 提取 name/description/triggers/workflow |
| **冲突检测 — 语义层** | 本地 embedding（all-MiniLM-L6-v2 or BGE-small-zh）+ cosine similarity | 不依赖外部 API，隐私安全 |
| **冲突检测 — 关键词层** | TF-IDF + trigger 提取 | 轻量、离线可用 |
| **安全扫描** | 正则 + AST（检测 curl/wget/rm -rf/env 读取） | 覆盖 90% 常见恶意模式 |
| **可视化** | Mermaid.js（CLI 输出 ASCII / HTML 输出 SVG） | 生态成熟、渲染稳定 |
| **报告生成** | 内嵌 HTML 模板 + Tailwind | 自包含 HTML，打开即看 |
| **Web Dashboard** | Next.js + shadcn/ui | 快速开发、美观 |

### 4.2 冲突检测算法

```python
# 伪代码
def detect_conflicts(skills: list[Skill]) -> list[Conflict]:
    conflicts = []

    for i, a in enumerate(skills):
        for b in skills[i+1:]:

            # Layer 1: Description 语义相似度
            sim = cosine_similarity(embed(a.description), embed(b.description))
            if sim > 0.85:
                conflicts.append(Conflict(a, b, "semantic_overlap", sim))

            # Layer 2: Trigger 关键词碰撞
            a_triggers = extract_triggers(a)
            b_triggers = extract_triggers(b)
            overlap = a_triggers & b_triggers
            if len(overlap) / min(len(a_triggers), len(b_triggers)) > 0.5:
                conflicts.append(Conflict(a, b, "trigger_collision", overlap))

            # Layer 3: 指令矛盾检测
            a_rules = extract_rules(a)  # "always do X", "never do Y"
            b_rules = extract_rules(b)
            for ra in a_rules:
                for rb in b_rules:
                    if is_contradictory(ra, rb):  # NLP 矛盾检测
                        conflicts.append(Conflict(a, b, "instruction_conflict", (ra, rb)))

            # Layer 4: 资源竞争
            a_files = extract_file_targets(a)
            b_files = extract_file_targets(b)
            shared = a_files & b_files
            if shared:
                conflicts.append(Conflict(a, b, "resource_competition", shared))

    return dedupe_and_rank(conflicts)
```

### 4.3 安全扫描规则

| 规则 ID | 检测模式 | 风险等级 | 说明 |
|---------|---------|---------|------|
| SEC-001 | `curl.*\|.*http` 外传 | 🔴 CRITICAL | 数据外泄 |
| SEC-002 | 读取 `.env` / `.ssh` / `credentials` | 🔴 CRITICAL | 凭证窃取 |
| SEC-003 | `rm -rf` / 批量删除 | 🔴 CRITICAL | 破坏性操作 |
| SEC-004 | 修改 `SOUL.md` / `MEMORY.md` | 🟠 HIGH | Agent 行为篡改 |
| SEC-005 | 动态下载+执行脚本 | 🟠 HIGH | 远程代码执行 |
| SEC-006 | 无 description 或 description 与实际行为不匹配 | 🟡 MEDIUM | 欺骗性 Skill |
| SEC-007 | 请求过高权限（sudo / root） | 🟡 MEDIUM | 权限提升 |
| SEC-008 | 混淆/编码的字符串 | 🟡 MEDIUM | 隐藏恶意意图 |

---

## 五、Go-to-Market 策略

### 5.1 阶段路线图

```
Phase 0: 种子 (Week 1-2)
├── CLI MVP：scan + show + conflicts 基础版
├── 开源（MIT），推 GitHub
└── 自己用 + 找 10 个内测用户

Phase 1: 引爆 (Week 3-6)
├── 写一篇"我扫了我电脑上 47 个 Skill，结果吓一跳"的文章
├── 投稿：V2EX / 掘金 / SegmentFault / X
├── 找 KOL 试用（@op7418 @shao__meng @dotey）
├── 制作可分享的 HTML 报告（自带品牌 + CTA）
└── 目标：3,000 GitHub stars + 3,000 CLI 安装

Phase 2: 付费 (Week 7-12)
├── 上线 Pro 版：冲突修复 + 安全深扫 + Web Dashboard
├── 定价 $12/月，LemonSqueezy 收款
├── 发布 VS Code 扩展版（按钮化操作）
├── 接入 Claude Code Plugin / OpenClaw Skill 形态
└── 目标：500 付费用户

Phase 3: 平台化 (Month 4-8)
├── Team 版：团队 Skill 同步 + 审批 + 合规
├── Skill 推荐引擎："你可能还需要这个 Skill"
├── 开放 API：让 Nacos / Smithery / Composio 对接
├── 中文 Skill 策展频道（积累社区）
└── 目标：MRR $20,000+

Phase 4: 生态卡位 (Month 8+)
├── Skill Doctor 成为新 Skill 的"必经之路"
│   └── "经过 Skill Doctor 认证" 徽章
├── Skill 创作者工具：创建前先检测冲突
├── 企业版：私有化部署 + 审计 + SSO
└── 目标：成为 Agent Skill 生态的基础设施
```

### 5.2 获客渠道矩阵

| 渠道 | 动作 | 成本 | 预期效果 | 优先级 |
|------|------|------|---------|--------|
| **GitHub 开源** | MIT 开源 CLI，README 做好截图 | $0 | 长期 SEO + 信任 | 🥇 |
| **技术文章** | "你的 Skill 可能在冲突"系列 | $0 | V2EX/掘金/SF 引爆 | 🥇 |
| **可分享报告** | HTML 报告自带 CTA | $0 | 口碑裂变 | 🥇 |
| **KOL 合作** | 给 @op7418 扫 Skill 出报告 | $0 | 借势传播 | 🥈 |
| **VS Code 扩展** | 发布到 Marketplace | $0 | 渠道触达 | 🥈 |
| **Claude Code Plugin** | 做成 Skill，无限套娃 | $0 | Agent 用户精准触达 | 🥈 |
| **X/Twitter 运营** | 定期发"本周 Skill 冲突排行榜" | $0 | 持续曝光 | 🥉 |
| **Product Hunt** | 全球首个 Skill 分析工具 | $0 | 海外用户一波 | 🥉 |

### 5.3 内容营销弹药库

| # | 标题 | 平台 | 目的 |
|---|------|------|------|
| 1 | "我扫了 47 个 Agent Skill，5 个在偷我的数据" | V2EX / X | 制造恐惧 → 安装 |
| 2 | "你的 Agent 为什么时灵时不灵？可能是 Skill 冲突" | 掘金 / SF | 教育用户 → 安装 |
| 3 | "Skill 数量 ≠ 能力，质量才是" | 公众号 | 品牌建设 |
| 4 | "从 0 到 1 做一个 Skill 分析工具的技术选型" | 掘金 | 开发者社区 |
| 5 | "@归藏 的 PPT Skill 和 @meng shao 的 infocard 冲突吗？" | X | KOL 互动引爆 |
| 6 | "Agent Skill 安全指南：安装前必做的 3 件事" | SF / 知乎 | SEO 长尾 |
| 7 | "Skill Doctor 月报：本月冲突率最高的 10 对 Skill" | 周刊 | 内容驱动留存 |

---

## 六、竞争壁垒 (Moat) 构建

### 6.1 壁垒分层

| 壁垒层 | 内容 | 建立时间 | 可复制难度 |
|--------|------|---------|-----------|
| **Layer 1: 先发** | 第一个本地 Skill 分析工具 | 即刻 | 🟢 低（但先发心智很重要） |
| **Layer 2: 数据** | 冲突规则库、安全指纹库（持续积累） | 3 月+ | 🟡 中 |
| **Layer 3: 社区** | 用户贡献的冲突报告、修复方案 | 6 月+ | 🟠 高 |
| **Layer 4: 集成** | 成为 Nacos / Smithery / ClawHub 的官方推荐工具 | 6-12 月 | 🔴 极高 |
| **Layer 5: 标准** | "Skill Doctor Score" 成为 Skill 质量的事实标准 | 12 月+ | 🔴 极高 |

### 6.2 核心护城河：冲突知识库

随着用户量增长，Skill Doctor 会积累一个独特的数据资产：

```
冲突知识库 (Conflict Knowledge Base)
├── 已知冲突对：3,000+ 对
│   └── 每对包含：两个 Skill 名、冲突类型、解决方案
├── 安全指纹库：500+ 恶意模式
│   └── 每个包含：检测正则、风险等级、真实案例
├── Skill 质量评分：10,000+ Skill
│   └── 每个包含：完整度、安全性、冲突率、用户评价
└── 修复模板：200+ 通用修复方案
    └── 每个包含：冲突类型 → 推荐操作 → 修改后的 SKILL.md
```

**这个知识库是竞争对手无法快速复制的。**

---

## 七、风险分析与对策

| 风险 | 概率 | 影响 | 对策 |
|------|------|------|------|
| **Agent 平台内建类似功能** | 🟡 中 | 🔴 致命 | 保持跨平台优势——Claude Code 只会做 Claude 的，Skill Doctor 做所有平台 |
| **Skill 生态不如预期增长** | 🟢 低 | 🟠 高 | Skill 已成为 Anthropic/Google/OpenAI 的共识标准，增长确定性高 |
| **用户认为免费版够用，不付费** | 🟡 中 | 🟡 中 | 免费版展示"你有问题"，付费版才告诉你"怎么修"——卡在最痛的地方 |
| **技术实现比预期难** | 🟡 中 | 🟡 中 | MVP 先做关键词层冲突检测（1 周可完成），语义层作为 v2 迭代 |
| **ClawHub/Nacos 做了本地工具** | 🟢 低 | 🟠 高 | 它们的基因是服务端 Registry，不是客户端分析工具——分工不同 |
| **安全扫描误报率高** | 🟡 中 | 🟡 中 | 初期保守规则+人工 review，逐步训练降低误报 |

---

## 八、团队与资源需求

### 最小启动配置（1 人副业模式）

| 角色 | 工作 | 时间 |
|------|------|------|
| **你（全栈）** | CLI 开发 + 算法 + 文章 + 运营 | 2 周 MVP |

### 理想配置（3 人全职模式，增长期后）

| 角色 | 职责 |
|------|------|
| 后端/CLI 工程师 | 核心引擎、冲突算法、安全扫描 |
| 前端工程师 | Web Dashboard、VS Code 扩展、报告模板 |
| DevRel / 运营 | 内容、社区、KOL 关系、Product Hunt |

---

## 九、关键里程碑

| 时间 | 里程碑 | 成功指标 |
|------|--------|---------|
| **Week 2** | CLI MVP 上线 GitHub | 可正常 scan + show + conflicts |
| **Week 4** | 第一篇引爆文章发布 | V2EX/SF 上热榜 |
| **Week 6** | 1,000 GitHub stars | 社区认可 |
| **Week 8** | Pro 版上线 | 第一笔收入 |
| **Month 3** | 5,000 stars + 100 付费 | 产品-市场匹配验证 |
| **Month 6** | VS Code 扩展 + API 开放 | 平台化起步 |
| **Month 9** | "Skill Doctor Score" 被引用 | 标准化启动 |
| **Month 12** | MRR $20,000+ 或被收购 | 商业化验证 |

---

## 十、退出路径

| 路径 | 条件 | 概率 | 估值参考 |
|------|------|------|---------|
| **独立增长** | MRR 持续增长、用户留存好 | 40% | ARR × 10-15 |
| **被 Anthropic 收购** | 成为 Skill 生态基础设施 | 20% | 战略价值 > 营收倍数 |
| **被 Nacos/阿里云 收购** | 补充其 Registry 的客户端能力 | 15% | 技术收购 $1-5M |
| **被 Smithery/Composio 收购** | 集成到其平台 | 15% | 用户+技术收购 |
| **转型/放弃** | 市场没有预期大 | 10% | 开源社区资产仍有价值 |

---

## 附录：第一周行动清单

- [ ] 注册域名 `skilldoctor.dev`
- [ ] 创建 GitHub 仓库 `skill-doctor`，MIT 协议
- [ ] 实现 Scanner 模块（遍历所有已知 Skill 路径）
- [ ] 实现 Parser 模块（解析 SKILL.md frontmatter + 工作流）
- [ ] 实现 Conflict Detector v1（关键词层：TF-IDF + trigger 碰撞）
- [ ] 实现 Security Scanner v1（正则规则匹配）
- [ ] 实现 Report Generator（终端输出 + HTML 报告）
- [ ] 写 README（大量截图、GIF 动图、使用示例）
- [ ] 自己的电脑跑一遍，截图作为宣传素材
- [ ] 写第一篇文章草稿

---

# 竞对分析

## PromptHub 是什么

**定位**：Skill 管理器 + 分发器（Electron 桌面 GUI）

| 核心能力 | 说明 |
|---------|------|
| 本地扫描 | 发现已有 SKILL.md，导入管理 |
| 技能商店 | 内置精选 + skills.sh 社区商店 |
| **一键分发** | 安装到 15+ 平台（Claude Code / Cursor / OpenClaw / Codex…） |
| Prompt 管理 | 分类 + 历史版本 + 模板变量 |

**它在做的事**：把 Skill 从 A 平台装到 B 平台，管理你的 Skill 库。

---

## 两者的本质差别

用 npm 类比一眼就清楚：

```
PromptHub  ≈  npm install + npm list
Skill Doctor ≈  npm audit + npm ls --depth + dependency-check
```

**PromptHub 完全没有的能力**：

| 功能 | PromptHub | Skill Doctor |
|------|-----------|-------------|
| **冲突检测** | ❌ 不存在 | ✅ 核心功能 |
| **语义重叠分析** | ❌ | ✅ embedding 相似度 |
| **安全扫描** | ❌ | ✅ 恶意模式检测 |
| **Skill 健康评分** | ❌ | ✅ |
| **工作流原理可视化** | ❌（只展示文件内容） | ✅ 生成流程图 |
| **修复建议** | ❌ | ✅ Pro 功能 |
| **行为不稳定根因分析** | ❌ | ✅ 这才是"为什么 Agent 时灵时不灵" |

**PromptHub 的切入角度是"管理和分发"，Skill Doctor 的切入角度是"诊断和修复"。** 用户最终两个都需要。

---

## 反而是整合机会

PromptHub 本身有一个痛点：它能帮你装 30 个 Skill，但装完以后如果冲突了它不管。

这意味着 Skill Doctor 可以成为 PromptHub 的**天然下游**：
- PromptHub 用户装完 Skill → 自动提示"用 skill-doctor scan 检查健康状况"
- 甚至双方直接集成：PromptHub 内嵌一个 `skill-doctor` 的 diagnose 按钮

**这不是竞争，是插件关系。**

---

## 要警惕的地方

PromptHub 的 Roadmap 有"**技能市场**"计划，未来如果它做了 Skill 推荐引擎，会和 Skill Doctor 的"推荐缺失能力"功能有些重叠。但"诊断 + 冲突 + 安全"这个方向它的基因不在这里（GUI 桌面工具 vs 分析引擎），短期内不会做。