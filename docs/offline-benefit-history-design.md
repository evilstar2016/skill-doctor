# 基于项目历史的描述 Token 收益分析

日期：2026-09-11。本文是经过官方配置文档、Codex 源码和本机日志核查的实施设计。历史画像、独立目录来源、最长主会话投射、历史回放及逐响应缓存估算已实现；测试、本机运行结果和未验证边界见 [实施验证记录](offline-benefit-history-verification.md)。宿主新会话的实际禁用效果仍未验证，不标记为运行时已验证。

## 分析输入与口径

三个输入分别选择，禁止用当前本机 inventory 替代模型实际可见目录：

1. 使用画像：项目可读取的历史主会话及其关联子任务。默认覆盖全部可读历史，明确起止日期、归档范围、截断/缺失数量；去重继承历史及镜像事件。
2. 推荐候选：最近活跃主会话的最新完整 `skills_instructions` 和 `recommended_plugins` 目录。两块各自记录会话 ID、时间戳、文件、行号、hash；若时间点不同，明确显示，不拼成声称同时存在的上下文。
3. 估算基准：上述历史范围内主线程完整模型响应次数最多的用户会话；相同次数按最近活动时间排序。显示选择规则，排除 reviewer 等系统会话。子任务费用单列。

“最长”采用模型响应次数，是为了匹配重复输入和缓存成本。另列用户消息数、不同 turn_id 数、完成轮次数、模型响应次数，不把它们统称为交互次数。

## 历史使用画像

每个 Skill 保存 `explicitMentionCount`、`activationCount`、`observedReadCount`、`usedSessionCount`、`lastUsedAt` 及证据引用。

- 用户显式 Skill/插件引用、结构化 Skill 激活、可归属的插件工具调用属于使用证据。
- 读取 SKILL.md 是“读取证据”；批量扫描、源码分析、成本审计中的读取不能直接标成业务使用。
- `response_item`、新版 UserMessage item 与旧版 user_message 都要解析，镜像消息仅计一次。
- 目录、附件、代码块、引用历史、审阅 transcript、工具输出中的名称不计用户使用。
- 别名解析优先使用明确的 Skill 路径、命名空间和插件 ID。不能将 audit/index 等通用单词当作唯一 Skill 标识。
- 对没有可读历史、证据截断或映射不明确的资源，标为未知，不视为从未使用。

展示常用排序，但默认保留所有有可靠使用证据的条目，避免用任意 top-K 切掉偶尔需要的能力。无使用记录的条目生成关闭建议，由用户审阅。

## 控制映射与历史收益

推荐候选来自最新目录；能否执行关闭是另一个字段。所有 Skill roots 都要展开，用于目录条目的来源解析和控制映射，不递归把根目录中未注入的所有 Skill 当成候选。

- 本机普通 Skill：验证路径与 `skills.config` 控制。
- 插件 Skill：验证单 Skill 配置是否覆盖该来源；若仅能关闭整个插件，应展开受影响兄弟 Skill/工具并检查保留集合，不声称单项可控。
- 已配置禁用但历史仍注入：仍可计算历史假设收益，另标当前无需新增关闭操作/现有会话尚未刷新。不能因当前禁用而抹除历史成本。
- root alias 仅在所有保留的历史目录条目都不再引用它时可删除；依据历史目录，不能依据不完整的当前本机 inventory。

## 推荐插件的已核实配置

官方配置参考支持按 ID 屏蔽推荐：

```toml
[tool_suggest]
disabled_tools = [
  { type = "plugin", id = "airtable@openai-curated-remote" },
]
```

源码 `recommended_plugin_candidates_for_config` 会过滤该列表中的 plugin ID；它不是 `plugins.<id>.enabled`。应用时必须合并现有配置，保留 connector/其他 plugin 禁用项。

整块关闭：

```toml
[features]
tool_suggest = false
recommended_plugins = false
```

源码 gate 为 `Apps && Plugins && (ToolSuggest || RecommendedPlugins)`。单独关闭 `recommended_plugins` 不充分。此组合也关闭模型侧安装建议能力，但不要求关闭已安装 apps/plugins。

插件渲染最多取 50 个候选。逐 ID 屏蔽后可能发生候选补位，因此必须区分固定候选文本差值与运行时最终目录差值。可确定关闭整块的源码行为，仍需在目标 Desktop 版本的新会话确认宿主未覆盖配置。当前 CLI 参数解析验证不能替代 Desktop 上下文验证。

## 两种估算场景

默认提供“最新目录在基准会话上的模拟”：把最新推荐关闭集合的描述文本差值投射到基准会话的响应/缓存样本，明确假设目录在各响应中保持可见。该结果用于评估当前配置的重复成本，不称为历史实际发生的收益。

另外提供“历史可重建回放”：逐响应定位当时完整上下文，仅删除当时存在的候选描述。压缩后，若没有可重建上下文，标为未知；不能继续沿用失效目录。

