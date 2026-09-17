# Codex 会话头 block 配置验证报告

验证日期：2026-09-17—18（Asia/Shanghai）

验证对象：项目 `/Users/evilstar/GitHub/skill-doctor`、当前 Desktop 会话、同一版本 embedded Codex runtime，以及按要求新建的 Desktop task。

参考分析：[codex-config-to-context-blocks.md](/Users/evilstar/GitHub/codex/codex-diagnostics/codex-config-to-context-blocks.md)。

## 结论

1. `debug prompt-input` 的独立进程实测证明，`[features]` 下的推荐插件开关和根级 `include_*` 开关会改变最终 prompt；其中 `features.tool_suggest=false` 与 `features.recommended_plugins=false` 同时为 `false` 时，Core 构造的消息中没有 `<recommended_plugins>`。
2. 按要求在项目配置加入 `[skills] include_instructions=false` 后，真正新建了一个使用主项目目录的 Desktop task。新 task 的 JSONL 显示：`host_skills.instructions` 消失，`<skills_instructions>` 不再作为真实 header item 注入；但 `plugins.recommendations` 和 `<recommended_plugins>` 仍然存在。因此项目层 `skills.include_instructions=false` 在 Desktop local task 中生效，而项目层两个推荐插件 feature `false` 没有关闭推荐 block。
3. 当前项目的 `[[skills.config]] enabled=false` 也没有关闭 `<skills_instructions>` 中的对应技能。源码明确表明，技能禁用规则只从 User 和 SessionFlags 层读取，不读取 Project 层；新进程实测与此一致。
4. `<skills_instructions>` 的原始路径由 block 自己的 `Skill roots` 显式给出；具体技能条目的描述来自相应路径下的 `SKILL.md`。`<recommended_plugins>` 不是项目配置文件中的静态列表，而是插件管理器从远程推荐接口取得、过滤后渲染的结果。
5. 按用户要求改动全局 `~/.codex/config.toml` 后，连续新建并读取了 13 个 Desktop local task 的新 JSONL：`permissions/apps/collaboration/environment/AGENTS/memory/tools` 均能被对应全局配置关闭；`plugins.usage` 只能通过关闭 Plugins 功能间接消失；`recommended_plugins=false` 在 Desktop 中仍不能单独关闭推荐 block。

## 1. 现有项目配置快照

当前项目配置文件：[`.codex/config.toml`](/Users/evilstar/GitHub/skill-doctor/.codex/config.toml)。与本次验证直接相关的部分是：

```toml
[[skills.config]]
path = "/Users/evilstar/.agents/skills/huashu-design/SKILL.md"
enabled = false

[[skills.config]]
path = "/Users/evilstar/GitHub/skill-doctor/.codex/skills/scheduled-task-breakdown/SKILL.md"
enabled = false

[[skills.config]]
path = "/Users/evilstar/GitHub/skill-doctor/.codex/skills/skill-doctor-context-optimizer/SKILL.md"
enabled = false

[tool_suggest]
disabled_tools = [
  { type = "plugin", id = "app-6938a94a61d881918ef32cb999ff937c@openai-curated-remote" },
  { type = "plugin", id = "app-6a0694cbb2608191bbefb74ba810ab68@openai-curated-remote" },
  { type = "plugin", id = "app-69b2b5a768d4819190d3a86c5f12e6d9@openai-curated-remote" },
  { type = "plugin", id = "app-68de829bf7648191acd70a907364c67c@openai-curated-remote" },
  { type = "plugin", id = "app-6943a2c078b0819188de39e4fe168d9b@openai-curated-remote" },
]

[features]
tool_suggest = false
recommended_plugins = false

[skills]
include_instructions = false
```

注意：配置中还存在 `skill-creator` 的禁用项，但对应文件
`/Users/evilstar/GitHub/skill-doctor/.codex/skills/skill-creator/SKILL.md` 当前不存在；它不应被当作“被配置关闭后消失”的验证样本。

## 2. 新进程 Core 实测：哪些配置能去掉 block

每个用例都启动一个独立的 `/Applications/ChatGPT.app/Contents/Resources/codex` 进程，执行 `debug prompt-input`，再检查 JSON 输出中的消息角色和 block 标签。这里的“新”指新进程和新 prompt 构造，不是新的 Codex Desktop task：它不会出现在侧边栏，也不会重新建立 Desktop WebSocket。

