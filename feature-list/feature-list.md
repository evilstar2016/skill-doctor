# skill-doctor 功能列表

> 本地 AI Agent 技能诊断工具（冲突 / 安全风险 / 重复 / 上下文成本 / 多平台漂移）。

> 共 60 项二级功能，覆盖 13 个功能模块。


| 功能模块 | 一级功能 | 二级功能 | 功能描述 |
|---|---|---|---|
| 扫描与发现 | 技能发现 | 扫描已安装技能 | 递归扫描 global/project 多平台路径，发现已安装的 skill/rule/instruction 文件并统计平台分布、健康概览（scan 命令）。 |
| 扫描与发现 | 技能发现 | 探测 Agent 平台 | 自动识别机器上安装/配置过的 AI 编码 Agent（detectAgents），用于限定扫描范围与报告平台分布。 |
| 扫描与发现 | 技能发现 | 解析与合并扫描路径 | 按平台适配器内置路径 + 用户配置 paths.extra 解析、合并所有待扫描目录（resolvePaths / scanSources）。 |
| 扫描与发现 | 技能解析 | 解析单个 SKILL.md | 提取技能名称、描述、触发词、来源、scope、置信度等元数据（parseSkill / extractTriggers / provenanceCache）。 |
| 扫描与发现 | 技能详情 | 查看单个技能 | 查看某技能的说明、触发条件、来源溯源、相关技能及相似度（show 命令，支持 --json）。 |
| 扫描与发现 | 健康检查编排 | 统一健康检查流水线 | 将发现→冲突→审计→上下文成本→分组等阶段编排为一次快照（runHealthCheck），支持进度事件与中断信号，驱动 UI 与 dashboard。 |
| 冲突检测 | 重复检测 | 同名重复识别 | 找出在多个 global/project 路径下被重复安装的相同技能（conflicts --kind duplicate）。 |
| 冲突检测 | 重复检测 | 重复清理建议 | 对重复技能给出保留/删除建议（如保留较新副本），供 cleanup 与 UI 使用（suggestCleanup）。 |
| 冲突检测 | 语义重叠检测 | Token/TF-IDF 重叠 | 默认策略：基于关键词重叠与相似度识别描述或触发词相互竞争、可能抢任务的技能（conflicts --kind conflict）。 |
| 冲突检测 | 语义重叠检测 | 嵌入向量相似度 | 可选策略：经本地/远程嵌入模型计算余弦相似度，更准确识别语义重叠（--strategy embedding --threshold）。 |
| 冲突检测 | 语义重叠检测 | LLM 根因分析 | 配置 analysis 模型后对冲突对给出根因与修复建议（conflicts --analyze）。 |
| 安全审计 | 规则扫描 | Shell 执行检测 | 检测要求运行 shell 命令的指令（bash -c / eval / subprocess），严重级 HIGH（规则 shell-exec）。 |
| 安全审计 | 规则扫描 | 破坏性命令检测 | 检测 rm -rf、DROP TABLE、wipe database 等破坏性操作，严重级 HIGH（规则 destructive）。 |
| 安全审计 | 规则扫描 | 凭据泄露检测 | 检测要求输出 API Key、密码、凭据的指令，严重级 MED（规则 secret-leak）。 |
| 安全审计 | 规则扫描 | 网络调用检测 | 检测向外部 URL 发起 POST/上传等网络请求，严重级 LOW（规则 network-call）。 |
| 安全审计 | AI 增强审计 | LLM 风险扫描 | 基于配置的 OpenAI 兼容模型做语义级风险扫描，发现规则之外的安全问题（ai-scanner）。 |
| 安全审计 | AI 增强审计 | AI 提示与缓存 | 构建审计提示词并对 AI 结果做本地缓存，避免重复消耗（ai-prompt / audit-cache）。 |
| 上下文成本分析 | Token 估算 | 多平台计费模式 | 按各 Agent 的上下文注入方式估算 token：Claude skill 元数据、Cursor rules、Copilot instructions、Gemini/Windsurf always-on 文件等。 |
| 上下文成本分析 | Token 估算 | 预算评级 | 按预算阈值（--budget-tokens）对每轮 token 税进行分级（如 A/B/C），并列出高成本项与修复建议（cost 命令）。 |
| 上下文成本分析 | Token 估算 | Tokenizer 选择 | 支持 OpenAI tokenizer（默认 gpt-4o）或旧版近似估算 chars/4（--tokenizer openai|approx）。 |
| 上下文成本分析 | MCP 成本分析 | 实时工具列表探测 | 读本地配置后尝试联系每个 MCP 服务（HTTP/SSE 走 URL，stdio 启动后 tools/list），估算工具名/说明/schema 的 token（scanMcpServers / listMcpTools）。 |
| 上下文成本分析 | Codex 上下文分析 | 配置驱动扫描 | 按内置 codex-config.json（可用户覆盖）扫描 Codex 的 AGENTS.md、skills、plugins、MCP、memories 的启动上下文。 |
| 上下文成本分析 | Codex 上下文分析 | 资源过滤与范围 | 支持 --resource agents/skill/mcp/plugin/memory 与 --scope project/global 精确过滤；--show-disable 单独列出已禁用资源。 |
| 上下文成本分析 | Codex 上下文分析 | 插件缓存盘点 | 通过 --include-cache 盘点 ~/.codex/plugins/cache 中插件/Skill 的 UI 元数据（显示名、图标、调用策略），标记为 cached 不计成本。 |
| 上下文成本分析 | Codex 资源控制 | 启用/禁用技能 | 写入项目级 .codex/config.toml 的 [[skills.config]] 来启用/禁用单个技能（context enable|disable skill）。 |
| 上下文成本分析 | Codex 资源控制 | 启用/禁用 MCP 服务与工具 | 控制 MCP 服务及服务下单个工具的启用状态（enabled/disabled_tools）。 |
| 上下文成本分析 | Codex 资源控制 | 启用/禁用插件 | 按插件级别启用/禁用插件贡献的 skills 与 MCP 工具。 |
| 技能对比 | 并排对比 | 覆盖度与优缺点 | 对比两个技能的覆盖范围、pros/cons、适用场景（diff 命令），支持 --report 导出。 |
| 技能对比 | 并排对比 | LLM 分析报告 | 配置 analysis 模型后，对比时补充覆盖重叠、强弱项与情境化推荐（analyzeDiff）。 |
| 清理 | 重复清理 | 列出重复与建议 | 扫描所有路径下的重复技能并给出建议保留/删除方案（cleanup，支持 --json）。 |
| 清理 | 重复清理 | 交互式删除 | cleanup --execute 交互式选择保留哪一份、删除其余副本。 |
| 仪表盘与报告 | HTML 仪表盘 | 统一仪表盘 | dashboard 命令生成单页 Mission Control 风格 HTML：健康环图、平台分布、技能清单、冲突、安全审计热力图、清理建议。 |
| 仪表盘与报告 | 静态报告导出 | 扫描/审计/对比报告 | scan --report、audit --report、diff --report 等将结果写入自包含 HTML 文件。 |
| 仪表盘与报告 | 终端渲染 | 终端输出渲染 | 各命令的终端表格/卡片渲染（renderScan/Conflict/Audit/Context/Diff/Dashboard 等模块）。 |
| 技能库与托管安装 | 托管技能目录 | 加载技能目录 | 加载托管技能清单（catalog），供安装、导入与 UI 管理使用。 |
| 技能库与托管安装 | 安装与卸载 | 从注册表安装 | 从技能库/注册表将技能安装到目标平台路径（install 命令）。 |
| 技能库与托管安装 | 安装与卸载 | 卸载技能 | 从目标平台路径卸载指定技能并更新注册表（uninstall 命令）。 |
| 技能库与托管安装 | 部署管理 | 部署与同步 | 以 symlink 或 copy 方式部署托管技能，并跟踪 synced/outdated/modified/missing/conflict 等同步状态（deployments）。 |
| 技能库与托管安装 | Agent 技能导入 | 导入本地技能 | 将本地目录中的技能导入为受管技能（importLocalSkill）。 |
| 技能库与托管安装 | Agent 技能导入 | 导入 Agent 技能 | 扫描 Agent 已装技能，给出候选状态（新/相同副本/同名异内容/链接等）与决策动作预览（importAgentSkills）。 |
| 技能库与托管安装 | 注册表管理 | 注册表读写 | 维护本地安装注册表：新增/移除/查找条目，记录名称、平台、scope、仓库、作者等（registry）。 |
| 本地 Web 管理界面 | 界面启动 | 启动本地 UI | ui 命令启动仅监听本机回环地址、使用临时会话鉴权的本地 Web 服务（可指定目录/端口）。 |
| 本地 Web 管理界面 | 概览面板 | 健康概览 | OverviewPage：整体健康评分、问题分布、各 Agent 平台覆盖情况。 |
| 本地 Web 管理界面 | 问题队列 | 统一问题队列 | IssuesPage：聚合安全/冲突/重复/上下文四类问题，按严重级排序与处理。 |
| 本地 Web 管理界面 | 资源清单 | 资源库存 | ResourcesPage：列出全部被诊断资源（技能/规则/指令/MCP），含平台、scope、状态、token。 |
| 本地 Web 管理界面 | 上下文成本面板 | 上下文成本视图 | ContextPage：可视化各 Agent 的每轮 token 税、资源构成与预算评级。 |
| 本地 Web 管理界面 | 管理面板 | 重复清理/开关/安装 | ManagePage：在界面内执行重复清理、Codex 资源开关、托管安装/卸载与导入。 |
| 本地 Web 管理界面 | 扫描路径 | 扫描路径配置 | ScanPathsPage：查看与配置待扫描路径（含 paths.extra 与平台路径）。 |
| 本地 Web 管理界面 | 详情与对比 | 资源详情与技能对比 | 资源详情抽屉 + 技能对比视图，展示说明、触发词、关联技能、问题证据与修复建议。 |
| 本地 Web 管理界面 | 导出 | 静态报告导出 | 在 UI 内一键导出静态报告（与终端 --report 产物一致）。 |
| 平台适配 | 多平台适配器 | 内置平台支持 | 为 Claude Code、Cursor、GitHub Copilot、Codex、Gemini CLI、Windsurf、Kiro、Trae、OpenCode、OpenClaw、Hermes 提供发现/安装/MCP/成本策略记录（adapters）。 |
| 平台适配 | 平台注册与探测 | 注册表与安装目标 | 平台注册表与安装目标解析（registry / resolveInstallPath / detectPlatform），并支持别名（如 claudecode->claude）。 |
| 配置与忽略 | 用户配置 | 加载用户配置 | 读取 ~/.skill-doctor/config.json，提供 embedding、analysis、ignore、paths.extra 配置（loadUserConfig）。 |
| 配置与忽略 | 忽略规则 | 抑制误报 | 按技能名（skillNames）或冲突对（conflictPairs）忽略已知误报，从冲突/审计结果中过滤（applyIgnoreList）。 |
| 配置与忽略 | Codex 配置覆盖 | 自定义 Codex 路径 | 支持 ~/.skill-doctor/codex-config.json 或 --codex-config 追加/覆盖 Codex 扫描路径，按 id 合并、enabled:false 禁用源。 |
| 解释与分组 | 技能解释 | 关联技能推荐 | 基于 token 相似度为技能推荐关联技能及共享关键词（buildExplanation / groupSkills）。 |
| 解释与分组 | 技能解释 | LLM 使用时机 | 配置 analysis 模型后，用 LLM 生成“何时使用”说明（llmExplain）。 |
| 解释与分组 | 技能分组 | 自动分组与标签缓存 | 将相似技能自动分组并缓存分组标签，便于 UI 归类展示（groupSkills / groupLabelCache）。 |
| CI / 集成 | CI 门禁 | 失败阈值退出 | conflicts --fail-on、audit --fail-on、cost --fail-on-budget 在达到阈值时以非零码退出，用于流水线门禁。 |
| CI / 集成 | 机器可读输出 | JSON 输出 | 多数命令支持 --json，便于自定义报告与第三方集成（如 jq 过滤高危项）。 |

## 模块统计

| 功能模块 | 二级功能数 |
| --- | --- |
| 扫描与发现 | 6 |
| 冲突检测 | 5 |
| 安全审计 | 6 |
| 上下文成本分析 | 10 |
| 技能对比 | 2 |
| 清理 | 2 |
| 仪表盘与报告 | 3 |
| 技能库与托管安装 | 7 |
| 本地 Web 管理界面 | 9 |
| 平台适配 | 2 |
| 配置与忽略 | 3 |
| 解释与分组 | 3 |
| CI / 集成 | 2 |
