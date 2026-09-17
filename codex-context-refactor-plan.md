# skill-doctor 的 Codex 上下文控制改造计划

## 1. 计划状态

- 状态：已按本计划完成 Codex 相关实现和回归用例；最终门禁与本地提交已完成，远程 push 待目标确认。
- 依据：[Codex block 配置验证报告](/Users/evilstar/GitHub/skill-doctor/codex-context-block-verification.md)、当前 skill-doctor 源码、当前会话 JSONL，以及 /Users/evilstar/GitHub/codex 中对应的 Codex 源码。
- 目标：让 skill-doctor 报告的“可控”“已移除”“预计节省”都以完整的新 Desktop task 会话头为最终证据，而不是把静态配置写入或 Core 源码支持误报成运行时生效。
- 本轮边界：不自动创建 Desktop task，不修改外部 Codex 源码，不修改现有 UI 工作区改动，也不恢复当前项目 .codex/config.toml 的验证配置。实现只读取用户提供的 session JSONL，不拦截或重放 WebSocket 首包。

## 2. 整体扫描结论

当前实现已经具备四类能力：

1. 扫描本地 skill、plugin、MCP、AGENTS.md、memory 和配置来源。
2. 从文本中识别 skills_instructions、recommended_plugins 等上下文 block。
3. 根据历史会话估算上下文占用、候选资源和潜在收益。
4. 将若干资源的开关写入项目 .codex/config.toml，再通过 CLI、API 和 Web UI 暴露。

主要问题是这四层使用了不同的“可控”定义：

- 配置层的 changed 表示文件被写入；
- 源码分析层的 source-supported 表示某个 Codex Core 配置存在；
- UI 层的 controllable 被当成用户可以直接执行且会改变当前目标 block；
- 会话层真正能证明的只有：新建 Desktop task 后，新的 JSONL 是否出现对应的 content_item_kinds 和完整 block。

因此本次改造应先统一领域模型，再修改控制、历史收益和 UI，而不是只增加或替换一个 TOML 键。

## 3. 已验证的运行时约束

| 对象 | 当前验证结果 | 改造影响 |
| --- | --- | --- |
| skills_instructions | 当前项目配置中的 [skills].include_instructions = false 在修改配置后新建的 Desktop task 中使真实 host skill item 消失；项目级 [[skills.config]] 不能作为同等强度的运行时证据。 | 将“整个 skill catalog 被关闭”和“单个 skill 被选择器禁用”分开建模；前者可以在新会话证据支持时标记为已验证。 |
| recommended_plugins | Codex Core 有 features.tool_suggest 和 features.recommended_plugins 的联合 gate；但当前 Desktop task 仍收到 plugins.recommendations，即使项目配置写入两个 false。 | 不能把项目配置写入直接报告为 Desktop block 已移除；需要标记为配置已写入、宿主运行时未验证或被宿主覆盖。 |
| tool_suggest.disabled_tools | 可按工具 ID 过滤推荐候选，但不能证明整个 recommended_plugins block 消失；过滤后可能由其他候选补位。 | 单项过滤和整块移除必须使用不同的控制类型、收益计算和文案。 |
| plugins.<id>.enabled | 控制已安装 plugin 的启用状态，不是 plugins.recommendations 的整块控制。 | 不得用已安装 plugin 开关推断推荐列表 block 的变化。 |
| 原始 block 解析 | 旧会话中存在真实的 host_skills.instructions 和 plugins.recommendations item；新会话的 memory/developer 文本中还可能出现字面量 <skills_instructions>，但没有对应的真实 item。 | 解析器必须结合 JSONL 的 item metadata、role、content item kind 和完整边界，不能对扁平化文本做无上下文的标签命中。 |
| 通信方式 | 会话头只在新建 task 时发送一次。当前会话不能用于证明修改后的运行时状态。 | 验证接口必须接受新会话 JSONL；每次配置实验必须记录新 task、session 路径和解析结果。 |

当前用于严格验证的项目配置是：

    [features]
    tool_suggest = false
    recommended_plugins = false

    [skills]
    include_instructions = false

它属于用户的本机验证状态，不应被硬编码到 skill-doctor 的默认配置或测试环境。

## 4. 当前代码结构与问题定位

