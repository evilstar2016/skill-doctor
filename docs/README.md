# skill-doctor 使用说明 / skill-doctor Reference

> **中文**：`skill-doctor` 是一个本地 CLI 工具，用于审计 AI 编码助手（Claude Code / Codex / Copilot / Cursor / ACA 等）安装的「技能（skill）」：重复、冲突、安全风险与上下文成本。所有命令都支持 `--json` 输出，便于接入 CI。
>
> **EN**: `skill-doctor` is a local CLI that audits skills installed by AI coding assistants (Claude Code / Codex / Copilot / Cursor / ACA, etc.): duplicates, conflicts, security risks, and context cost. Every command accepts `--json` for machine-readable output, convenient for CI.

本说明文档与图文并茂的 **[使用手册（HTML，中英双语）](./pages/manual.html)** 内容类似：每个命令都覆盖 **使用场景 / 使用方式 / 使用效果** 三块。
*This reference mirrors the [bilingual HTML manual](./pages/manual.html); each command below covers Scenario / Usage / Effect.*

约定 / *Conventions*：`--scope project` 只看当前仓库、避免扫到全局；`--json` 输出机器可读结果便于 CI。手册与示例均在一个含 1 个重复技能的示例项目里运行，所以多处会出现 `data-exporter 有 2 份` 的现象。
*Use `--scope project` to limit the scan to the current repo; `--json` emits machine-readable output. The examples run against a sample project with 1 duplicate skill, so "data-exporter has 2 copies" appears in several places.*

---

## 命令总览 / Command overview

| 命令 Command | 用途 Purpose |
| --- | --- |
| `install` / 运行 | 安装 CLI 并查看版本 / install & print version |
| `--help` | 查看全部命令与参数 / list commands & flags |
| `scan` | 盘点已安装的技能 / list installed skills |
| `show <name>` | 查看单个技能详情 / inspect one skill |
| `conflicts` | 检测重复与冲突 / detect duplicates & conflicts |
| `audit` | 安全审计 / security audit |
| `check` | 一键健康门禁（CI 首选）/ one-shot health gate |
| `cleanup` | 清理重复技能 / remove duplicates |
| `cost` / `context` | 估算上下文成本 / estimate context cost |
| `diff <a> <b>` | 对比两个技能 / compare two skills |
| `ui` | 启动 Web 仪表盘 / launch web dashboard |
| `dashboard` | 生成静态总览报告 / export static report |
| `install` / `uninstall` | 安装与卸载技能 / manage skills |
| `center` | 统一技能中心 / unified skill center |
| `config` | 配置分析 / 嵌入模型 / configure models |

---

## 安装与运行 / Install & Run

- **使用场景 / Scenario**
  - 中文：`skill-doctor` 是本地 CLI，安装后即可在任意项目目录里使用。
  - EN: Install it once and use it in any project directory.
- **使用方式 / Usage**
  ```bash
  npm i -g @evilstar2025/skill-doctor
  npx @evilstar2025/skill-doctor <cmd>   # 不安装，临时运行 / run without installing
  skill-doctor --version                 # 查看版本 / print version
  ```
- **常用参数 / Flags**
  | 参数 Flag | 说明 Description |
  | --- | --- |
  | `npm i -g @evilstar2025/skill-doctor` | 全局安装，之后直接用 `skill-doctor` 命令。 / Install globally, then use the `skill-doctor` command directly. |
  | `npx @evilstar2025/skill-doctor <cmd>` | 不安装，临时运行某条命令。 / Run a command on the fly without installing. |
  | `skill-doctor --version` | 查看版本号。 / Print the version. |
- **说明 / Notes**
  - 中文：需要 Node.js ≥ 20。所有命令都可加 `--json` 输出机器可读结果，便于接入 CI。
  - EN: Requires Node.js ≥ 20. Every command accepts `--json` for machine-readable output, convenient for CI.

---

## `--help` — 总览 / Overview

- **使用场景 / Scenario**
  - 中文：第一次使用或忘记子命令/参数时，先看帮助——它列出全部命令与可选项，是最常用的「目录」。
  - EN: First time, or forgot a sub-command/flag? Check `--help` first; it lists every command and option.
- **使用方式 / Usage**
  ```bash
  skill-doctor --help
  ```