| 目标 block / 行为 | 配置或覆盖项 | 新进程实测结果 | 能否从 Core prompt 中去掉 | 备注 |
|---|---|---|---|---|
| `<recommended_plugins>` | `[features] tool_suggest = false` 且 `recommended_plugins = false` | 不出现 | 可以 | 当前项目配置作为 embedded runtime 的 baseline 时成立。 |
| `<recommended_plugins>` | `[features] tool_suggest = true`，其他依赖保持开启 | 出现 | 反向验证成功 | 推荐插件 gate 是 `apps && plugins && (tool_suggest || recommended_plugins)`。 |
| `<recommended_plugins>` | `[features] recommended_plugins = true`，`tool_suggest = false` | 出现 | 反向验证成功 | 说明两个开关是 OR 关系；只关 `tool_suggest` 不够。 |
| `<recommended_plugins>` | `[features] apps = false`，并把其他 gate 开关设为 `true` | 不出现 | 可以 | 同时关闭 Apps 功能；不是只隐藏推荐列表。 |
| `<recommended_plugins>` | `[features] plugins = false`，并把其他 gate 开关设为 `true` | 不出现 | 可以 | 同时关闭插件功能；副作用比隐藏 block 大。 |
| `<skills_instructions>` | `[skills] include_instructions = false` | 不出现 | 可以 | 先用项目层新进程验证，随后保留该配置并在新的 Desktop local task 中再次验证。 |
| `<permissions instructions>` | `include_permissions_instructions = false` | 不出现 | 可以 | 根级配置，不是 `[features]` 子项。 |
| `<apps_instructions>` | `include_apps_instructions = false` | 不出现 | 可以 | 根级配置；只影响该说明 block。 |
| `<environment_context>` | `include_environment_context = false` | 不出现 | 可以 | 根级配置；`<INSTRUCTIONS>` 仍可能来自 `AGENTS.md`。 |
| `<collaboration_mode>` | `include_collaboration_mode_instructions = false` | 本次 probe 未触发该 block | 源码可控；本次未形成正反差异 | 不能把“本次没出现”误报成该开关已被实测验证；源码中的字段和条件已确认。 |
| `<tools>` | `[features] deferred_tool_world_state = false` | 本次 probe 未以该 block 为目标 | 源码可控；本次未做专门正反实验 | 这是 Deferred Tool World State 开关，不是 skills 或 plugins 开关。 |
| `<recommended_plugins>` | `[tool_suggest].disabled_tools` | block 仍可构造，只过滤候选 | 不可以 | 该项控制禁用的插件候选，不是 block 总开关。 |
| `<recommended_plugins>` | `[plugins."<id>"].enabled = false` | 不作为 block 总开关 | 不可以 | 影响具体插件状态/可用性，不改变推荐 gate。 |
| `<skills_instructions>` | 项目层 `[[skills.config]] ... enabled = false` | 对应技能仍在 baseline catalog 中 | 不可以 | 当前源码的 `skill_config_rules_from_stack` 跳过 Project 层。 |
| `<skills_instructions>` | User/SessionFlags 层 `skills.config`，按 `path` 或 `name` 设置 `enabled=false` | 对应技能从 catalog 消失 | 可以 | 用 `-c 'skills.config=[{path=".../SKILL.md",enabled=false}]'` 和按 `name` 的用例均验证成功。 |

推荐插件的最小关闭配置为：

```toml
[features]
tool_suggest = false
recommended_plugins = false
```

要关闭技能目录 block，在项目配置中加入：

```toml
[skills]
include_instructions = false
```

如果目标只是隐藏某几个技能，而不是整个 `<skills_instructions>`，应把 `skills.config` 规则放在 User/SessionFlags 生效层，并使用路径或技能名，例如：

```toml
[[skills.config]]
path = "/Users/evilstar/GitHub/skill-doctor/.codex/skills/scheduled-task-breakdown/SKILL.md"
enabled = false
```

## 3. 修改配置后新建 Desktop task 的实测

本次严格验证使用的是项目的 `local` 环境，不是 worktree，因此 task 的工作目录和配置文件是同一份：

```text
threadId: 01a0aff0-5c84-75b3-bbd6-0b90e349f142
cwd:      /Users/evilstar/GitHub/skill-doctor
config:   /Users/evilstar/GitHub/skill-doctor/.codex/config.toml
```

对应的全新会话记录是：[rollout-2026-09-17T23-16-00-01a0aff0-5c84-75b3-bbd6-0b90e349f142.jsonl](/Users/evilstar/.codex/sessions/2026/09/17/rollout-2026-09-17T23-16-00-01a0aff0-5c84-75b3-bbd6-0b90e349f142.jsonl)。该文件的 `session_meta` 记录了上述 thread ID 和主项目 `cwd`。

项目配置在创建该 task 前已经是：

```toml
[features]
tool_suggest = false
recommended_plugins = false

[skills]
include_instructions = false
```

新 task 首轮 header 的实际结果：