### 4.1 主调用链

    runHealthCheck
      -> createHealthCheckScanContext
      -> scanCodexContextEntries
      -> loadCodexEffectiveState
      -> estimateContextCost
      -> buildSnapshot / UI

    benefit
      -> scanCodexSessions
      -> collectHistoryInput / historyAnalysis
      -> offlinePlan / contextEvidence
      -> estimateBenefit
      -> CLI / API / Web UI

    context enable|disable
      -> codexControls
      -> project .codex/config.toml

    benefit control preview|apply|undo
      -> historyControls
      -> project .codex/config.toml
      -> new session required

### 4.2 需要联动的文件

| 文件 | 当前职责 | 本次需要修正的边界 |
| --- | --- | --- |
| [src/types/context.ts](/Users/evilstar/GitHub/skill-doctor/src/types/context.ts) | 定义 Codex block、上下文资源和成本项 | 将配置状态、运行时证据、block 观察结果拆开，避免一个 controllable 字段承载三种含义。 |
| [src/context/codexContextConfig.ts](/Users/evilstar/GitHub/skill-doctor/src/context/codexContextConfig.ts) | 读取 skill-doctor 的 Codex 扫描配置、路径和控制声明 | 明确 src/platforms/codex-config.json 是 skill-doctor 的扫描描述，不是 Codex runtime config.toml；补充配置层和来源 provenance 的表达。 |
| [src/context/scanCodexContext.ts](/Users/evilstar/GitHub/skill-doctor/src/context/scanCodexContext.ts) | 扫描本地资源并计算 effective state | 不要把项目级 skill selector 的存在当成宿主已经从会话头移除；按真实 resolver 层级记录 user、parent、project 和 host 状态。 |
| [src/context/scanCodexContextBlocks.ts](/Users/evilstar/GitHub/skill-doctor/src/context/scanCodexContextBlocks.ts) | 用标签和文本规则识别 block | 保留 CLI 文本解析能力，同时增加来源、role、content kind、完整性和 item 边界；拒绝普通文本中的字面量标签伪命中。 |
| [src/context/codexControls.ts](/Users/evilstar/GitHub/skill-doctor/src/context/codexControls.ts) | 写入项目配置并返回 toggle 结果 | 返回“文件已修改”和“运行时已验证”两个结果；未有新会话证据时不能返回无条件的 controllable=true。 |
| [src/context/historyControls.ts](/Users/evilstar/GitHub/skill-doctor/src/context/historyControls.ts) | 预览、应用、撤销历史控制 | 保留原子写入、digest 校验、symlink 安全和 undo；将推荐整块控制明确标为 config-only，直到新 task 证明结果。 |
| [src/benefit/codexSessions.ts](/Users/evilstar/GitHub/skill-doctor/src/benefit/codexSessions.ts) | 扫描 JSONL、建立 session 和 context snapshot | 不再只把 response item 的扁平文本交给 block parser；保留真实 item metadata 和 provenance。 |
| [src/benefit/historyAnalysis.ts](/Users/evilstar/GitHub/skill-doctor/src/benefit/historyAnalysis.ts) | 提取历史 catalog、候选和 plugin control | 将历史观察、静态配置投影、fresh-session 验证分开；不能以 source-supported 代替 runtime-verified。 |
| [src/benefit/offlinePlan.ts](/Users/evilstar/GitHub/skill-doctor/src/benefit/offlinePlan.ts) | 生成离线收益计划和影响项 | verifiedRemovable* 只能来自新会话中的 block 消失；配置未验证的收益归入 potential/unknown。 |
| [src/benefit/contextEvidence.ts](/Users/evilstar/GitHub/skill-doctor/src/benefit/contextEvidence.ts) | 关联历史上下文证据 | 将“历史上观察到过”和“本次控制后的新头部已消失”作为不同证据等级。 |
| [src/benefit/estimateBenefit.ts](/Users/evilstar/GitHub/skill-doctor/src/benefit/estimateBenefit.ts) | 汇总 token、收益和限制 | 按 block、entry、response 分开计算；配置写入不应直接转化成确定节省。 |
| [src/application/buildSnapshot.ts](/Users/evilstar/GitHub/skill-doctor/src/application/buildSnapshot.ts) | 将扫描结果转换为 UI snapshot | UI 的可执行开关应读取新的 control status，而不是直接复用成本项的 controllable。 |
| [src/ui-server/resourceHandlers.ts](/Users/evilstar/GitHub/skill-doctor/src/ui-server/resourceHandlers.ts) | 处理普通资源 toggle | API 返回配置路径、改变结果、运行时验证状态和新会话要求。 |
| [src/ui-server/benefitHandlers.ts](/Users/evilstar/GitHub/skill-doctor/src/ui-server/benefitHandlers.ts) | 处理历史控制 preview/apply/undo | 传递 config-only、fresh-session-required、runtime evidence 等字段。 |
| [src/cli/index.ts](/Users/evilstar/GitHub/skill-doctor/src/cli/index.ts) | 暴露 context blocks、context control、benefit 命令 | 输出“配置写入”和“会话头验证”的区别，并提供可复现的 JSONL/header 验证入口。 |
| [web/src/components/HistoryControlPanel.tsx](/Users/evilstar/GitHub/skill-doctor/web/src/components/HistoryControlPanel.tsx) | 展示历史控制按钮和 whole/individual 策略 | 不再因 id 是 recommended_plugins 就无条件显示可控；配置未验证时显示准确状态和下一步。 |
| [web/src/pages/ContextPage.tsx](/Users/evilstar/GitHub/skill-doctor/web/src/pages/ContextPage.tsx) | 展示资源和 toggle | 分离“可配置”“已在新会话中验证”“宿主覆盖/未知”。 |
| [web/src/i18n/zh-CN.json](/Users/evilstar/GitHub/skill-doctor/web/src/i18n/zh-CN.json)、[web/src/i18n/en-US.json](/Users/evilstar/GitHub/skill-doctor/web/src/i18n/en-US.json) | UI 文案 | 增加 evidence/status 文案，避免把 source-supported 翻译成“已关闭”。 |
| [src/platforms/codex-config.json](/Users/evilstar/GitHub/skill-doctor/src/platforms/codex-config.json) | skill-doctor 内置扫描源和控制描述 | 只在需要声明新的证据来源或 control kind 时修改；不要在此文件冒充 Codex runtime 配置。 |