- **常用参数 / Flags**
  | 参数 Flag | 说明 Description |
  | --- | --- |
  | `-h / --help` | 对任意子命令也有效，例如 `skill-doctor conflicts --help`。 / Works for any sub-command too. |
  | `-v / --version` | 仅打印版本号。 / Print just the version. |

---

## `scan` — 盘点已安装的技能 / List installed skills

- **使用场景 / Scenario**
  - 中文：想知道「当前项目到底装了哪些 skill、分布在哪些平台、有没有重复或冲突」时，先跑 `scan`。它是所有后续诊断的起点。
  - EN: When you want to know which skills are installed, on which platforms, and whether any duplicates/conflicts exist — run `scan` first.
- **使用方式 / Usage**
  ```bash
  skill-doctor scan --scope project
  ```
- **常用参数 / Flags**
  | 参数 Flag | 说明 Description |
  | --- | --- |
  | `--scope project\|global\|all` | 扫描范围；默认 `all`。示例用 `project` 只看当前仓库。 / Scan scope; default `all`. |
  | `--group` | 用模型把技能按主题分组（需配置分析模型）。 / Group skills by topic via LLM (needs a model). |
  | `--strategy token\|embedding` | 冲突检测策略；默认 `token`（本地、离线）。 / Conflict strategy; default `token` (local, offline). |
  | `--report [path]` | 额外导出一个可视化 HTML 报告。 / Also export a visual HTML report. |
  | `--json` | 输出结构化 JSON，便于脚本处理。 / Emit structured JSON. |
- **说明 / Notes**
  - 中文：`scan` 会列出各平台的技能并标注重复；`--report` 会写出 `scan-report.html`（本仓库 `docs/pages/scan-report.sample.html` 为真实样例）。
  - EN: `scan` lists skills per platform and flags duplicates; `--report` writes `scan-report.html` (a real sample ships at `docs/pages/scan-report.sample.html`).

---

## `show <name>` — 查看单个技能详情 / Inspect one skill

- **使用场景 / Scenario**
  - 中文：扫出一堆技能后，想深挖某一个：来源路径、描述、触发条件，以及语义相近的其它技能。
  - EN: After scanning, drill into one skill: source path, description, trigger conditions, and similar skills.
- **使用方式 / Usage**
  ```bash
  skill-doctor show data-exporter
  ```
- **常用参数 / Flags**
  | 参数 Flag | 说明 Description |
  | --- | --- |
  | `<name>` | 技能名（必填），例如 `data-exporter`。 / Skill name (required). |
  | `--json` | 输出结构化 JSON。 / Emit structured JSON. |
- **说明 / Notes**
  - 中文：`RELATED SKILLS` 会给出与同名技能相似度，是重复/冲突排查的线索。
  - EN: `RELATED SKILLS` reports similarity with other copies — the lead to follow for duplicate/conflict investigations.

---

## `conflicts` — 检测重复与冲突 / Detect duplicates & conflicts

- **使用场景 / Scenario**
  - 中文：当怀疑不同平台/目录里藏着同名或高度雷同的技能（会互相覆盖、浪费上下文），用 `conflicts` 找出它们并给出「删哪份、留哪份」的建议。
  - EN: When you suspect same-named or highly similar skills across platforms/directories, `conflicts` finds them and suggests "delete which, keep which".
- **使用方式 / Usage**
  ```bash
  skill-doctor conflicts --scope project
  ```
- **常用参数 / Flags**
  | 参数 Flag | 说明 Description |
  | --- | --- |
  | `--scope project\|global\|all` | 扫描范围，默认 `all`。 / Scan scope, default `all`. |
  | `--kind duplicate\|conflict\|all` | 只关注某一类；`duplicate`=完全同名，`conflict`=语义雷同。 / Filter by kind. |
  | `--fail-on high\|med\|low` | 达到阈值则以退出码 1 失败，用于 CI 卡点。 / Exit 1 when severity reached — for CI gating. |
  | `--limit N` | 最多显示 N 条。 / Show at most N. |
  | `--strategy / --threshold / --embedding-model` | 同 `scan`，控制检测精度。 / Same as `scan`. |
- **说明 / Notes**
  - 中文：在 CI 里加 `--fail-on high` 即可把「出现重复」变成构建失败。
  - EN: In CI, add `--fail-on high` so any duplicate fails the build.