| 检查项 | 新 JSONL 实际证据 | 结论 |
|---|---|---|
| `[skills] include_instructions=false` | 第 3 行 developer metadata 为 `generic.developer_instructions, memories.instructions, permissions.instructions, collaboration_mode.instructions, apps.instructions, plugins.usage_instructions`，不含 `host_skills.instructions` | 生效：自动技能目录 block 已从新 Desktop header item 中去掉。 |
| `<skills_instructions>` 标签搜索 | developer 的 memory item 内可能出现该字符串作为历史说明文字，但没有 `host_skills.instructions` item；不能把普通文本引用误判为真实 block | 真实 block 不存在。 |
| `[features] tool_suggest=false` + `recommended_plugins=false` | 第 4 行 user metadata 仍含 `plugins.recommendations`，item 0 首行就是 `<recommended_plugins>` | 未生效：推荐插件 block 仍注入。 |
| `<recommended_plugins>` | 第 4 行 item 0 长度 2907，内容为插件名称和远程 plugin ID | 新 Desktop task 中真实存在。 |
| `AGENTS.md` | 第 4 行 item 1 为 `# AGENTS.md instructions for /Users/evilstar/GitHub/skill-doctor` | 项目指令仍单独注入，与 skills catalog 开关无关。 |

对比用的旧当前会话原始记录：[rollout-2026-09-17T22-29-39-01a0afc5-ef02-7d03-8477-2c0ec8200204.jsonl](/Users/evilstar/.codex/sessions/2026/09/17/rollout-2026-09-17T22-29-39-01a0afc5-ef02-7d03-8477-2c0ec8200204.jsonl)：

- 第 4 行（`ordinal=3`, `role=developer`）含 `host_skills.instructions`，内容中有 `<skills_instructions>`。
- 第 5 行（`ordinal=4`, `role=user`）含 `plugins.recommendations`，内容中有 `<recommended_plugins>`。
- 新 task 的第 3 行和第 4 行则分别给出了修改配置后的实际结果；同一个会话头只发一次，所以这次读取的是新 task 的新 WebSocket 输入，而不是旧连接的缓存。

注：在这次正确的 `local` task 之前，还创建过一个默认 `worktree` task；其 cwd 是 `/Users/evilstar/.codex/worktrees/9351/skill-doctor`，该 worktree 没有被忽略的项目 `.codex/config.toml`，因此没有用于判断主项目配置是否生效。

桌面端还存在一层 Host/SessionFlags/远程 feature override。已有桌面端静态分析显示，远程 `enable_plugins` 会映射到 `apps`、`plugins`、`recommended_plugins`；其中 `recommended_plugins` 不在请求覆盖过滤集合中，可能随默认 feature override 进入 `thread/start`。这解释了为什么项目层的 `recommended_plugins=false` 在独立 Core 测试中有效，却没有让新的 Desktop local task 会话头消失。不过，当前 JSONL 只记录了最终 prompt，没有记录本次实时 Statsig 返回值，所以不能把历史缓存中的值冒充为 2026-09-17 的实时值。参见：[codex-desktop-context-findings.md](/Users/evilstar/GitHub/codex/codex-diagnostics/codex-desktop-context-findings.md)、[codex-desktop-remote-config-inventory.md](/Users/evilstar/GitHub/codex/codex-diagnostics/codex-desktop-remote-config-inventory.md)。

## 4. 完整会话头中的原始路径与来源

### 4.1 `<skills_instructions>`

下面的 `Skill roots` 来自配置关闭前的完整 header（当前旧会话 JSONL 第 4 行）；本次新建的 local task 因 `[skills].include_instructions=false` 已没有 `host_skills.instructions`，所以不会再生成这张技能目录：

| 别名 | 原始 header 中的根路径 | 原始 header 中的用途/示例 |
|---|---|---|
| `r0` | `/Users/evilstar/GitHub/skill-doctor/.codex/skills` | 项目技能，例如 `scheduled-task-breakdown`、`skill-doctor-context-optimizer` |
| `r1` | `/Users/evilstar/.codex/skills` | 用户级技能，例如 `playwright` |
| `r2` | `/Users/evilstar/.agents/skills` | Agents 技能，例如 `huashu-design`、嵌套的 `playwright-trace` |
| `r3` | `/Users/evilstar/.codex/skills/.system` | 系统技能，例如 `imagegen` |
| `r4` | `/Users/evilstar/.codex/plugins/cache/openai-bundled` | bundled plugin 提供的技能，例如 `visualize` |
| `r5` | `/Users/evilstar/.codex/plugins/cache/openai-curated-remote` | curated remote plugin 技能，例如 `superdesign`、`plugin-management` |
| `r6` | `/Users/evilstar/.codex/plugins/cache/openai-curated-remote/product-design/0.1.55/skills` | `product-design:*` 技能 |
| `r7` | `/Users/evilstar/.codex/plugins/cache/openai-curated-remote/sites/0.1.65/skills` | `sites:*` 技能 |

配置关闭前的完整 `Skill roots` 和 `Available skills` 原文在旧当前 JSONL 第 4 行的 `host_skills.instructions` 内容中。每个条目末尾的 `(file: rN/.../SKILL.md)` 是相对上述 root 的路径；例如：

