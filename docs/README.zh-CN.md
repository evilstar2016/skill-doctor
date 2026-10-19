# skill-doctor 使用说明

<p align="center">
  <img src="../assets/brand/skill-doctor-logo.svg" alt="Skill Doctor" width="360">
</p>

<p align="center">
  <a href="./README.md"><strong>📗 English</strong></a>
</p>

> 👉 想看图看效果？打开 **[中文图文使用手册（HTML）](https://evilstar2016.github.io/skill-doctor/zh-CN/pages/manual.html)** —— 每个命令都有真实终端截图和界面走查。

按实际操作流程查看图文手册，可浏览[中文手册目录](manuals/README.zh-CN.md)。

> `skill-doctor` 是一个本地 CLI 工具，用于审计 AI 编码助手（Claude Code / Codex / Copilot / Cursor / WorkBuddy / InfCode 等）安装的「技能（skill）」：重复、冲突、安全风险与上下文成本。所有命令都支持 `--json` 输出，便于接入 CI。

本说明文档与图文并茂的 **[中文使用手册（HTML）](https://evilstar2016.github.io/skill-doctor/zh-CN/pages/manual.html)** 内容类似：每个命令都覆盖 **使用场景 / 使用方式 / 使用效果** 三块。

**约定**：`--scope project` 只看当前仓库、避免扫到全局；`--json` 输出机器可读结果便于 CI。手册与示例均在一个含 1 个重复技能的示例项目里运行，所以多处会出现 `data-exporter 有 2 份` 的现象。

---

## 命令总览

| 命令 | 用途 |
| --- | --- |
| `install` / 运行 | 安装 CLI 并查看版本 |
| `--help` | 查看全部命令与参数 |
| `scan` | 盘点已安装的技能 |
| `show <name>` | 查看单个技能详情 |
| `conflicts` | 检测重复与冲突 |
| `audit` | 安全审计 |
| `check` | 一键健康门禁（CI 首选） |
| `cleanup` | 清理重复技能 |
| `cost` / `context` | 估算上下文成本 |
| `benefit` | 基于 Codex 历史估算优化收益 |
| `diff <a> <b>` | 对比两个技能 |
| `ui` | 启动 Web 仪表盘 |
| `dashboard` | 生成静态总览报告 |
| `install` / `uninstall` | 安装与卸载技能 |
| `center` | 统一技能中心 |
| `config` | 配置分析 / 嵌入模型 |

---

## 安装与运行

- **使用场景**
  - `skill-doctor` 是本地 CLI，安装后即可在任意项目目录里使用。
- **使用方式**
  ```bash
  npm i -g @evilstar2025/skill-doctor
  npx @evilstar2025/skill-doctor <cmd>   # 不安装，临时运行
  skill-doctor --version                 # 查看版本
  ```
- **常用参数**
  | 参数 | 说明 |
  | --- | --- |
  | `npm i -g @evilstar2025/skill-doctor` | 全局安装，之后直接用 `skill-doctor` 命令。 |
  | `npx @evilstar2025/skill-doctor <cmd>` | 不安装，临时运行某条命令。 |
  | `skill-doctor --version` | 查看版本号。 |
- **说明**
  - 需要 Node.js ≥ 20。所有命令都可加 `--json` 输出机器可读结果，便于接入 CI。

## WorkBuddy 快速开始

- **使用场景**
  - WorkBuddy 用户可以只检查平台自己的 Skills 与上下文成本，不必先扫描其它 Agent 平台。
- **使用方式**
  ```bash
  npx @evilstar2025/skill-doctor@0.7.0 scan --platform workbuddy
  npx @evilstar2025/skill-doctor@0.7.0 cost --platform workbuddy
  ```
- **说明**
  - 命令会读取本地 WorkBuddy Skills、长期上下文文件和静态 MCP 配置；没有证据时不会把动态连接器状态当成已启用资源。

## InfCode 快速开始

- **使用场景**
  - InfCode 用户可以只检查平台自己的 Skills、Rules 与上下文成本，不必先扫描其它 Agent 平台。
- **使用方式**
  ```bash
  npx @evilstar2025/skill-doctor@0.7.0 scan --platform infcode
  npx @evilstar2025/skill-doctor@0.7.0 cost --platform infcode
  ```
- **说明**
  - 命令会读取本地 InfCode Skills、Rules 和项目 MCP 配置。

---

## `--help` — 总览

- **使用场景**
  - 第一次使用或忘记子命令/参数时，先看帮助——它列出全部命令与可选项，是最常用的「目录」。
- **使用方式**
  ```bash
  skill-doctor --help
  ```
- **常用参数**
  | 参数 | 说明 |
  | --- | --- |
  | `-h / --help` | 对任意子命令也有效，例如 `skill-doctor conflicts --help`。 |
  | `-v / --version` | 仅打印版本号。 |

---

## `scan` — 盘点已安装的技能

- **使用场景**
  - 想知道「当前项目到底装了哪些 skill、分布在哪些平台、有没有重复或冲突」时，先跑 `scan`。它是所有后续诊断的起点。
- **使用方式**
  ```bash
  skill-doctor scan --scope project
  ```
- **常用参数**
  | 参数 | 说明 |
  | --- | --- |
  | `--scope project\|global\|all` | 扫描范围；默认 `all`。示例用 `project` 只看当前仓库。 |
  | `--group` | 用模型把技能按主题分组（需配置分析模型）。 |
  | `--strategy token\|embedding` | 冲突检测策略；默认 `token`（本地、离线）。 |
  | `--report [path]` | 额外导出一个可视化 HTML 报告。 |
  | `--json` | 输出结构化 JSON，便于脚本处理。 |
- **说明**
  - `scan` 会列出各平台的技能并标注重复；`--report` 会写出 `scan-report.html`（本仓库 `docs/pages/scan-report.sample.html` 为真实样例）。

---

## `show <name>` — 查看单个技能详情

- **使用场景**
  - 扫出一堆技能后，想深挖某一个：来源路径、描述、触发条件，以及语义相近的其它技能。
- **使用方式**
  ```bash
  skill-doctor show data-exporter
  ```
- **常用参数**
  | 参数 | 说明 |
  | --- | --- |
  | `<name>` | 技能名（必填），例如 `data-exporter`。 |
  | `--json` | 输出结构化 JSON。 |
- **说明**
  - `RELATED SKILLS` 会给出与同名技能相似度，是重复/冲突排查的线索。

---

## `conflicts` — 检测重复与冲突

- **使用场景**
  - 当怀疑不同平台/目录里藏着同名或高度雷同的技能（会互相覆盖、浪费上下文），用 `conflicts` 找出它们并给出「删哪份、留哪份」的建议。
- **使用方式**
  ```bash
  skill-doctor conflicts --scope project
  ```
- **常用参数**
  | 参数 | 说明 |
  | --- | --- |
  | `--scope project\|global\|all` | 扫描范围，默认 `all`。 |
  | `--kind duplicate\|conflict\|all` | 只关注某一类；`duplicate`=完全同名，`conflict`=语义雷同。 |
  | `--fail-on high\|med\|low` | 达到阈值则以退出码 1 失败，用于 CI 卡点。 |
  | `--limit N` | 最多显示 N 条。 |
  | `--strategy / --threshold / --embedding-model` | 同 `scan`，控制检测精度。 |
- **说明**
  - 在 CI 里加 `--fail-on high` 即可把「出现重复」变成构建失败。

---

## `audit` — 安全审计

- **使用场景**
  - 把技能交付团队或 CI 之前，想知道有没有明显安全风险（危险 shell 指令、可疑网络调用等）。不带 `--ai` 时走本地规则，零配置即可用。
- **使用方式**
  ```bash
  skill-doctor audit --scope project
  ```
- **常用参数**
  | 参数 | 说明 |
  | --- | --- |
  | `--scope project\|global\|all` | 扫描范围，默认 `all`。 |
  | `--severity high\|med\|low` | 只显示 ≥ 该级别的问题。 |
  | `--ai` | 调用分析模型做增强扫描（需先 `config set analysis`）。 |
  | `--no-cache` | 忽略 AI 审计缓存，重新分析。 |
  | `--report [path]` | 导出可视化 HTML 审计报告。 |

---

## `check` — 一键健康门禁（CI 首选）

- **使用场景**
  - 在 CI / pre-commit 里用一条命令同时检查安全风险、技能冲突、上下文是否超预算，并给出 pass/fail 与退出码。比分别跑 `audit`+`conflicts`+`cost` 更省事。
- **使用方式**
  ```bash
  skill-doctor check --scope project --fail-on high
  ```
- **常用参数**
  | 参数 | 说明 |
  | --- | --- |
  | `--scope project\|global\|all` | 扫描范围，默认 `all`。 |
  | `--fail-on high\|med\|low` | 严重程度阈值，默认 `high`；命中则退出码 1。 |
  | `--budget-tokens N` | 每轮 token 预算，超了算失败。 |
  | `--json` | 输出结构化结果，便于流水线解析。 |
- **说明**
  - 检测到 1 个重复（冲突）即未通过——非常适合作为合并前卡点。

---

## `cleanup` — 清理重复技能

- **使用场景**
  - `conflicts` 告诉你「有重复」后，`cleanup` 列出所有重复副本，并可用 `--execute` 交互式地逐个删除，把磁盘和上下文收拾干净。
- **使用方式**
  ```bash
  skill-doctor cleanup --scope project
  ```
- **常用参数**
  | 参数 | 说明 |
  | --- | --- |
  | `--scope project\|global\|all` | 扫描范围，默认 `all`。 |
  | `--execute` | 进入交互模式逐项选择删除（默认仅列出）。 |
  | `--json` | 输出待清理清单，便于脚本。 |
- **说明**
  - 不加 `--execute` 时是只读预览（安全）。

---

## `cost` / `context` — 估算「上下文税」

- **使用场景**
  - 技能、MCP、Agent 配置每轮都会悄悄塞进对话上下文，吃掉 token 与钱。`cost` 帮你按平台/资源拆解「每轮要背多少 token」并对照预算评级；`context` 子命令还能开关 Codex 的某些资源。
- **使用方式**
  ```bash
  skill-doctor cost --scope project
  skill-doctor context enable --id <id>   # 启用/禁用某个 Codex 资源
  ```
- **常用参数**
  | 参数 | 说明 |
  | --- | --- |
  | `[project-dir]` | 要分析的项目目录，默认当前目录。 |
  | `--platform <p>` | 只看某个平台（claude/codex/copilot/...）。 |
  | `--source skill\|mcp\|all` | 只统计技能 / MCP / 全部。 |
  | `--budget-tokens N` | 每轮预算，超过则标红。 |
  | `--fail-on-budget` | 超预算时退出码 1。 |
  | `--tokenizer openai\|approx` | 分词器；默认 `openai`（精确）。 |

---

## `benefit` — 基于 Codex 历史估算收益（只读）

- **使用场景**
  - 在动任何 Codex 配置之前，用本地最近的 Codex 会话历史模拟一份优化计划能省多少。`benefit` 不会写入 Codex 配置，也不会重新运行 Codex。
- **使用方式**
  ```bash
  skill-doctor benefit --project . --format json --output benefit.json
  skill-doctor benefit --project . --since 7d --limit 50 --plan <plan-id>
  ```
- **常用参数**
  | 参数 | 说明 |
  | --- | --- |
  | `[project-dir]` | 要分析的项目目录，默认当前目录。 |
  | `--since 24h\|7d\|ISO` | 按时间截断历史。 |
  | `--limit N` | 限制会话数量。 |
  | `--plan ID\|path` | 要模拟的优化计划；省略则进入全历史离线模式。 |
  | `--format text\|json\|html\|csv` | 报告格式；`--output` 写入文件。 |
  | `--redact` | 输出脱敏 JSON 报告用于分享。 |
  | `--delete-index` / `--retention-days N` | 只清理 Skill Doctor 自己的元数据索引。 |
- **注意**
  - 报告把「实测用量」与「预估节省」分开呈现；金额为等价 API 价格估算，不是订阅账单。不带 `--plan` 时结果是「删除最新目录文本」的离线模拟，不是已实现的节省。

---

## `context blocks` / `context control` — 检查并写入 Codex 控制

- **使用场景**
  - `context blocks` 列出某次 Codex 会话 JSONL 初始头中观测到的 skills/memory/plugin 块——在新会话上运行它，验证控制项是否真正生效。`context control` 写入项目级 Codex 配置变更，带预览、摘要确认与冲突校验的撤销。
- **使用方式**
  ```bash
  skill-doctor context blocks --file <session.jsonl> --json
  skill-doctor context control --report benefit.json --kind recommended_plugins --id <id> --action disable
  skill-doctor context control --undo <operation-id> --confirm <operation-id>
  ```
- **常用参数**
  | 参数 | 说明 |
  | --- | --- |
  | `--file <path>` | 要检查的会话 JSONL（`blocks` 必需）。 |
  | `--report <report.json>` | 提供控制依据的 benefit 报告。 |
  | `--kind ...` | `skills_instructions` / `recommended_plugins` / `recommendations`。 |
  | `--id <catalog-id>` | 要控制的 Skill / 插件 / 推荐条目。 |
  | `--action enable\|disable` | 控制方向。 |
  | `--confirm <preview-digest>` | 应用预览的变更（省略则仅预览）。 |
  | `--undo <operation-id> --confirm <operation-id>` | 撤销已应用的操作。 |
- **注意**
  - 写入保持 pending，直到新开的 Codex 任务 JSONL 确认移除；`--undo` 只还原被改的键，并拒绝覆盖后续人工改动。私有备份位于 `.codex/skill-doctor-operations/`，不要提交。配置写入不等于运行时生效——务必在新会话上用 `context blocks` 验证。

---

## `diff <a> <b>` — 对比两个技能

- **使用场景**
  - 想确认两个技能到底差在哪（合并、替换、还是同一个东西换名），用 `diff` 并排对比它们的字段与触发条件。
- **使用方式**
  ```bash
  skill-doctor diff data-exporter code-reviewer
  ```
- **常用参数**
  | 参数 | 说明 |
  | --- | --- |
  | `<skill-a> <skill-b>` | 两个技能名（必填）。 |
  | `--report [path]` | 导出可视化 HTML 对比报告。 |
- **说明**
  - 未配置分析模型时，`diff` 回退到「仅展示提取字段」模式；配置模型后会额外给出语义层面的差异解读。

---

## `ui` — 启动 Web 仪表盘

- **使用场景**
  - 比起纯终端，更想要一个可点的网页界面：总览、问题、上下文优化、技能库一目了然。`ui` 会在本地起一个带鉴权会话的 Web 服务。
- **使用方式**
  ```bash
  skill-doctor ui --port 4173 --no-open
  ```
- **常用参数**
  | 参数 | 说明 |
  | --- | --- |
  | `[project-dir]` | 要分析的项目目录，默认当前目录。 |
  | `--port N` | 监听端口，默认随机。 |
  | `--no-open` | 不自动打开浏览器（服务器仍正常启动）。 |
- **说明**
  - 启动后打印一个带 session token 的本地 URL；在浏览器打开即可使用全套可视化功能，按 Ctrl+C 停止。当前截图以只包含项目级 `.codex/skills` 的 Codex 项目为例，见 [GitHub Pages 上的截图](https://evilstar2016.github.io/skill-doctor/)。

---

## `dashboard` — 生成静态总览报告

- **使用场景**
  - 不想起服务，只想导出一份「可分享/可归档」的 HTML 总览（技能、冲突、审计、重复、清理建议一页纸），发给同事或提交到仓库。
- **使用方式**
  ```bash
  skill-doctor dashboard --scope project --report dashboard.html
  ```
- **常用参数**
  | 参数 | 说明 |
  | --- | --- |
  | `--scope project\|global\|all` | 扫描范围，默认 `all`。 |
  | `--report [path]` | 导出 HTML；不写路径默认 `dashboard.html`。 |
  | `--open` | 生成后自动用浏览器打开。 |
- **说明**
  - 本仓库 `docs/pages/dashboard.sample.html` 为真实样例。

---

## `install` / `uninstall` — 安装与卸载技能

- **使用场景**
  - 拿到一个本地 skill 目录（或市场 slug），想装到某个 AI 平台目录里统一纳管；用完后用 `uninstall` 卸载。两者都写入「统一技能中心」`center.json`。
- **使用方式**
  ```bash
  skill-doctor install ./skills/my-skill --target claude
  skill-doctor uninstall my-skill --target claude
  ```
- **常用参数**
  | 参数 | 说明 |
  | --- | --- |
  | `<path\|slug>` | 本地路径或市场 slug（必填）。 |
  | `--target <platform>` | 目标平台；不写则自动探测当前活跃平台。 |
  | `--link` | 以符号链接方式安装（便于开发调试）。 |
  | `uninstall <name> --target <p>` | 卸载指定名称的技能。 |
  | `--force` | 强制卸载（即使仍有其它引用）。 |

---

## `center` — 统一技能中心

- **使用场景**
  - `skill-doctor` 用 `center.json` 作为「技能与安装记录的单一真相源」。老旧版本数据（catalog/deployments/registry）需要一次性迁移；`show` 查看当前全部纳管技能与安装情况。
- **使用方式**
  ```bash
  skill-doctor center migrate
  skill-doctor center show
  ```
- **常用参数**
  | 参数 | 说明 |
  | --- | --- |
  | `center migrate` | 把旧格式数据迁移到 `center.json`（幂等，可重复执行）。 |
  | `center show` | 以 JSON 打印 `center.json` 全部内容。 |

---

## `config` — 配置分析 / 嵌入模型

- **使用场景**
  - 要让 AI 增强能力（`show` 语义解读、`conflicts` embedding 策略、`audit --ai`、`diff` 语义差异）生效，需先在 `~/.skill-doctor/config.json` 配置一个 OpenAI 兼容的分析模型（可选再配嵌入模型）。
- **使用方式**
  ```bash
  skill-doctor config set analysis --base-url https://api.example.com/v1 --model gpt-4o
  ```
- **常用参数**
  | 参数 | 说明 |
  | --- | --- |
  | `config view` | 查看当前模型配置状态。 |
  | `config set analysis\|embedding --base-url <url> --model <m>` | 设置分析/嵌入模型端点与模型名。 |
  | `--api-key <key>` | 设置 API Key（也可走环境变量）。 |
  | `--clear-api-key` | 清除已保存的 Key。 |
  | `config test [--service analysis\|embedding]` | 连通性自检。 |
- **说明**
  - 配置后，`show` / `conflicts --strategy embedding` / `audit --ai` / `diff` 才会启用对应的智能能力。

---

> 更完整的图文与真实终端截图，请查看 **[中文使用手册（HTML）](https://evilstar2016.github.io/skill-doctor/zh-CN/pages/manual.html)**。