---

## `audit` — 安全审计 / Security audit

- **使用场景 / Scenario**
  - 中文：把技能交付团队或 CI 之前，想知道有没有明显安全风险（危险 shell 指令、可疑网络调用等）。不带 `--ai` 时走本地规则，零配置即可用。
  - EN: Before shipping skills, check for obvious security risks (dangerous shell, suspicious network calls). Without `--ai`, runs on local rules with zero config.
- **使用方式 / Usage**
  ```bash
  skill-doctor audit --scope project
  ```
- **常用参数 / Flags**
  | 参数 Flag | 说明 Description |
  | --- | --- |
  | `--scope project\|global\|all` | 扫描范围，默认 `all`。 / Scan scope, default `all`. |
  | `--severity high\|med\|low` | 只显示 ≥ 该级别的问题。 / Only show findings of this severity or higher. |
  | `--ai` | 调用分析模型做增强扫描（需先 `config set analysis`）。 / Use the model for a deeper scan. |
  | `--no-cache` | 忽略 AI 审计缓存，重新分析。 / Ignore AI audit cache. |
  | `--report [path]` | 导出可视化 HTML 审计报告。 / Export a visual HTML audit report. |

---

## `check` — 一键健康门禁（CI 首选）/ One-shot health gate

- **使用场景 / Scenario**
  - 中文：在 CI / pre-commit 里用一条命令同时检查安全风险、技能冲突、上下文是否超预算，并给出 pass/fail 与退出码。比分别跑 `audit`+`conflicts`+`cost` 更省事。
  - EN: In CI/pre-commit, run one command that combines security, conflicts, and context-budget checks and returns pass/fail with an exit code.
- **使用方式 / Usage**
  ```bash
  skill-doctor check --scope project --fail-on high
  ```
- **常用参数 / Flags**
  | 参数 Flag | 说明 Description |
  | --- | --- |
  | `--scope project\|global\|all` | 扫描范围，默认 `all`。 / Scan scope, default `all`. |
  | `--fail-on high\|med\|low` | 严重程度阈值，默认 `high`；命中则退出码 1。 / Severity threshold; exit 1 when reached. |
  | `--budget-tokens N` | 每轮 token 预算，超了算失败。 / Per-turn token budget. |
  | `--json` | 输出结构化结果，便于流水线解析。 / Emit structured output for pipelines. |
- **说明 / Notes**
  - 中文：检测到 1 个重复（冲突）即未通过——非常适合作为合并前卡点。
  - EN: A single duplicate makes the check fail — perfect as a pre-merge gate.

---

## `cleanup` — 清理重复技能 / Remove duplicate skills

- **使用场景 / Scenario**
  - 中文：`conflicts` 告诉你「有重复」后，`cleanup` 列出所有重复副本，并可用 `--execute` 交互式地逐个删除，把磁盘和上下文收拾干净。
  - EN: Once `conflicts` reports duplicates, `cleanup` lists every copy and can interactively remove them with `--execute`.
- **使用方式 / Usage**
  ```bash
  skill-doctor cleanup --scope project
  ```
- **常用参数 / Flags**
  | 参数 Flag | 说明 Description |
  | --- | --- |
  | `--scope project\|global\|all` | 扫描范围，默认 `all`。 / Scan scope, default `all`. |
  | `--execute` | 进入交互模式逐项选择删除（默认仅列出）。 / Interactive mode (default is listing only). |
  | `--json` | 输出待清理清单，便于脚本。 / Emit the cleanup list as JSON. |
- **说明 / Notes**
  - 中文：不加 `--execute` 时是只读预览（安全）。
  - EN: Without `--execute`, this is a safe read-only preview.

---

## `cost` / `context` — 估算「上下文税」 / Estimate the context tax

- **使用场景 / Scenario**
  - 中文：技能、MCP、Agent 配置每轮都会悄悄塞进对话上下文，吃掉 token 与钱。`cost` 帮你按平台/资源拆解「每轮要背多少 token」并对照预算评级；`context` 子命令还能开关 Codex 的某些资源。
  - EN: Skills, MCP servers, and Agent config silently inflate every conversation. `cost` breaks down per-turn tokens and grades against budget; `context` can enable/disable Codex resources.