```text
imagegen             -> /Users/evilstar/.codex/skills/.system/imagegen/SKILL.md
scheduled-task-breakdown
                     -> /Users/evilstar/GitHub/skill-doctor/.codex/skills/scheduled-task-breakdown/SKILL.md
huashu-design        -> /Users/evilstar/.agents/skills/huashu-design/SKILL.md
product-design:index -> /Users/evilstar/.codex/plugins/cache/openai-curated-remote/product-design/0.1.55/skills/index/SKILL.md
sites:sites-building -> /Users/evilstar/.codex/plugins/cache/openai-curated-remote/sites/0.1.65/skills/sites-building/SKILL.md
```

源码来源链是：

```text
skill roots + effective skill outcome
  -> HostSkillProvider / skill catalog entries
  -> AvailableSkillsInstructions
  -> developer content_kind = skills.catalog
  -> host metadata kind = host_skills.instructions
  -> <skills_instructions> ... </skills_instructions>
```

实现依据：[`SkillsConfig`](/Users/evilstar/GitHub/codex/codex-rs/config/src/skills_config.rs:32) 定义 `include_instructions` 和 `config`；[`skill_config_rules_from_stack`](/Users/evilstar/GitHub/codex/codex-rs/config/src/skills_config.rs:150) 只读取 User/SessionFlags；[`HostSkillProvider`](/Users/evilstar/GitHub/codex/codex-rs/ext/skills/src/provider/host.rs:37) 从 host snapshot 生成条目；[`AvailableSkillsInstructions`](/Users/evilstar/GitHub/codex/codex-rs/ext/skills/src/fragments.rs:18) 将 catalog 渲染成 developer fragment；`include_instructions=false` 的早退条件位于 [`SkillsExtension::contribute_thread_context`](/Users/evilstar/GitHub/codex/codex-rs/ext/skills/src/extension.rs:188)。

因此：

- root 路径和技能名称/描述不是从本项目 README 生成的，而是 Host skill provider 扫描到各个 `SKILL.md` 后产生的。
- `SKILL.md` 的完整正文不会因为仅有 catalog 就自动全部进入 `<skills_instructions>`；选中的技能会以单独的 `<skill>` / `skills.selected_skill_instructions` user fragment 注入。当前会话是否有该单独 fragment，要按会话中实际的 `skill` 标签另行判断。
- 当前项目的 `[[skills.config]]` 未能隐藏对应条目，是因为它在 Project 层；这不是路径错误造成的，而是当前规则解析层级的结果。

### 4.2 `<recommended_plugins>`

新 local task JSONL 第 4 行的 metadata 是 `plugins.recommendations`，并且 block 原文是：

```text
<recommended_plugins>
Here is a list of plugins that are available but not installed.
- <plugin display name> (<plugin id>)
...
</recommended_plugins>
```

这些条目的原始来源链是：

```text
thread/session config feature gate
  -> PluginsManager::recommended_plugin_candidates_for_config
  -> authenticated GET /ps/plugins/suggested/codex?scope=GLOBAL
  -> response: id, name, display_name
  -> remove installed / disabled candidates, cap at 50
  -> RecommendedPluginsInstructions::from_plugins
  -> user content_kind = plugins.recommendations
  -> <recommended_plugins> ... </recommended_plugins>
```

实现依据：推荐 block 的格式化在 [`RecommendedPluginsInstructions::from_plugins`](/Users/evilstar/GitHub/codex/codex-rs/core/src/context/recommended_plugins_instructions.rs:15)，session 初始 context 在 [`build_initial_context_with_world_state`](/Users/evilstar/GitHub/codex/codex-rs/core/src/session/mod.rs:3976) 通过 feature gate 和候选列表决定是否 push；远程请求在 [`fetch_recommended_plugins`](/Users/evilstar/GitHub/codex/codex-rs/core-plugins/src/remote.rs:1015)，候选过滤在 [`recommended_plugin_candidates_for_config`](/Users/evilstar/GitHub/codex/codex-rs/core-plugins/src/manager.rs:1925)。

由此可确定：

- `airtable@openai-curated-remote`、`binance@openai-curated-remote` 等是远程 marketplace/plugin ID，不是本项目 `.codex/config.toml` 中的名称列表。
- 当前 JSONL 保存的是渲染后的文本和 `plugins.recommendations` 分类，不保存本次 HTTP 的原始 URL、响应 JSON 或实时 feature flag 值。
- 独立新进程把 `features.tool_suggest=true` 或 `features.recommended_plugins=true` 打开后，确实重新取得并渲染了推荐列表；该次列表与当前 Desktop header 的列表存在动态差异（例如实验结果出现过 `Booking.com`），因此该列表应视为远程、时间相关数据，而不是固定本地资产。

## 5. 其他完整会话头 block 的归属边界