## 5. 目标模型和不变量

建议将当前状态拆成以下字段，名称可在实现时按现有类型风格微调：

| 状态 | 含义 | 是否能报告确定 token 节省 |
| --- | --- | --- |
| observed-present | 指定新会话 JSONL 中有真实对应 item/block | 否，表示仍然占用。 |
| observed-absent | 指定新会话 JSONL 中 item/block 缺失，且 parser provenance 可信 | 是，可进入 verified removable。 |
| configured | 某个配置文件已被安全写入并读回 | 否，只能说明配置状态。 |
| runtime-verified | 配置写入后新建 task 的会话头已证实目标消失 | 是。 |
| host-overridden | 项目配置存在，但 Desktop 仍注入目标 item/block | 否；应显示宿主覆盖或项目层无效。 |
| unknown | 没有足够的 header metadata 或配置层信息 | 否。 |
| not-controllable | 当前产品没有安全、明确、独立的控制方法 | 否。 |

必须满足：

1. configured 不自动升级为 runtime-verified。
2. source-supported 不自动升级为 runtime-verified。
3. 只有可信的新会话证据才能进入 verifiedRemovableCount 和 verifiedRemovableTokens。
4. “整块消失”和“某个候选从列表中过滤”不能共用一个 control method。
5. 会话头验证必须保留 session 文件路径、session/task id、role、content item kind、item index 和配置快照。
6. 没有真实 item metadata 时，原始文本中的 <skills_instructions> 或 <recommended_plugins> 只能作为低置信度线索，不能作为运行时 block。

## 6. Codex 配置语义矩阵

这是后续实现和文档必须统一使用的判断表：