- **使用方式 / Usage**
  ```bash
  skill-doctor cost --scope project
  skill-doctor context enable --id <id>   # 启用/禁用某个 Codex 资源 / toggle a Codex resource
  ```
- **常用参数 / Flags**
  | 参数 Flag | 说明 Description |
  | --- | --- |
  | `[project-dir]` | 要分析的项目目录，默认当前目录。 / Project dir to analyze (default: current). |
  | `--platform <p>` | 只看某个平台（claude/codex/copilot/...）。 / Limit to a platform. |
  | `--source skill\|mcp\|all` | 只统计技能 / MCP / 全部。 / Restrict to skills / MCP / all. |
  | `--budget-tokens N` | 每轮预算，超过则标红。 / Per-turn budget; over-budget rows flagged. |
  | `--fail-on-budget` | 超预算时退出码 1。 / Exit 1 when over budget. |
  | `--tokenizer openai\|approx` | 分词器；默认 `openai`（精确）。 / Tokenizer; default `openai` (precise). |

---

## `diff <a> <b>` — 对比两个技能 / Compare two skills

- **使用场景 / Scenario**
  - 中文：想确认两个技能到底差在哪（合并、替换、还是同一个东西换名），用 `diff` 并排对比它们的字段与触发条件。
  - EN: To know exactly how two skills differ (merge, replace, or same thing renamed), `diff` lays out fields and triggers side by side.
- **使用方式 / Usage**
  ```bash
  skill-doctor diff data-exporter code-reviewer
  ```
- **常用参数 / Flags**
  | 参数 Flag | 说明 Description |
  | --- | --- |
  | `<skill-a> <skill-b>` | 两个技能名（必填）。 / Two skill names (required). |
  | `--report [path]` | 导出可视化 HTML 对比报告。 / Export a visual HTML comparison report. |
- **说明 / Notes**
  - 中文：未配置分析模型时，`diff` 回退到「仅展示提取字段」模式；配置模型后会额外给出语义层面的差异解读。
  - EN: Without a model, `diff` falls back to "fields only" mode; with a model it also gives a semantic interpretation.

---

## `ui` — 启动 Web 仪表盘 / Launch the web dashboard

- **使用场景 / Scenario**
  - 中文：比起纯终端，更想要一个可点的网页界面：总览、冲突、上下文成本、技能库一目了然。`ui` 会在本地起一个带鉴权会话的 Web 服务。
  - EN: Prefer a clickable web UI — overview, conflicts, context cost, skill library at a glance. `ui` starts a local web server with session auth.
- **使用方式 / Usage**
  ```bash
  skill-doctor ui --port 4173 --no-open
  ```
- **常用参数 / Flags**
  | 参数 Flag | 说明 Description |
  | --- | --- |
  | `[project-dir]` | 要分析的项目目录，默认当前目录。 / Project dir to analyze (default: current). |
  | `--port N` | 监听端口，默认随机。 / Listen port; default: random. |
  | `--no-open` | 不自动打开浏览器（服务器仍正常启动）。 / Do not auto-open the browser. |
- **说明 / Notes**
  - 中文：启动后打印一个带 session token 的本地 URL；在浏览器打开即可使用全套可视化功能，按 Ctrl+C 停止。界面样例见 [docs/index.html](./index.html)。
  - EN: After starting, it prints a local URL with a session token; open it in a browser to use the full UI; press Ctrl+C to stop. See [docs/index.html](./index.html) for UI screenshots.

---

## `dashboard` — 生成静态总览报告 / Export a static overview report

- **使用场景 / Scenario**
  - 中文：不想起服务，只想导出一份「可分享/可归档」的 HTML 总览（技能、冲突、审计、重复、清理建议一页纸），发给同事或提交到仓库。
  - EN: Don't want a server — just export a single-file HTML overview (skills, conflicts, audit, duplicates, cleanup) to share or commit.
- **使用方式 / Usage**
  ```bash
  skill-doctor dashboard --scope project --report dashboard.html
  ```
- **常用参数 / Flags**
  | 参数 Flag | 说明 Description |
  | --- | --- |
  | `--scope project\|global\|all` | 扫描范围，默认 `all`。 / Scan scope, default `all`. |
  | `--report [path]` | 导出 HTML；不写路径默认 `dashboard.html`。 / Export HTML; default `dashboard.html`. |
  | `--open` | 生成后自动用浏览器打开。 / Auto-open after generation. |