| header block / 内容 | JSONL metadata kind | 能否由普通项目配置关闭 | 已验证的来源 |
|---|---|---|---|
| `<skills_instructions>` | `host_skills.instructions` | 当前项目已设置 `[skills].include_instructions=false`；新 local task 中该 metadata 不存在 | Host skill provider + `SKILL.md` roots |
| `<recommended_plugins>` | `plugins.recommendations` | Core 可由 feature gate 关闭；当前 Desktop 项目层未控制住 | 远程插件推荐接口 + PluginsManager |
| `<permissions instructions>` | `permissions.instructions` | 可以：`include_permissions_instructions=false` | Core session world state |
| `<apps_instructions>` | `apps.instructions` | 可以：`include_apps_instructions=false`，但还受 Apps 可用性影响 | Core session world state / connector 状态 |
| `<plugins_instructions>` | `plugins.usage_instructions` | 没有独立的“只隐藏说明”项目开关；关闭 `features.plugins` 会连插件功能一起关闭 | Core plugin availability + world state |
| `<environment_context>` | `environments.environment_context` | 可以：`include_environment_context=false` | 当前运行环境快照 |
| `AGENTS.md` 指令 | `agents_md.instructions` | 可以：`project_doc_max_bytes=0`；`project_doc_fallback_filenames` 只改候选文件名 | 项目路径 `/Users/evilstar/GitHub/skill-doctor/AGENTS.md` |
| Memory 使用说明 | `memories.instructions` | 可以：`[memories] use_memories=false`，或 `[features] memories=false` | Memories extension + `~/.codex/memories` |
| `<managed_developer_instructions>` | managed requirements | 不是普通项目开关 | `requirements.toml` 的 `additional_developer_instructions` |
| `<tools>` | deferred tool world state | 由 `features.deferred_tool_world_state` 控制 | Core deferred tool world state |

## 6. 可复现实验（Core 新进程，不是 Desktop 新会话）

以下命令不复用当前 WebSocket；每条命令都应作为新的进程执行，并从 JSON 输出中检查 block 标签：

```bash
/Applications/ChatGPT.app/Contents/Resources/codex debug prompt-input 'probe'

/Applications/ChatGPT.app/Contents/Resources/codex debug prompt-input 'probe' \
  -c 'skills.include_instructions=false'

/Applications/ChatGPT.app/Contents/Resources/codex debug prompt-input 'probe' \
  -c 'features.tool_suggest=true'

/Applications/ChatGPT.app/Contents/Resources/codex debug prompt-input 'probe' \
  -c 'include_permissions_instructions=false'
```

本次使用的 runtime 版本：

```text
/Applications/ChatGPT.app/Contents/Resources/codex -> codex-cli 0.154.0-alpha.6.2
/Applications/ChatGPT.app -> 26.908.70816 (CFBundleShortVersionString)
```

## 7. 证据边界

- 会话 JSONL 是最终会话输入的强证据：它能证明某个 block 实际存在、所在 role、content item kind 和渲染后的内容。
- Core 新进程实验是配置行为的直接证据：它能证明某个配置是否改变 Core 生成的 prompt。
- 源码是来源链和条件判断的证据；本报告使用 AST 符号定位后，再核对了函数体和调用链。
- 当前 JSONL 没有记录 Desktop 本次实时远程配置的原始响应，因此“Desktop 为什么覆盖项目层”的远程 feature 值只能报告为已发现的覆盖路径，不能声称已捕获本次实时 Statsig 网络响应。
- 本次已经执行“修改项目配置 → 新建 Desktop task → 重新读取新 WebSocket 会话头”的 post-change 验证；本节又执行了“修改全局配置 → 连续新建 Desktop local task → 按 thread ID 读取新 JSONL”的验证。全局配置实验结束后已恢复原文件 SHA-256：`b5f5257a7ddf90af0094a00a7fd46933d76fb8f19b024c0809ccd240d458f151`。
- 本次按用户要求修改并保留了 `/Users/evilstar/GitHub/skill-doctor/.codex/config.toml` 中的 `[skills] include_instructions=false`；没有改动工作树中已有的 UI 文件。

## 8. 为什么 fork/paginated 会话文件看起来没有 memory 和推荐插件

指定文件：[rollout-2026-09-17T23-37-52-01a0b004-6261-7f11-be91-9973bf7a7ee9.jsonl](/Users/evilstar/.codex/sessions/2026/09/17/rollout-2026-09-17T23-37-52-01a0b004-6261-7f11-be91-9973bf7a7ee9.jsonl) 不是一个从 ordinal 0 开始的完整 prompt 快照。它的第 1 行 `session_meta` 明确记录：

```text
session_id:                   01a0b004-6261-7f11-be91-9973bf7a7ee9
forked_from_id:               01a0afc5-ef02-7d03-8477-2c0ec8200204
forked_from_ordinal_exclusive: 1160
history_mode:                 paginated
history_base.end_ordinal_exclusive: 1160
```

