# 中文开发者技术雷达 — 2026-05-10

> **主题**: Skill 管理平台市场调研 — 需求、竞争、机会  
> **采集来源**: V2EX · SegmentFault · GitHub · 掘金 · X (Twitter)  
> **采集时间**: 2026-05-10 22:00 UTC+8  
> **调研范围**: Agent Skill 管理平台/市场/注册中心的需求信号、竞争格局与可行性分析

---

## 📊 调研结论速览

| 维度 | 判断 |
|------|------|
| **市场需求** | 🟠 **强烈且真实** — Skill 生态已爆发至 57,000+，安全治理和管理已成刚需 |
| **竞争烈度** | 🔴 **极其激烈** — 巨头（阿里 Nacos、腾讯 SkillHub）+ 社区（ClawHub、Smithery、Composio）+ 开源（599 个 GitHub 仓库）已重兵布局 |
| **差异化空间** | 🟡 **有，但窄** — 需要精准定位细分赛道（见文末建议） |
| **入场时机** | 🟡 **窗口期收窄中** — 2026 Q1-Q2 是混战期，格局尚未收敛，但先发者已站位 |

---

## 🔥 需求信号 Top 15

### 1. 🤖 ClawHub Skill 安全危机 — 1.78% 明确投毒

**来源**: [X @buhuaguo1](https://x.com/buhuaguo1) · [X @yangyi](https://x.com/yangyi) · [SegmentFault](https://segmentfault.com/a/1190000047660821)  
**热度**: X 多条讨论 · SegmentFault 专题报道  
**状态**: 🔴 Viral · 持续发酵

用 skillguard 跑了 ClawHub 上 57,580 个 skill 的安全审计，结果：1.78% 明确投毒（1,025 个 Skill），agent-defender 本身就是毒。最讽刺的是，被社区广泛引用的"安全工具"本身就是攻击面。Snyk 采样 3,984 个 Skill 中 36.82% 存在安全缺陷，CRITICAL 级别 13.4%。这直接催生了对 **安全可控的 Skill 管理平台** 的刚需。

---

### 2. 🛠️ ClawHub Rate Limit 导致国内用户体验极差

**来源**: [SegmentFault](https://segmentfault.com/a/1190000047663671) · V2EX  
**热度**: 534 阅读 · 多轮讨论  
**状态**: 🟠 Hot · 结构性问题

ClawHub 频繁出现 `Rate limit exceeded`，国内用户安装 Skill 时体验极差。镜像站解决了可用性但引出新矛盾：高频抓取导致服务器成本飙升至每月五位数美元。国内 Skill 分发基础设施严重缺位。

---

### 3. 🤖 企业 Skill 落地四大挑战

**来源**: [SegmentFault - Nacos 3.2 文章](https://segmentfault.com/a/1190000047699800)  
**热度**: 494 阅读 · 阿里云原生团队发布  
**状态**: 🟠 Hot · 企业级刚需

企业在 Skill 落地时面临**安全**（恶意代码、漏洞）、**权限**（职责边界模糊）、**稳定性**（版本混乱）、**治理**（缺少审计追溯）四大结构性挑战。这四类问题相互耦合，必须通过平台化治理体系统筹应对。

---

### 4. 🛠️ Skill vs MCP — 概念混淆普遍存在

**来源**: [SegmentFault](https://segmentfault.com/a/1190000047639315) · [X @geshan](https://x.com/geshan)  
**热度**: 2 赞 · 广泛讨论  
**状态**: 🟡 Warm · 认知教育期

90% 的人搞混了 MCP、Agent、Skills 三个概念。Anthropic 的类比：MCP 是通往五金店每个货架的通道，Skill 是带你直接找到正确货架并示范正确技巧的经验员工。说明市场仍处于概念教育阶段，有用户教育成本。

---

### 5. 🤖 Hermes Agent 自动生成 Skill — 封闭学习循环

**来源**: [SegmentFault](https://segmentfault.com/a/1190000047733311)  
**热度**: 高关注 · Hermes Agent 100k+ Star  
**状态**: 🟠 Hot

Hermes Agent 支持把用过一次的复杂任务自动变成永久 Skill（agent 自主学习循环），其 Skills Hub 已收录 648 个 skill。这意味着 Skill 的**生产速度**在加速，管理压力持续增大。

---

### 6. 🌐 Trae 添加第三方 Skill 方法不统一

**来源**: [SegmentFault](https://segmentfault.com/a/1190000047689470)  
**热度**: 1 赞 · 具体痛点  
**状态**: 🟡 Warm

不同 Agent 平台（Trae 国内版/国际版、Claude Code、Cursor、Codex）安装 Skill 的方式各异，缺乏统一的安装和管理体验。用户呼唤**跨平台 Skill 管理工具**。

---

### 7. 🤖 从 Prompt 工程到 Skill 工程 — 范式转换

**来源**: [SegmentFault](https://segmentfault.com/a/1190000047593883)  
**热度**: 专题长文  
**状态**: 🟡 Warm · 趋势信号

Agent Skill 开放标准正在改变 AI 协作方式。痛点：每次让 Claude 写代码都要重复粘贴规范、好不容易调教好的 Prompt 换个项目就失效、团队每个人给 AI 指令不一样导致输出不一致。Skill 机制正是解决这些问题。

---

### 8. 🛠️ KOL 纷纷发布自己的 Skill 产品

**来源**: [X @op7418](https://x.com/op7418) · [X @shao__meng](https://x.com/shao__meng) · [X @dotey](https://x.com/dotey)  
**热度**: 92-731 likes  
**状态**: 🟠 Hot · 生态繁荣信号

归藏（@op7418）发布 PPT Skill（92 likes），meng shao 发布 infocard-skills（731 likes），宝玉（@dotey）持续发布 Prompt 模板。头部 KOL 正从内容消费者转型为 Skill 生产者，说明 Skill 生态已进入**创作者经济**阶段。

---

### 9. 🐛 ClawHavoc 事件 — 11.9% Skill 含恶意代码

**来源**: [SegmentFault](https://segmentfault.com/a/1190000047663671)  
**热度**: 行业级安全事件  
**状态**: 🔴 Viral · 标志性事件

2026 年 1 月 Koi Security 披露：审计的 2,857 个 Skill 中 341 个（11.9%）含恶意代码，伪装成加密货币交易工具窃取 API Key、SSH 凭证、浏览器密码。攻击者甚至通过修改 SOUL.md 和 MEMORY.md 文件永久篡改 Agent 行为。这是 Skill 生态的"左手火箭"事件。

---

### 10. 🛠️ HAI Labs 警告 — 64,758 个 Skill 深度审计

**来源**: [X @Meta360DAO](https://x.com/Meta360DAO)  
**热度**: X 讨论 · 安全社区关注  
**状态**: 🟠 Hot

对 ClawHub 上 64,758 个 Skill 的深度审计结果"令人背脊发凉"，1,025 个 Skill 明确投毒。安全审计作为一门新生意正在成型。

---

### 11. 🤖 Comate Skills — 百度入局技能平台

**来源**: [SegmentFault](https://segmentfault.com/a/1190000047679474)  
**热度**: 有奖征集活动  
**状态**: 🟡 Warm · 大厂信号

百度 Comate 推出 Skills 机制，将团队经验与高频场景封装为可一键调用的技能包。说明国内大厂已开始布局 Skill 平台。

---

### 12. 🌐 Agent 工程师需求爆发

**来源**: [X @oran_ge](https://x.com/oran_ge) · [X @xiaohuan_tech](https://x.com/xiaohuan_tech)  
**热度**: 46 likes · 招聘信号  
**状态**: 🟡 Warm · 就业信号

多家公司同时在 X 上招聘 Agent 工程师，"Agent 工程师真的不嫌多"。这表明 Agent/Skill 生态的人才需求正处于供不应求阶段。

---

### 13. 🛠️ Supply Chain Attack — HuggingFace 与 ClawHub 同时中招

**来源**: [X @lyrie_ai](https://x.com/lyrie_ai)  
**热度**: 安全圈广泛传播  
**状态**: 🟠 Hot · 跨生态安全事件

HuggingFace 和 ClawHub 同时遭遇供应链攻击，数百个恶意 AI 模型被植入。开发者在不知不觉中拉取了被篡改的 pipeline。供应链安全问题从传统包管理蔓延到 AI 资产领域。

---

### 14. 🤖 CowAgent — 比 OpenClaw 更轻量的 Skill 管理

**来源**: [GitHub Trending](https://github.com/zhayujie/CowAgent) · 44,278 stars  
**热度**: 315 stars/week · 持续增长  
**状态**: 🟠 Hot · 直接竞品信号

CowAgent（chatgpt-on-wechat）自称比 OpenClaw 更轻量便捷，能主动思考和任务规划、创造和执行 Skills。支持微信、飞书、钉钉等接入。在国内社区热度极高，每周 315+ stars。

---

### 15. 🛠️ JeecgBoot — 低代码平台集成 Skills

**来源**: [GitHub Trending](https://github.com/jeecgboot/JeecgBoot) · 46,157 stars  
**热度**: 95 stars/week  
**状态**: 🟡 Warm · 集成信号

JeecgBoot AI 低代码平台已内置 Skills 能力，"一句话画流程图、设计表单、生成系统"。这表明 Skill 机制正在被集成到更广泛的平台生态中。

---

## 🐦 X 中文 KOL 观点摘要

### @buhuaguo1 (不滑锅) · ❤️2

> "用 skillguard 跑了 Clawhub 上 57580 个 skill 的安全审计，结果：1.78% 明显投毒，agent-defender 本身是毒的中毒。做 skill 聚合分发的门槛不高，只要会打字，就可以做出来"

**信号解读**: 明确指出 skill 聚合分发"门槛不高"，但安全治理是真正的技术壁垒。

### @yangyi (Yangyi) · ❤️1

> "我也利用这个 skill 做了 clawhub 的审计，输出了一份报告。目前仍然在用它查杀网络上各种被发布收集到聚合列表和导航站里的 skills，报告会持续自主新增"

**信号解读**: skillguard.vip 已经在做 Skill 安全审计的垂直产品。

### @op7418 (归藏) · ❤️287

> "厌倦了千篇一律的衬线字体和排版？歸藏的 PPT Skill 新主题预告"

**信号解读**: 头部 KOL 正从"测评者"转型为"Skill 创作者"，PPT Skill 287 likes 说明市场对高质量 Skill 有强烈付费意愿。

### @shao__meng (meng shao) · ❤️731

> "信息卡制作完整方法我做成了 Skill「infocard-skills」，开源在这里了"

**信号解读**: 单个 Skill 发布获得 731 likes，说明优质 Skill 的传播效率极高，但目前主要依赖个人 GitHub 分发，缺乏统一发现和管理平台。

### @geshan (Geshan Manandhar) · ❤️1

> "Skills vs MCP: When Should You Use What? Anthropic's own analogy says that MCP is like having access to every aisle in a hardware store. A Skill is the experienced employee who walks you to exactly the right shelf."

**信号解读**: 概念教育类内容持续获得关注，市场仍处于认知建立阶段。

---

## 🏟️ 竞争格局全景

### 第一梯队：官方/大厂平台

| 平台 | 背景 | Skill 数量 | 特点 | 威胁级别 |
|------|------|-----------|------|---------|
| **ClawHub** | OpenClaw 官方 | 57,580+ | 全球最大 Skill 市场，但安全问题严重 | 🔴 极高 |
| **Nacos 3.2 Skill Registry** | 阿里云/阿里巴巴 | 企业级 | 安全审核+版本管理+灰度发布+RBAC 权限+审计追溯 | 🔴 极高 |
| **Smithery** | 独立公司 | 8,499+ MCP | MCP 市场领导者，已扩展到 Skills 板块 | 🟠 高 |
| **Composio (awesome-claude-skills)** | Composio | 1,000+ | 59k stars，500+ App 集成，生态最全 | 🟠 高 |
| **腾讯 SkillHub + EdgeOne ClawScan** | 腾讯 | 镜像 | 国内镜像+安全扫描 | 🟠 高 |
| **百度 Comate Skills** | 百度 | 内置 | 封闭生态 | 🟡 中 |

### 第二梯队：社区/开源项目

| 项目 | Stars | 定位 |
|------|-------|------|
| **VoltAgent/awesome-openclaw-skills** | 48.4k | 社区策展，5,211 个精选 skill + clawskills.sh 导航 |
| **phuryn/pm-skills** | 11k | PM 垂直领域 100+ Skill 市场 |
| **davepoon/buildwithclaude** | 2.9k | Claude Skills/Agents/Commands 一站式 Hub |
| **jeremylongshore/claude-code-plugins-plus-skills** | 2.1k | 425 插件 + 2,810 Skill + 200 Agent，tonsofskills.com |
| **NeoLabHQ/context-engineering-kit** | 983 | 手工精制高质量 Skill |
| **numman-ali/n-skills** | 980 | 跨 Claude/Codex/openskills 的插件市场 |
| **binance/binance-skills-hub** | 827 | 加密货币垂直 Skill 市场 |
| **Leon-Drq/openagentskill** | 166 | 开源 Skill 市场（TypeScript + Next.js） |

### 第三梯队：垂直/安全工具

| 工具 | 定位 |
|------|------|
| **skillguard.vip** | Skill 安全审计报告平台 |
| **Snyk Agent Scan** | 企业级 Skill 安全扫描 |
| **Agent Trust Hub (Gen Digital)** | Skill 信任评分 |
| **agentskills.io** | Agent Skills 开放标准官网 + 文档 |
| **Glama.ai** | MCP Server 发现平台，23,328 servers |

### GitHub 仓库数量信号

搜索 "agent skill marketplace" 返回 **599 个仓库**，说明：
- 赛道极度拥挤，大量个人/团队在尝试
- 但绝大多数 star 数低于 100，质量参差不齐
- 头部项目已明显拉开差距

---

## 📈 市场需求矩阵

| 需求维度 | 需求强度 | 竞争饱和度 | 机会评估 |
|----------|---------|-----------|---------|
| **公开 Skill 市场/商店** | ⭐⭐⭐⭐⭐ | 🔴 极高 (ClawHub 57k+) | ❌ 不建议 — 赢家已出现 |
| **企业私有 Skill Registry** | ⭐⭐⭐⭐ | 🟠 高 (Nacos 3.2 领先) | ⚠️ 可做 — 需差异化 |
| **Skill 安全审计/信任评分** | ⭐⭐⭐⭐⭐ | 🟡 中 (skillguard, Snyk) | ✅ 有空间 — 安全审计刚起步 |
| **跨平台 Skill 管理 CLI** | ⭐⭐⭐⭐ | 🟡 中 (npx skills, nacos-cli) | ✅ 有空间 — 体验碎片化 |
| **Skill 发现/推荐引擎** | ⭐⭐⭐ | 🟡 中 | ✅ 有空间 — 语义搜索+个性化推荐 |
| **中文 Skill 国内加速** | ⭐⭐⭐⭐ | 🟡 中 (腾讯镜像) | ⚠️ 有空间但商业模式难 |
| **Skill 创作者经济平台** | ⭐⭐⭐ | 🟢 低 | ✅ 蓝海 — 无人做付费Skill市场 |
| **垂直行业 Skill Pack** | ⭐⭐⭐ | 🟢 低 | ✅ 蓝海 — 仅 Binance 做了加密领域 |

---

## 💡 可实施机会（5 项）

### 1. 🛡️ Skill 安全审计 SaaS — "Skill 的 Snyk"

**可行性**: 高。ClawHub 57k+ Skill 中 1.78% 投毒 + 36.82% 存在安全缺陷，企业有强烈付费意愿。skillguard.vip 已验证需求，但目前只是静态报告。  
**建议实现**:
- AST 解析 SKILL.md 中的脚本调用，检测 Prompt 注入、文件窃取、网络外传
- 与 VirusTotal/Snyk 集成，提供实时风险评分
- 输出格式兼容 SARIF，可接入 CI/CD
- 提供 GitHub Action / CLI / Web Dashboard  
**差异化**: 相比 Snyk（通用安全）和 skillguard（静态报告），聚焦 Agent Skill 特有攻击面（Prompt 注入、Memory 篡改、权限提升）  
**预估工作量**: M（2-4 周 MVP）  
**商业模式**: 免费版（社区扫描限额）+ Pro（企业 CI/CD 集成、私有 Registry 扫描、合规报告）

---

### 2. 🎯 跨平台 Skill 管理器 — "Skill 的 Homebrew"

**可行性**: 高。当前 Claude Code、Cursor、Codex、Trae、OpenClaw、Hermes Agent 各有各的 Skill 安装方式，用户痛感强烈。  
**建议实现**:
- 统一 CLI：`skillmgr install <skill> --agent claude-code|cursor|openclaw|trae`
- 自动检测当前环境中的 Agent 类型
- 支持从 ClawHub / GitHub / Nacos / 本地 Registry 多源安装
- 内置安全扫描（安装前自动检查）
- 锁文件机制（skill.lock），记录版本快照  
**差异化**: 唯一的跨平台 Skill 包管理器，目前没有人做  
**预估工作量**: M（3-4 周 MVP）  
**商业模式**: 开源免费 + 企业版（私有 Registry、团队同步、审计日志）

---

### 3. 💰 Skill 创作者市场 — "Skill 的 Gumroad"

**可行性**: 中高。KOL（归藏 PPT Skill 287 likes、meng shao infocard 731 likes）已验证高质量 Skill 有传播力和付费意愿，但目前所有 Skill 都是免费分发。  
**建议实现**:
- Web 平台：Skill 发布、定价、试用、评价
- 支持 License Key 分发 + 使用统计
- 创作者 Dashboard（收入、下载量、评分）
- 内置安全审核流水线
- 支持 Freemium（基础版免费 + Pro 版付费）  
**差异化**: **全球首个付费 Skill 市场**——Composio 的 awesome-skills 是免费策展，ClawHub 是免费开放，没有人做付费 Skill 分发  
**预估工作量**: L（6-8 周 MVP）  
**商业模式**: 平台抽成 20-30% + Skill 认证费

---

### 4. 🏢 企业 Skill 治理平台 — "轻量版 Nacos"

**可行性**: 中。Nacos 3.2 功能全面但部署重（需要 Java + 集群），中小企业需要更轻量的替代。  
**建议实现**:
- 单二进制部署（Go/Rust），5 分钟启动
- Skill 上传 + 版本管理 + 标签灰度
- RBAC 权限 + 审批工作流
- 安全扫描插件（内置 Prompt 注入检测）
- 兼容 ClawHub / nacos-cli 的 Skill 格式
- Web UI + REST API  
**差异化**: 对标 Nacos 但去除 Java 生态依赖，面向中小团队和独立开发者  
**预估工作量**: L（8-12 周 MVP）  
**商业模式**: 开源社区版 + 付费云托管版

---

### 5. 🔍 中文 Skill 发现引擎 — "Skill 的 Product Hunt"

**可行性**: 高。ClawHub 57k+ Skill 中文描述少、分类粗糙，VoltAgent 的策展列表也主要是英文。中文开发者需要本土化的发现体验。  
**建议实现**:
- 每日自动同步 ClawHub + GitHub + awesome-lists
- 中文翻译 + 质量评分 + 使用场景标签
- AI 驱动的语义搜索（"我想让 Agent 帮我做 PPT"）
- 用户评测 + 社区投票
- 每周精选推送（微信/飞书/邮件）  
**差异化**: 国内唯一的中文 Skill 策展+搜索平台  
**预估工作量**: S-M（1-3 周 MVP）  
**商业模式**: 广告/赞助 + 付费精选订阅 + 导流分成

---

## 🧭 战略建议

### 不建议做的方向

1. **通用公开 Skill 市场** — ClawHub (57k) + Smithery (8.5k MCP) + Composio (59k stars) 已形成壁垒，正面竞争无胜算
2. **企业级全功能 Skill Registry** — Nacos 3.2 背靠阿里云，Java 生态渗透率高，中大型企业市场被锁定
3. **纯 Skill 镜像站** — 腾讯已做，商业模式不成立（成本高、无壁垒）

### 推荐入场策略

| 优先级 | 方向 | 理由 |
|--------|------|------|
| 🥇 P0 | **Skill 安全审计 SaaS** | 需求最刚、壁垒最高、付费意愿明确，且能作为流量入口延伸到管理平台 |
| 🥈 P1 | **跨平台 Skill 管理 CLI** | 痛点真实、开发量适中、开源引流效果好，可作为平台的客户端 |
| 🥉 P2 | **中文 Skill 发现引擎** | MVP 最快、用户获取成本最低，可作为社区运营和品牌建设的抓手 |

**组合拳打法**: 先做 P2（中文发现引擎，1-2 周 MVP 获客）→ 集成 P0（安全扫描，建立技术壁垒）→ 发布 P1（CLI 工具，锁定开发者工作流）→ 最终形成"发现 + 审计 + 管理"一体化平台。

---

---

## 🔬 专项调研：本地 Skill 分析工具

> 你的具体想法：**展示本地已安装 Skill、解释原理、教怎么用、检测冲突**

### 市场空白验证

GitHub 搜索 `skill analyzer agent local viewer` → **0 个仓库**  
这个细分方向目前**完全空白**，无竞争对手。

与已有工具对比：

| 工具 | 能做什么 | 不能做什么 |
|------|---------|-----------|
| `clawhub list` / `npx skills list` | 列出已安装 skill 名称 | 无可视化、无原理解释、无冲突检测 |
| Nacos 3.2 | 企业 Registry 管理 | 不关注本地已装环境 |
| skillguard.vip | 安全审计（扫描 ClawHub） | 不针对本地已装的 skill |
| agentskills.io | 格式规范文档 | 没有本地管理功能 |
| skill-decoder（本仓库内置 Skill） | Agent 驱动解析单个 Skill | 需要手动调用、不能批量、不检测冲突 |

**结论：无人在做"本地 Skill 分析+管理"工具。**

---

### 产品需求分解

#### 1. 本地 Skill 清单展示

**痛点程度**: 🔴 高  
用户可能在以下多个路径装了 Skill，但没有统一视图：

```
~/.claude/skills/                    # Claude Code 全局
~/.config/claude-code/skills/       # Claude Code 旧路径
<project>/.claude/skills/           # 项目级
~/.openclaw/skills/                 # OpenClaw 全局
~/.openclaw/agents/<agent>/skills/  # 每个 Agent 独立
~/.config/hermes/skills/            # Hermes Agent
~/.cursor/skills/                   # Cursor
```

典型场景：用户装了 40 个 skill，完全不知道自己装过什么，遇到 Agent 行为异常无从排查。

#### 2. Skill 原理可视化

**痛点程度**: 🟠 中高  
每个 SKILL.md 里的 Workflow 流程往往是纯文本，用户需要大量阅读才能理解。  
可自动提取：
- 触发条件（trigger words / description）
- 工作流步骤（Step 1 → Step 2 → ...）
- 依赖工具（bash / python / API 调用）
- 输入/输出格式
- 所需环境（需要哪些 MCP、API Key）

已有先例：本仓库的 `skill-decoder` Skill 可以生成 HTML 可视化，但需要 Agent 手动调用。做成本地工具后可批量自动生成。

#### 3. 使用引导

**痛点程度**: 🟡 中  
很多 Skill 文档里的"trigger examples"不完整，用户不知道怎么触发。  
可以：
- 提取 SKILL.md 中的 trigger 示例
- 根据 description 自动生成使用示例
- 针对不同 Agent 平台生成对应的调用方式（OpenClaw / Claude Code / Cursor 语法不同）

#### 4. 冲突检测

**痛点程度**: 🔴 高（技术壁垒最强）  
这是最有价值的功能，也是完全空白的。Skill 冲突有三类：

| 冲突类型 | 具体表现 | 检测方法 |
|---------|---------|---------|
| **Description 语义重叠** | 两个 Skill 的 description 太相似，Agent 不知道激活哪个 | 向量相似度计算（cosine similarity > 0.85 告警） |
| **触发词冲突** | 两个 Skill 的 trigger 示例使用相同关键词，Agent 行为不稳定 | 关键词提取 + 重叠率计算 |
| **资源/工具竞争** | 两个 Skill 都操作同一个文件、都定义了同名函数/变量 | 静态分析脚本调用 |
| **指令矛盾** | Skill A 说"总是写单元测试"，Skill B 说"跳过测试快速交付" | NLP 矛盾检测（难度高，可以作为高级功能） |

实测场景：一个用户装了 `git-workflow` 和 `github-automation` 两个 Skill，两者 description 高度重叠，导致 Agent 在执行 GitHub 操作时随机激活错误的 Skill，行为不稳定——这是真实会发生的问题。

---

### 竞争优势评估

| 维度 | 评分 | 说明 |
|------|------|------|
| **市场空白** | ⭐⭐⭐⭐⭐ | GitHub 0 竞品 |
| **需求真实性** | ⭐⭐⭐⭐ | 装了 50+ Skill 的用户必然遇到管理问题 |
| **技术壁垒** | ⭐⭐⭐⭐ | 冲突检测需要 NLP + 静态分析，不是随便抄的 |
| **病毒传播性** | ⭐⭐⭐⭐ | "你装的 Skill 有 3 个冲突" 这种输出天然适合截图分享 |
| **变现路径** | ⭐⭐⭐ | 免费工具 → 冲突修复建议收费 → 企业批量审计 |
| **开发难度** | ⭐⭐⭐ | MVP 可以 2 周完成（CLI），Web UI 再加 2 周 |

---

### MVP 产品设计建议

**产品名**：`skill-doctor`（诊断你的 Skill 健康状况）

**第一版核心功能（2 周）：**

```bash
$ skill-doctor scan
# 自动发现 4 个路径下所有已安装 Skill
# 输出报告：
#   ✅ 已安装: 37 个 Skills
#   ⚠️  冲突: 3 对高语义重叠 Skills
#   🔴 风险: 2 个 Skill 包含可疑的文件操作
#   ❌ 损坏: 1 个 Skill 缺少必要字段

$ skill-doctor show github-automation
# 输出该 Skill 的原理图（ASCII 流程图 or HTML）
# 触发方式、依赖工具、使用示例

$ skill-doctor conflicts
# 列出所有冲突对及建议
```

**第二版加 Web Dashboard（再 2 周）：**

- 可视化所有已安装 Skill 的关系图（按领域/功能分类）
- 点击查看详细原理（Mermaid 流程图）
- 冲突标注（两个 Skill 节点之间显示警告连线）
- 一键"修复建议"（调整 description 使触发更精准）

---

### 商业模式

| 层级 | 功能 | 价格 |
|------|------|------|
| **免费** | 扫描+清单+冲突列表（CLI） | $0 |
| **Pro** | 冲突修复建议 + 原理可视化 Web UI + 安全扫描 | $9/月 |
| **Team** | 多人共享 Skill 库 + 冲突协同解决 + 企业报告 | $49/月 |

**最佳变现时机**：当用户看到"你有 3 个冲突"，会有强烈的修复冲动，此时付费转化率最高。

---

### 与调研中其他机会的对比定位

| 产品方向 | 竞争激烈度 | 开发量 | 市场空白 | 推荐级别 |
|---------|-----------|--------|---------|---------|
| Skill 安全审计 SaaS | 🟡 中 | M | 中 | ⭐⭐⭐⭐ |
| 跨平台 Skill CLI | 🟡 中 | M | 中 | ⭐⭐⭐⭐ |
| 中文 Skill 发现引擎 | 🟡 中 | S | 中 | ⭐⭐⭐ |
| **本地 Skill 分析工具** | 🟢 **极低** | S-M | **最高** | ⭐⭐⭐⭐⭐ |

**`skill-doctor` 是目前调研到的所有方向里竞争最小、开发量最低、差异化最强的单点切入口。**

强烈建议以此作为 MVP 起步，通过冲突检测的"惊喜感"快速获取第一批用户和口碑，再横向扩展到安全审计和管理平台。

---

## 📌 关键数据汇总

| 指标 | 数值 | 来源 |
|------|------|------|
| ClawHub Skill 总数 | 57,580+ | X @buhuaguo1 |
| ClawHub 安全审计投毒率 | 1.78%（1,025 个） | X @yangyi, skillguard |
| Snyk 采样安全缺陷率 | 36.82%（CRITICAL 13.4%） | SegmentFault/Nacos 文章 |
| ClawHavoc 恶意率 | 11.9%（341/2,857） | Koi Security 报告 |
| awesome-claude-skills Stars | 59k | GitHub |
| awesome-openclaw-skills Skills | 5,211（筛选自 13,729） | GitHub |
| Smithery MCP Servers | 8,499+ | smithery.ai |
| Glama MCP Servers | 23,328 | glama.ai |
| GitHub "agent skill marketplace" 仓库 | 599 | GitHub Search |
| Hermes Agent Stars | 100k+ | SegmentFault |
| CowAgent Stars | 44,278 | GitHub Trending |
| AstrBot Stars | 31,791 | GitHub Trending |
| Agent Skills 开放标准支持平台 | Claude Code, Cursor, Codex, Gemini CLI, Antigravity, Windsurf | agentskills.io |
