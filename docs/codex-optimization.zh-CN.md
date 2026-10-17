# Codex 优化与上下文成本估算

[English](codex-optimization.md) | [中文](codex-optimization.zh-CN.md)

本文集中说明 Codex 专项优化流程及其证据边界；命令参数见[命令参考](README.zh-CN.md)。

## Codex 优化建议

运行 `skill-doctor ui`，选择 Codex 后点击 **优化建议**：看会话开销 → 选择优化 → 验证效果。
页面默认汇总本月全部任务，也可切换本周；明细最多列出 20 条但总量不截断。大字展示周期累计预计节省的 Token 与 API 等价金额，旁边小字显示所选会话首轮估算、周期 turn 数和响应数。费用默认按价格表中最高价模型估算，另有低调的“按实际使用模型”切换。累计按每条响应的目标文本与缓存边界计算；压缩、缺失上下文或价格会明确标注覆盖缺口，不简单按 turn 数相乘。

- 隐藏自动技能目录：项目配置 `skills.include_instructions = false`。
- 停止注入记忆：用户配置 `memories.use_memories = false`，需确认全局影响。
- 完全关闭 Plugins：用户配置 `features.plugins = false`，新 task 中会同时移除 `plugins.usage_instructions` 和 `plugins.recommendations`；插件工具与技能发现也会关闭。

开关已在 Desktop `0.154.0-alpha.6.2` 验证；其他可识别版本提示需要新会话确认，不再因版本号变化直接锁住操作。关闭操作需要完整初始会话头；已关闭项提供「重新开启」，不要求已移除的 block 仍出现在日志中。
配置写入后显示「待验证」，需手动新建 Desktop task，再读取其 JSONL 检查目标是否消失或恢复。
支持只恢复本次目标键的撤销；缺失用量或价格不虚构数字，美元金额不代表订阅账单或保证节省。
单个技能和推荐插件块的独立关闭尚未可靠确认，页面不提供相应按钮；Plugins 选项是整个功能开关，不是只隐藏推荐列表。

### 旧版历史配置写入工具

**注意：** 以下旧命令只能证明配置被写入，不能证明 Desktop 会话头已移除目标。
调查中项目级单技能规则与推荐插件开关未生效。请优先使用上面的已验证流程，勿把写入成功当作收益。

旧流程提供历史证据、配置写入预览、确认与撤销，不卸载插件、不修改用户级配置。

```sh
# 在目标项目目录执行，报告不要上传或提交
skill-doctor benefit --json --output /tmp/project-benefit.json
skill-doctor context control --report /tmp/project-benefit.json --kind recommended_plugins --id 'figma@openai-curated-remote' --action disable
skill-doctor context control --report /tmp/project-benefit.json --kind recommendations --id recommended_plugins --action disable
# 确认预览后，重复对应命令并追加 --confirm <digest>
skill-doctor context control --undo <operation-id> --confirm <operation-id>
```

Skill 使用 `--kind skills_instructions --id '<目录中的Skill名称>'`。ID 来自报告
`historyAnalysis.usageProfile`。`--action enable` 显式开启，不等于精确撤销；逐项
开启不会重开已关闭的整块推荐。配置格式不支持、来源未验证或预览过期时拒绝修改。
备份在 `.codex/skill-doctor-operations/`，包含私人配置，请勿提交；撤销遇后续修改
会拒绝覆盖。需要受信任项目和新会话验证，写入成功不等于已经节省 Token。

页面提供 Agent 驱动提示词。已有 `skill-doctor-context-optimizer` 技能新增 `history`、
`history-control`、`history-undo` 入口，要求先输出完整证据报告，再等待用户确认。
CLI 帮助必须包含 `context control`；旧版本不能用禁用已安装插件的命令代替。

## `benefit`（Codex 历史收益预估）