所以该文件记录的是父会话 ordinal 1160 之后的增量，不会把父会话开头已经发送过的 header 再复制一遍。父会话的初始 header 位于：[rollout-2026-09-17T22-29-39-01a0afc5-ef02-7d03-8477-2c0ec8200204.jsonl](/Users/evilstar/.codex/sessions/2026/09/17/rollout-2026-09-17T22-29-39-01a0afc5-ef02-7d03-8477-2c0ec8200204.jsonl)：

- 第 3 行的 `content_item_kinds` 含 `memories.instructions` 和完整的 `host_skills.instructions`。
- 第 4 行的 `content_item_kinds` 含 `plugins.recommendations`，其中有完整的 `<recommended_plugins>`。

指定文件当前轮实际只产生了这些相关增量：

| 文件中的 ordinal | kind / 内容 | 含义 |
|---|---|---|
| 1164 | `host_skills.instructions`，正文为 `Host skills update` | `[skills].include_instructions=false` 后的短状态更新，不是完整技能目录。 |
| 1166 | `skills.instructions`、`orchestrator_skills.instructions` | 说明当前环境技能目录没有自动列出。 |
| 1167 | `world_state`：`host_skills.body=null`、`includeInstructions=false`、`skills.includeInstructions=false` | 直接证明当前技能 catalog 被关闭。 |
| 当前轮 | 没有 `memories.instructions`，没有 `plugins.recommendations` | 这两个 block 没有在本次增量中重新注入，不等于已从继承的会话历史中删除。 |

因此，`memory` 和 `recommended_plugins` “没了”的主要原因是：

1. 该 JSONL 是 fork + paginated history 的增量记录，不是完整会话头；
2. memory 和推荐插件属于早先 header 的一次性输入，不会在每轮 WebSocket 增量中重复发送；
3. 当前 `<skills_instructions>` 的简短 update 则是项目配置关闭 catalog 后的状态同步；它不是原来的技能列表。

这个文件本身不能证明继承的历史是否被服务器端完整保留；若要证明每一次实际发出的 WebSocket request 都包含哪些历史输入，需要抓取原始 WebSocket request/previous-response 链，而不能只把 paginated rollout 文件当作完整 wire payload。

## 9. 全局 `~/.codex/config.toml` 的 Desktop 新 task 实测

### 9.1 验证方法

每次实验都按同一顺序执行：

1. 临时修改 `/Users/evilstar/.codex/config.toml`；
2. 用 `create_thread` 创建真正的 Desktop `local` task，项目仍是 `/Users/evilstar/GitHub/skill-doctor`；
3. 等待该 task 完成；
4. 用 thread ID 在 `/Users/evilstar/.codex/sessions/2026/09/18/` 中定位新 JSONL；
5. 同时检查首轮 `response_item` 的 `content_item_kinds`、首个 `world_state` 的 state keys 和实际标签；
6. 实验结束后将全局配置恢复到实验前的 SHA-256。

项目层的 `[features] tool_suggest=false`、`recommended_plugins=false` 和 `[skills] include_instructions=false` 在实验期间保持不变；因此推荐插件和技能的结果同时记录了 Desktop 的层级覆盖行为。

### 9.2 真实 Desktop task 与新 JSONL