同一文本在日志中只注入一次，不代表仅产生一次输入成本。只要它仍在请求上下文中，后续响应仍可能计入普通输入、缓存读取或缓存写入。当前 `countedContextAnchors` 按锚点将 recommended_plugins 后续响应归零的规则不适合作为持续输入成本算法。

## 缓存计算与报告

对每次模型响应 i 展示：I_i 实测输入、C_i 实测缓存读取、W_i 实测缓存写入、D_i 描述删减估算。

缓存覆盖整个请求。只有总缓存数时，不能证明具体描述块命中。对一个大小 D_i 的待删除片段，其缓存读取归属范围为：

```text
max(0, D_i - (I_i - C_i)) <= 描述缓存读取 Token <= min(D_i, C_i)
```

下界/上界是历史片段归属范围，不能保证修改前缀后的真实缓存行为不变。若有完整请求中块的位置及匹配前缀边界，才提高归属证据等级。

可提供“缓存前缀优先”估算场景：

```text
R_i = min(D_i, C_i)
B_i = min(D_i - R_i, W_i)
U_i = D_i - R_i - B_i
累计输入减少 = Σ D_i
等价费用变化 = Σ (R_i * 缓存读单价 + B_i * 缓存写单价 + U_i * 普通输入单价)
```

逐模型计价；缺失价格标为未知。所有 D_i 必须满足 0 <= D_i <= I_i。首个响应使用实际缓存记录，不能固定认为缓存为零。另提供缓存重建敏感性场景，不把历史命中模式当作禁用后实测结果。

页面先显示基准会话 ID/时间/路径、用户消息数/轮次数/模型响应数，然后显示首个响应、首次用户交互的累计响应值、后续各交互的输入/缓存/描述变化。逐响应明细可展开，CSV/JSON/HTML与页面保持一致。

## 当前源码的改动位置

- `src/benefit/codexSessions.ts`：使用画像事件提取，系统会话排除，最长基准选择，事件去重。
- `src/benefit/offlinePlan.ts`：以最新完整目录生成候选；历史使用分级；控制映射独立于候选选择。
- `src/benefit/contextEvidence.ts`：历史目录/root alias重建，插件行过滤、空块消失、持续可见性判断。
- `src/benefit/estimateBenefit.ts`：分别实现最新目录模拟与历史回放；逐响应/逐轮聚合、缓存归属范围、三类输入价格。
- `src/benefit/types.ts`：baselineSession、catalogSources、usageProfile、recommendations、firstResponse、turnBreakdown、cacheAttribution。
- `src/render/renderBenefit.ts`、`web/src/pages/BenefitPage.tsx`：相同计算结果的不同展示，不在 UI 重新计算。

## 验收条件

1. 最新会话不是最长会话时，候选目录和估算基准仍分别选对。
2. 目录中出现名称不计使用；真实显式引用/激活可追溯并去重。
3. 当前本机 inventory 漏掉插件 Skill 时，候选仍展示为待验证，而不是直接消失。
4. 历史已注入但当前已禁用的描述仍可进入历史假设收益。
5. 一次用户交互包含多次模型响应时，首轮与后续累计正确；子任务不混入主线程交互数。
6. 首响应存在缓存、后续未命中、压缩、缓存写入、未知价格均有覆盖。
7. 推荐插件逐项过滤与整块关闭分别验证；含 50 条上限补位案例。
8. 在隔离配置的新 Desktop/CLI 会话中核验描述实际消失，方可标成该宿主版本已验证；离线模拟无需修改用户配置。

## 本机核查样本

CLI：`codex-cli 0.153.2`；当前 Desktop 日志版本：`0.153.4`。CLI `-c` 临时覆盖已验证接受两个 false feature 值和 `tool_suggest.disabled_tools` 的 plugin 项；没有生成模型请求或更改项目配置。

对项目可读历史（包含归档）扫描得到 106 个主会话候选。候选中会话 `01a07729-803d-7470-bca3-37b82213276e` 的主线程有 895 条完整用量记录、21 个不同 turn_id、21 个完成轮次、18 个 UserMessage item、9 次压缩。这些计数不能互相替代。

该会话首响应：input 29,139；cached input 17,152；cache write 0。29,139 - 17,152 = 11,987 是整个响应的非缓存输入，不是描述节省量。推荐关闭集合和描述差值尚未按本设计生成，因此不沿用旧报告的 110,925 作为本方案收益。

## 核查来源

- https://developers.openai.com/codex/config-reference/ （tool_suggest.disabled_tools）
- https://developers.openai.com/codex/config-schema.json （feature 参数）
- https://github.com/openai/codex/blob/main/codex-rs/features/src/lib.rs （plugin_recommendations_enabled）
- https://github.com/openai/codex/blob/main/codex-rs/core-plugins/src/manager.rs （recommended_plugin_candidates_for_config）
- https://github.com/openai/codex/blob/main/codex-rs/core/src/session/mod.rs （调用与上下文装配）
- https://github.com/openai/codex/blob/main/codex-rs/core/src/context/recommended_plugins_instructions.rs （空集合与50条上限）
- https://developers.openai.com/api/docs/guides/prompt-caching （前缀匹配、缓存读/写与计费）