| block / 资源 | 真实配置关系 | skill-doctor 目标行为 |
| --- | --- | --- |
| skills_instructions 整块 | [skills].include_instructions = false 是整块级开关；本次新 Desktop task 已观察到它使真实 host skill item 消失。 | 支持项目配置写入，并在 fresh session JSONL 中确认后标记 runtime-verified。没有新会话时只标记 configured。 |
| 单个 skill | [[skills.config]] 是 selector/config 层能力，但不能仅凭项目文件中的 selector 证明当前 Desktop task 不再注入 catalog。 | 作为“配置选择器”单独展示；默认不宣称已从 header 删除，除非后续 fresh-session 证据明确关联到该 skill。 |
| recommended_plugins 整块 | Core 中存在 tool_suggest 与 recommended_plugins 联合 gate；当前 Desktop 项目配置写入两个 false 后，仍观察到真实 recommendations item。 | 保留配置 preview/undo，但报告为 config-only 或 host-overridden；未有新 task 证据时不计 verified savings。 |
| 单个推荐候选 | tool_suggest.disabled_tools 可过滤 ID，但不是整块开关，且候选可能补位。 | 单候选过滤单独计算，不能把整个 recommendations block 计为消失。 |
| 已安装 plugin | plugins.<id>.enabled 影响已安装 plugin，不等于推荐列表控制。 | 继续支持已安装 plugin 的资源状态，但从推荐 block 控制和收益中解耦。 |
| permissions_instructions、apps_instructions、environment_context | Core 有相应 root/include 配置概念，但本次没有完成 Desktop 项目层的 fresh-session 对照验证。 | 先标为配置层能力/运行时未知；只有新会话验证后才开放“已移除”结论。 |
| plugins_instructions | 可能与 plugin 功能开关相关，但没有独立、无副作用的 block-only 证明。 | 不提供误导性的独立 block 删除开关；记录潜在功能副作用。 |
| app_context、AGENTS、memory | 属于宿主或其他上下文来源，不是上述 block 的普通项目 toggle。 | 继续作为不可控或单独来源展示，不纳入 Codex block 配置成功率。 |

## 7. 分阶段改造方案

### P0：先统一类型契约

修改 src/types/context.ts、src/benefit/types.ts 和 src/benefit/historyTypes.ts：

- 增加 block/resource 的 control status、evidence level、config source、runtime evidence 和 requiresNewSession 的明确结构。
- 将 controllable 降级为“当前界面是否可执行一个安全操作”的 UI 派生字段，不能再同时表达“理论上有配置键”。
- 为 CodexContextBlockSnapshot 保留 session file、session/task id、role、content item kind、item index 和 parser diagnostics。
- 兼容旧历史 JSONL：缺 metadata 时状态为 unknown，不能回填成已验证。

验收：任何 API、CLI、UI 看到的“已移除”都能追溯到一条新会话证据；旧数据不会因类型默认值而变成可控。

### P1：重建配置层和 effective-state 判断

修改 src/context/codexContextConfig.ts、src/context/scanCodexContext.ts，必要时增加一个只负责 Codex runtime config layer 的小模块：

- 区分 skill-doctor 的 src/platforms/codex-config.json、用户 Codex config.toml、父目录配置、项目配置和 Desktop/host 注入。
- 解析并记录 [skills].include_instructions、[[skills.config]]、[features]、[tool_suggest].disabled_tools、plugin enabled 等配置的来源层。
- 按 Codex 实际 resolver 语义判断项目 selector 是否对目标 runtime 生效；不能因为配置文件存在就合并成 effective。
- 保留当前扫描目录和资源清单，不把“本地资源存在”混同成“会被 header catalog 注入”。

验收：

- 现有路径扫描、MCP 和 plugin 清单不回归。
- 对每个控制项能输出 sourcePath、配置层、解析值和 effective/unknown。
- 项目级 [[skills.config]] 不再无条件标记为能从 Desktop header 移除。

### P2：修正 block parser 和 provenance

修改 src/context/scanCodexContextBlocks.ts、src/benefit/codexSessions.ts 及相关 snapshot 类型：

- 保留对独立纯文本 header 的解析，但为解析入口增加可选的 role、content kind、item metadata、session provenance。
- JSONL 读取时优先使用真实的 content_item_kinds 和 response item 结构，只把真实 host_skills.instructions、plugins.recommendations item 交给对应 block parser。
- 不再先把整个 response item 扁平化后用标签搜索；至少要记录 item 边界，并排除 memory/developer 普通文本中的字面量标签。
- 继续报告 incomplete、duplicate、literal closing tag 等诊断，但将“文本命中”和“runtime item 命中”分为不同置信度。
- 保存 block 的原始来源信息，便于 CLI/UI 展示“从哪个 session JSONL 的哪个 item 得出结论”。

验收 fixtures：