- **说明 / Notes**
  - 中文：本仓库 `docs/pages/dashboard.sample.html` 为真实样例。
  - EN: A real sample ships at `docs/pages/dashboard.sample.html`.

---

## `install` / `uninstall` — 安装与卸载技能 / Manage skills

- **使用场景 / Scenario**
  - 中文：拿到一个本地 skill 目录（或市场 slug），想装到某个 AI 平台目录里统一纳管；用完后用 `uninstall` 卸载。两者都写入「统一技能中心」`center.json`。
  - EN: Install a local skill dir (or marketplace slug) into a platform dir, then uninstall later. Both are recorded in the unified skill center (`center.json`).
- **使用方式 / Usage**
  ```bash
  skill-doctor install ./skills/my-skill --target claude
  skill-doctor uninstall my-skill --target claude
  ```
- **常用参数 / Flags**
  | 参数 Flag | 说明 Description |
  | --- | --- |
  | `<path\|slug>` | 本地路径或市场 slug（必填）。 / Local path or slug (required). |
  | `--target <platform>` | 目标平台；不写则自动探测当前活跃平台。 / Target platform; auto-detected when omitted. |
  | `--link` | 以符号链接方式安装（便于开发调试）。 / Install as a symlink (for development). |
  | `uninstall <name> --target <p>` | 卸载指定名称的技能。 / Uninstall a skill by name. |
  | `--force` | 强制卸载（即使仍有其它引用）。 / Force uninstall. |

---

## `center` — 统一技能中心 / The unified skill center

- **使用场景 / Scenario**
  - 中文：`skill-doctor` 用 `center.json` 作为「技能与安装记录的单一真相源」。老旧版本数据（catalog/deployments/registry）需要一次性迁移；`show` 查看当前全部纳管技能与安装情况。
  - EN: `skill-doctor` uses `center.json` as the single source of truth. Legacy data must be migrated once; `show` prints the whole picture.
- **使用方式 / Usage**
  ```bash
  skill-doctor center migrate
  skill-doctor center show
  ```
- **常用参数 / Flags**
  | 参数 Flag | 说明 Description |
  | --- | --- |
  | `center migrate` | 把旧格式数据迁移到 `center.json`（幂等，可重复执行）。 / Migrate legacy data (idempotent). |
  | `center show` | 以 JSON 打印 `center.json` 全部内容。 / Print the entire center.json as JSON. |

---

## `config` — 配置分析 / 嵌入模型 / Configure models

- **使用场景 / Scenario**
  - 中文：要让 AI 增强能力（`show` 语义解读、`conflicts` embedding 策略、`audit --ai`、`diff` 语义差异）生效，需先在 `~/.skill-doctor/config.json` 配置一个 OpenAI 兼容的分析模型（可选再配嵌入模型）。
  - EN: To unlock AI-enhanced features, first configure an OpenAI-compatible analysis model in `~/.skill-doctor/config.json` (optionally an embedding model too).
- **使用方式 / Usage**
  ```bash
  skill-doctor config set analysis --base-url https://api.example.com/v1 --model gpt-4o
  ```
- **常用参数 / Flags**
  | 参数 Flag | 说明 Description |
  | --- | --- |
  | `config view` | 查看当前模型配置状态。 / View current config. |
  | `config set analysis\|embedding --base-url <url> --model <m>` | 设置分析/嵌入模型端点与模型名。 / Set model endpoint and name. |
  | `--api-key <key>` | 设置 API Key（也可走环境变量）。 / Set API key (or use env var). |
  | `--clear-api-key` | 清除已保存的 Key。 / Clear stored key. |
  | `config test [--service analysis\|embedding]` | 连通性自检。 / Connectivity self-test. |
- **说明 / Notes**
  - 中文：配置后，`show` / `conflicts --strategy embedding` / `audit --ai` / `diff` 才会启用对应的智能能力。
  - EN: Once configured, `show`, `conflicts --strategy embedding`, `audit --ai`, and `diff` gain smart features.

---

> 更完整的图文与真实终端截图，请查看 **[使用手册（HTML）](./pages/manual.html)**。
> *For full screenshots and real terminal output, see the [HTML manual](./pages/manual.html).*