[查看浏览器实操图解：方案输入、结果解读、模型筛选与导出](zh-CN/pages/manual.html#benefit)。图解包含真实项目截图及本次无法估算收益的原因。

将 Skill Doctor 优化方案与当前项目最近的 Codex rollout JSONL 会话对齐，预估
输入 Token、总 Token 和等价 API 费用的变化。分析在本机完成，不重新执行 Codex，
也不修改 Codex 配置，更不能把结果当作订阅账单下降。

```bash
skill-doctor benefit --project . --since 24h --limit 20
skill-doctor benefit --project . --since 24h --limit 20 --plan <plan-id>
skill-doctor benefit --project . --since 7d --limit 50 --plan <plan-id> --format json --output benefit.json
skill-doctor benefit --project . --since 24h --plan <plan-id> --tokenizer openai --tokenizer-model gpt-4o --format html --output benefit.html
skill-doctor benefit --project . --include-archived --price-table ./prices.json
skill-doctor benefit --project . --retention-days 30
skill-doctor benefit --project . --delete-index --json
skill-doctor benefit --project . --delete-index-entry /path/to/rollout.jsonl --json
```

报告会分开展示历史输入、缓存读写、输出和推理用量。资源方案默认推荐“持续上下文扣减”，
另提供“历史缓存比例延续”和“缓存重建敏感性”费用情景、模型价格覆盖率、跳过会话原因，以及响应对应的
JSONL 文件和行号。没有匹配方案时仍会输出历史基线，但不会虚构预计节省。

历史上下文归因只保留可恢复的源文件/行号和正文 hash；增量索引不保存 AGENTS 或
Skill 正文，命中索引但需要文本重建时会从本机 rollout 重新读取。宿主 Skill 清单被
截断、重复或缺少完整性证据时，结果保持“证据不足”，不会把缺失条目当成已删除。

如果方案带有明确的资源选择，预计结果会从匹配到的历史上下文快照中重建优化前后
文本，并用 tokenizer 计算实际差值；未匹配响应保持不变。没有逐资源证据的方案才会
使用 Optimizer 静态估算的比例模拟。两条路径都默认保持输出、推理、工具调用、重试、
压缩、质量和耗时不变。金额只是等价 API 价格估算，不是 Codex 或 ChatGPT 订阅账单。

持续上下文不是只计首次发送：若移除的 Skill 目录描述差额为 `d`，并在 `N` 条响应的
有效上下文中都存在，累计输入节省为 `d × N`（每条仍受实测输入上限约束）。WebSocket
后续不再传递同一段文本，不代表该段不参与模型输入计费。压缩失效或没有可恢复上下文
的响应不外推。tokenizer 保留原文空白；默认编码仍是近似值，不等于服务端精确分词。

推荐情景假设被精简片段属于缓存前缀：每条响应优先扣实测缓存读取量，其次缓存写入，
余量扣普通输入；首轮无缓存时全部扣普通输入。总输入已包含缓存，不再重复加减。
费用按 `普通输入 × 单价 + 缓存读取 × 单价 + 缓存写入 × 单价 + 输出 × 单价` 计算。
这是归属假设，不是逐 Skill 缓存命中证据，也不假设首次请求必然产生额外缓存写入费。
例如每轮少 100 Token、共 10 轮，输入减少 1,000 Token；若首轮未缓存、后九轮命中，
费用节省为 `100 × 普通输入单价 + 900 × 缓存读取单价`，而非 1,000 Token 全按普通价。
禁用 Skill 不自动删除历史上已经加载的正文或工具结果；当前仅模拟可识别的目录描述。


`--tokenizer approx` 只适合快速进行 chars/4 近似比较；报告会记录 tokenizer、模型和
fallback。`--format html` 输出静态、已转义且脱敏的预览；`--format json --redact` 输出
适合分享的脱敏 JSON，默认 JSON 则保留本地追溯字段，便于本地复算。
本地增量索引只保存必要元数据；需要删除这份可重建索引时，显式使用 `--delete-index`。
也可以用 `--retention-days N` 清理超过 N 天的索引元数据，或用 `--delete-index-entry` 删除单个源文件对应的索引记录；这些操作只删除 Skill Doctor 自有索引，不删除 Codex 会话文件。

自定义价格表中的每个模型必须声明 `maxInputTokens` 或 `inputTiers`；没有明确长上下文
适用范围的金额会显示为不可估，但 Token 指标仍会保留。UI 收益分析使用可取消的本地
job，并通过 SSE 展示读取、解析/关联、方案校验和模拟阶段。

Codex 控制能力：

| 资源 | 成本预览 | 自动启用/禁用 | 写入位置 |
|------|----------|---------------|----------|
| Skills | Codex UI 使用历史初始会话头中的真实目录；CLI cost 仍为静态元数据估算 | 不支持项目级单技能控制 | Codex 不读取项目层 `skills.config` 禁用规则；单技能需在 User/SessionFlags 层管理 |
| MCP servers | server 配置，以及可访问时的 live `tools/list` | 仅配置；需新任务验证 | `[mcp_servers.<name>] enabled` |
| MCP tools | 可控 MCP server 下的单个 live tool | 仅配置；需新任务验证 | `[mcp_servers.<name>]` 的 `enabled_tools` / `disabled_tools` |
| Plugins | plugin 提供的 skills 和 MCP tools | 仅配置；需新任务验证 | `[plugins."<id>"] enabled` |
| `AGENTS.md` 文件 | 项目和用户空间 always-on 指导文件 | 不支持 | 标记为 `unsupported`；需要手动编辑或移动文件 |
| Memories | memory 存在状态，以及可近似读取时的文本 | 不支持 | 标记为 `memory-context-unknown`；需要手动改 Codex memory 设置/配置 |

`context enable|disable` 只写入配置中的项目级 Codex 控制文件，通常是 `.codex/config.toml`；它不会编辑全局 `~/.codex/config.toml`、plugin manifest、skill 文件、`AGENTS.md` 或 memory 存储。结果会区分 `changed`/`controlStatus: configured` 与运行时验证，并返回 `requiresNewSession: true`。请新建 Codex task 或重启 Codex 后，用 `skill-doctor context blocks --file <新会话.jsonl> --json` 检查 `verification` 和 provenance，再判断会话头是否真的移除。

所有 Agent 的上下文页面默认进入“当前占用”。Codex 从当前项目最近 20 个本地历史会话的可信 `host_skills.instructions` / `<skills_instructions>` 初始会话头中展示技能名称、描述、目录路径和 block Token 估算，可切换会话查看。没有历史或只有继承／不完整会话头时显示未知，不用磁盘技能清单替代实际观察。这些是历史证据，不代表实时上下文或技能已被调用。页面提供进入“优化建议”的引导；隐藏整个自动技能目录的能力仍然保留，与禁用单个技能不同。

估算限制：

- token 估算默认使用 OpenAI tokenizer（`--tokenizer openai --tokenizer-model gpt-4o`），报告会显示 tokenizer 元数据。需要旧版 `chars / 4` 估算时使用 `--tokenizer approx`。非 OpenAI agent 的数字仍是预算估算，不代表对应平台的官方计费。
- live MCP 检查依赖当前 server 可访问，并且 `tools/list` 返回的工具与之后 Codex runtime 看到的一致。
- runtime dynamic context 仍可能在启动后增加或减少 instructions、tool schemas、memories 或 plugin 内容。
- Memories 可能显示为 `memory-context-unknown`，因为 Codex memory storage 会影响未来会话，但不一定暴露可确定的注入文本给 preview。





## 延伸阅读

- [命令参考](README.zh-CN.md)，查看命令参数与用法。
- [中文交互式手册](https://evilstar2016.github.io/skill-doctor/zh-CN/pages/manual.html)。
- [平台支持与验证范围](platform-support.zh-CN.md)。
- [English guide](codex-optimization.md).