1. 旧完整会话：识别真实 skills 和 recommendations block。
2. 本次严格验证会话：识别 recommendations，skills block 为 absent。
3. 含有字面量 <skills_instructions> 的 memory/developer item：不得识别成真实 skills block。
4. 缺 metadata 的旧格式：只给出 unknown 或低置信度文本观察。

### P3：重写控制语义和安全边界

修改 src/context/codexControls.ts、src/context/historyControls.ts：

- toggle/preview/apply 结果必须分别返回：
  - 是否写入配置；
  - 写入的配置路径和字段；
  - 是否需要新会话；
  - 当前是否已有 runtime evidence；
  - 若未验证，原因是 host override、配置层不生效还是尚未采集新会话。
- [skills].include_instructions=false 作为整块控制处理；单个 [[skills.config]] 不得伪装成整块控制。
- features.tool_suggest=false 与 features.recommended_plugins=false 的写入保留可逆性，但在 Desktop 场景默认是 config-only，直到新 task header 证明 block 消失。
- tool_suggest.disabled_tools 只产生 entry-level filtering 结果，不返回 whole-block removed。
- plugins.<id>.enabled 只控制已安装 plugin，不参与 recommendations block 的控制状态。
- 保持现有 digest 校验、原子写入、symlink/项目边界检查、undo 精确恢复和不写 global config 的安全规则。

验收：preview 可以清楚告诉用户“将写什么”和“尚不能证明什么”；apply 成功不能直接显示“已从会话头移除”。

### P4：修正历史收益和证据分级

修改 src/benefit/historyAnalysis.ts、src/benefit/offlinePlan.ts、src/benefit/contextEvidence.ts、src/benefit/estimateBenefit.ts、src/benefit/optimizationPlan.ts：

- runtime-verified 只来源于配置变更后的新 session/header 对照，不能来源于 Codex 源码中的 gate 或静态 TOML。
- verifiedRemovableCount、verifiedRemovableTokens 只统计 fresh-session 中确认 absent 的 block/entry。
- source-supported、configured、potential、unknown、verified 使用不同字段和不同汇总。
- recommendations 分别计算整块收益、单候选过滤收益和补位风险；不要用同一个 pluginControl.wholeBlock 推断所有场景。
- 历史报告继续注明“没有重新执行 Codex”时只是历史观察或离线 projection；配置写入后的实际结果应由新 JSONL 验证导入。
- “already optimized” 只有在当前新会话或可信历史 after evidence 中成立，不能因项目配置文件已经存在就成立。

验收：同一份历史报告同时呈现“过去观察到的成本”“当前配置投影”“新会话已证实的移除量”，三者数值不互相冒充。

### P5：同步 CLI、API、UI 和文档