| task | 新 JSONL | 实验配置 | 关键结果 |
|---|---|---|---|
| `01a0b018-b789-7e61-8a09-2385b0d31bbb` | [00-00-05 JSONL](/Users/evilstar/.codex/sessions/2026/09/18/rollout-2026-09-18T00-00-05-01a0b018-b789-7e61-8a09-2385b0d31bbb.jsonl) | 4 个根 `include_*` 为 `false`；`apps/plugins/memories/deferred_tool_world_state` 为 `false` | 首轮只剩 `generic.developer_instructions` 和 `agents_md.instructions` |
| `01a0b019-f239-7131-abbf-8df02f2c70cd` | [00-01-25 JSONL](/Users/evilstar/.codex/sessions/2026/09/18/rollout-2026-09-18T00-01-25-01a0b019-f239-7131-abbf-8df02f2c70cd.jsonl) | 4 个根 `include_*` 为 `false`；`apps/plugins` 为 `true`；`memories.use_memories=true` | `memories.instructions`、`plugins.usage_instructions`、`plugins.recommendations` 仍存在；permissions/apps/collaboration/environment 已消失 |
| `01a0b01a-b864-7793-9735-4021dd244f97` | [00-02-16 JSONL](/Users/evilstar/.codex/sessions/2026/09/18/rollout-2026-09-18T00-02-16-01a0b01a-b864-7793-9735-4021dd244f97.jsonl) | `[features] plugins=false` | `plugins.usage_instructions` 和 `plugins.recommendations` 消失 |
| `01a0b01b-4ff0-7492-8844-1b4cac81a116` | [00-02-55 JSONL](/Users/evilstar/.codex/sessions/2026/09/18/rollout-2026-09-18T00-02-55-01a0b01b-4ff0-7492-8844-1b4cac81a116.jsonl) | `include_apps_instructions=true`，但 `[features] apps=false` | `apps.instructions` 消失，`plugins.usage_instructions` 仍存在 |
| `01a0b01c-2131-77f1-8dc2-66b98042d158` | [00-03-48 JSONL](/Users/evilstar/.codex/sessions/2026/09/18/rollout-2026-09-18T00-03-48-01a0b01c-2131-77f1-8dc2-66b98042d158.jsonl) | `[features] deferred_tool_world_state=true` | 出现 `tools.deferred_namespaces` 和 `<tools>` |
| `01a0b01c-a2a4-72e3-b0c5-2409fb100a6f` | [00-04-21 JSONL](/Users/evilstar/.codex/sessions/2026/09/18/rollout-2026-09-18T00-04-21-01a0b01c-a2a4-72e3-b0c5-2409fb100a6f.jsonl) | `[features] deferred_tool_world_state=false` | `tools.deferred_namespaces` 和 `<tools>` 均消失 |
| `01a0b01d-301b-7b20-8cb2-fde5eb90790c` | [00-04-58 JSONL](/Users/evilstar/.codex/sessions/2026/09/18/rollout-2026-09-18T00-04-58-01a0b01d-301b-7b20-8cb2-fde5eb90790c.jsonl) | `[memories] use_memories=false` | `memories.instructions` 消失 |
| `01a0b01e-9a72-7832-b459-cca52b97db1d` | [00-06-30 JSONL](/Users/evilstar/.codex/sessions/2026/09/18/rollout-2026-09-18T00-06-30-01a0b01e-9a72-7832-b459-cca52b97db1d.jsonl) | `project_doc_max_bytes=0` | `agents_md.instructions` 消失，`world_state.agents_md` 为空 |
| `01a0b01f-a3a5-7322-93af-00f60b6d5997` | [00-07-38 JSONL](/Users/evilstar/.codex/sessions/2026/09/18/rollout-2026-09-18T00-07-38-01a0b01f-a3a5-7322-93af-00f60b6d5997.jsonl) | `[features] memories=false` 且 `memories.use_memories=true` | `memories.instructions` 消失，证明 feature gate 也生效 |
| `01a0b024-8724-7590-8d68-d11cc1accdcb` | [00-12-59 JSONL](/Users/evilstar/.codex/sessions/2026/09/18/rollout-2026-09-18T00-12-59-01a0b024-8724-7590-8d68-d11cc1accdcb.jsonl) | 仅 `include_permissions_instructions=false` | 只有 `permissions.instructions` 消失，其他根 block 保持开启 |
| `01a0b024-e5d2-7833-8684-6f7097726669` | [00-13-23 JSONL](/Users/evilstar/.codex/sessions/2026/09/18/rollout-2026-09-18T00-13-23-01a0b024-e5d2-7833-8684-6f7097726669.jsonl) | 仅 `include_apps_instructions=false` | 只有 `apps.instructions` 消失，其他根 block 保持开启 |
| `01a0b025-3e80-7f42-9063-534e42da25d1` | [00-13-46 JSONL](/Users/evilstar/.codex/sessions/2026/09/18/rollout-2026-09-18T00-13-46-01a0b025-3e80-7f42-9063-534e42da25d1.jsonl) | 仅 `include_collaboration_mode_instructions=false` | 只有 `collaboration_mode.instructions` 消失 |
| `01a0b025-9236-7331-ad62-a1748c82ef2f` | [00-14-07 JSONL](/Users/evilstar/.codex/sessions/2026/09/18/rollout-2026-09-18T00-14-07-01a0b025-9236-7331-ad62-a1748c82ef2f.jsonl) | 仅 `include_environment_context=false` | 只有 `environments.environment_context` 消失 |

### 9.3 可关闭项与准确配置