修改 src/application/types.ts、src/application/buildSnapshot.ts、src/ui-server/*Handlers.ts、src/cli/index.ts、相关 web/src 页面和中英文 i18n：

- CLI 的 context blocks、context control、benefit control 输出配置路径、证据级别、session 路径和新会话要求。
- API 返回结构化 status，不让前端从旧的 supported 或资源 id 猜测运行时能力。
- ContextPage、HistoryControlPanel、BenefitPage 分别展示：
  - 可配置；
  - 已配置但待新会话验证；
  - 新会话已验证；
  - 宿主仍覆盖；
  - 不可控。
- 对 recommended_plugins 取消无条件显示可用控制；whole/individual 策略必须和实际语义对应。
- 文档同步更新 README.md、README.zh-CN.md、docs/offline-benefit-history-design.md、doc/codex-context-block-optimization-plan.zh-CN.md 和 CHANGELOG。
- 明确说明：skill-doctor 能读取用户提供或本机扫描到的新 JSONL 并验证；不会替用户自动创建 Desktop task，也不会拦截 WebSocket 首包。

验收：UI 文案和 CLI 输出不会把“配置文件已更新”说成“当前会话已生效”。

### P6：回归测试和人工 Desktop 验证

需要补充或调整：

- tests/context/codexControls.test.ts
- tests/context/codexContextConfig.test.ts
- tests/context/scanCodexContext.test.ts
- tests/context/scanCodexContextBlocks.test.ts
- tests/context/historyControls.test.ts
- tests/benefit/codexSessions.test.ts
- tests/benefit/estimateBenefit.test.ts
- tests/benefit/optimizationPlan.test.ts
- tests/ui/HistoryControlPanel.test.tsx
- tests/ui/HistoryBenefitSummary.test.tsx
- tests/ui/BenefitPage.test.tsx
- tests/ui/App.test.tsx

人工验证采用严格的新 task 流程：

1. 记录配置快照和目标项目路径。
2. 修改一个明确配置项。
3. 真正创建一个新的 Desktop task，等待它产生首个 session JSONL。
4. 读取新 JSONL，按真实 item metadata 判断 block 是否存在。
5. 记录 task id、session 路径、配置 digest、block status 和 parser diagnostics。
6. 必要时恢复配置，再创建第二个新 task 作为对照；不能复用原 task。

验收命令：

    npm test
    npm run typecheck:ui
    npm run build
    git diff --check

另需至少完成一次本机 Desktop A/B 对照，并把结果作为 fixture 或 evidence 文件纳入测试，而不是只保留人工口头结论。

## 8. 实施顺序和依赖

建议顺序：

    P0 类型契约
      -> P1 配置层 / P2 parser
      -> P3 控制接口
      -> P4 收益和历史证据
      -> P5 CLI/API/UI/文档
      -> P6 自动化测试与 Desktop A/B 验证

P1 和 P2 可以并行设计，但 P3 必须等待两者的字段和 evidence 语义稳定；P4、P5 不能先于 P3 修改“可控”文案。每个阶段都应先补能失败的测试，再改实现。

## 9. 不做的事情和风险控制

- 不把 /Users/evilstar/GitHub/codex 的当前实现细节硬编码成永久保证；Codex 更新后仍以新会话头为最终事实。
- 不用删除、批量覆盖或重置命令清理用户配置；保留已有 undo 和配置 digest 安全检查。
- 不修改 dist/、coverage/、node_modules/ 或用户现有无关 UI 改动。
- 不把远端推荐 plugin 列表当作本地已安装资源。
- 不把 WebSocket 一次性发送的会话头误认为可以在同一 task 内刷新。
- 如果 Desktop 宿主仍覆盖项目配置，产品应报告证据和原因，而不是继续扩大配置写入范围。

## 10. 完成标准

改造完成后，针对任意 Codex block，用户应能在一个报告中看到：

1. block 是否在真实会话头中出现；
2. 它来自哪个 session JSONL、哪个 role/item kind 和哪个原始路径；
3. 哪个配置层能写入什么字段；
4. 配置是否只写入，还是已经由新 Desktop task 验证生效；
5. 若仍存在，是项目层无效、宿主覆盖、候选补位还是没有足够证据；
6. token 成本和可确认节省分别是多少；
7. 下一次需要创建什么新 task 才能完成验证。

在达到这些标准前，任何“可以通过修改配置真实关闭”的结论都必须保持证据限定，不能由静态配置扫描自动升级。

## 11. 本轮落地结果

- `src/benefit/codexSessions.ts` 读取 `internal_chat_message_metadata_passthrough.content_item_kinds`，按真实 response item 选择 block parser，并保留 session JSONL 路径、行号、role、item kind、item index、session/task ID 和时间戳。
- `context blocks --file` 同时支持独立 header 文本和 `.jsonl`；JSONL 输出增加 `present/absent/unknown` verification。没有可信 metadata 时，文本命中不会升级为运行时证明。
- Codex 资源、控制结果、历史候选和 UI snapshot 增加 `controlStatus` / `evidenceLevel`；配置写入明确为 `configured` 或 `config-only`，不会自动冒充 `runtime-verified`。
- 离线收益仍将 `verifiedRemovableCount` 和 `verifiedRemovableTokens` 保持为 0；历史目录差值只作为潜在/假设收益，推荐候选控制明确标为配置级操作。
- 新增回归覆盖：metadata 对齐、memory 字面量标签排除、可信 absent、配置级控制状态，以及 JSONL CLI 验证。
- 最终验证：Codex 相关定向测试全部通过（包括 89 个筛选测试、JSONL CLI 2 个测试和 UI/控制/收益 63 个测试）；`npm run typecheck:ui`、`npm run build`、`git diff --check` 通过。
- `npm test` 共通过 662 个测试；14 个失败和 6 个 unhandled error 均来自当前沙箱禁止测试 mock 监听 `127.0.0.1`（`listen EPERM`），并集中造成 UI server、MCP HTTP/SSE、CLI 本地 HTTP mock 超时，未发现本次 Codex 改造相关失败。