| block / 子元素 | `~/.codex/config.toml` 配置 | Desktop 新 task 结论 | 副作用 / 边界 |
|---|---|---|---|
| `<permissions instructions>` | `include_permissions_instructions = false` | 可以关闭；单变量 task `01a0b024` 的首轮 metadata 没有 `permissions.instructions`，而 `collaboration/apps/plugins/environment` 仍在 | `approved_command_prefixes` 仍可能作为内部 world-state 快照保留；它不是完整 permissions prompt |
| `<apps_instructions>` | `include_apps_instructions = false` | 可以关闭；单变量 task `01a0b024-e5d2` 只去掉 `apps.instructions`；另有 `[features] apps = false` 的功能 gate | `apps=false` 会同时禁用 Apps，而不是只隐藏说明 |
| `<collaboration_mode>` | `include_collaboration_mode_instructions = false` | 可以关闭；单变量 task `01a0b025-3e80` 只去掉 `collaboration_mode.instructions` | 只隐藏协作模式说明，不等于关闭所有 multi-agent 功能 |
| `<environment_context>` 与 `environments.instructions` | `include_environment_context = false` | 可以关闭；单变量 task `01a0b025-9236` 的首轮没有 `environments.environment_context`，state 也没有环境快照 | JSONL 的内部 `turn_context` 仍可记录 cwd/date/timezone；那不是发给模型的该 block |
| `<tools>` / `tools.deferred_namespaces` | `[features] deferred_tool_world_state = false` | 可以关闭；`true` 的 `01a0b01c-2131` 出现，`false` 的 `01a0b01c-a2a4` 消失 | 只控制 deferred namespace 的上下文描述，不关闭工具本身 |
| `memories.instructions` | `[memories] use_memories = false`，或 `[features] memories = false` | 可以关闭；两个独立新 task 均未出现该 kind | `generate_memories=false` 主要控制生成/存储，不是这个 read-context block 的总开关；`dedicated_tools` 只控制专用 memory tools |
| `agents_md.instructions` | `project_doc_max_bytes = 0` | 可以关闭项目 `AGENTS.md`；`01a0b01e` 首轮无该 kind | 只限制 project docs；不会关闭 Desktop 通用 developer instructions 或用户显式 instructions |
| `<plugins_instructions>` / `plugins.usage_instructions` | 没有独立的 hide-only key；`[features] plugins = false` | 可通过 Plugins feature gate 关闭；`01a0b01a` 已验证 | 会同时禁用 Plugins 功能 |
| `<recommended_plugins>` / `plugins.recommendations` | `tool_suggest=false` + `recommended_plugins=false` | 在 Desktop 中不能单独关闭：`01a0b019` 仍有该 kind；Apps/Plugins 都关时才随功能 gate 消失 | Core 独立进程支持这两个 gate，但 Desktop host/session 层仍注入推荐列表；关闭 Apps 或 Plugins 是有副作用的间接办法 |
| `<skills_instructions>` / `host_skills.instructions` | `[skills] include_instructions = false` | 可以关闭；上一轮真实 local task 已验证，当前项目配置仍保留该设置 | `skills.config.enabled=false` 只能在 User/SessionFlags 层可靠禁用单个技能；Project 层规则不生效 |

可直接用于关闭 Core 可控 prompt block 的配置形态是：

```toml
include_permissions_instructions = false
include_apps_instructions = false
include_collaboration_mode_instructions = false
include_environment_context = false
project_doc_max_bytes = 0

[features]
memories = false
deferred_tool_world_state = false

[memories]
use_memories = false
```

其中 `memories=false` 和 `memories.use_memories=false` 二选一即可；`apps=false`、`plugins=false` 可以进一步去掉 Apps/Plugins 相关 block，但它们是功能总开关，不建议仅为节省 prompt 而设置。`recommended_plugins=false` 在当前 Desktop 运行链上不能作为可靠的单独关闭项。

### 9.4 源码对应关系

- 4 个根级 block 字段的 TOML 定义在 [`ConfigToml`](/Users/evilstar/GitHub/codex/codex-rs/config/src/config_toml.rs:237)，默认值和生效配置构造在 [`load_config_with_layer_stack`](/Users/evilstar/GitHub/codex/codex-rs/core/src/config/mod.rs:3925)；实际渲染条件在 [`build_world_state_for_step`](/Users/evilstar/GitHub/codex/codex-rs/core/src/session/world_state.rs:166)。
- Apps、Plugins、Deferred Tools 的实际条件分别在 [`world_state.rs`](/Users/evilstar/GitHub/codex/codex-rs/core/src/session/world_state.rs:257) 和 [`Feature::plugin_recommendations_enabled`](/Users/evilstar/GitHub/codex/codex-rs/features/src/lib.rs:496)。
- Memory extension 只有在 `features.memories && memories.use_memories` 时贡献 `memories.instructions`，见 [`ext/memories/extension.rs`](/Users/evilstar/GitHub/codex/codex-rs/ext/memories/src/extension.rs:43)。
- `project_doc_max_bytes=0` 在读取 project docs 时直接返回空结果，见 [`agents_md.rs`](/Users/evilstar/GitHub/codex/codex-rs/core/src/agents_md.rs:65) 和对应的零字节测试 [`agents_md_tests.rs`](/Users/evilstar/GitHub/codex/codex-rs/core/src/agents_md_tests.rs:1089)。
- `host_skills`/`skills` 的自动目录受 [`SkillsConfig`](/Users/evilstar/GitHub/codex/codex-rs/config/src/skills_config.rs:30) 的 `include_instructions` 控制；技能来源和单个技能规则仍需按前文的层级说明判断。
