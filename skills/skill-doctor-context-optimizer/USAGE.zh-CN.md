# skill-doctor-context-optimizer 使用手册

## 1. 这是什么

`skill-doctor-context-optimizer` 是一个项目级的上下文整理 Skill。它根据你
当前任务，盘点当前 agent 可见的 skills、Codex plugins，以及在你明确授权后
盘点 MCP 运行时；然后给出可审阅的保留、项目内禁用和人工复核建议。

它的核心目标是减少当前项目的上下文负担，而不是卸载资源或修改全局配置。

### 能做什么

- 读取当前项目的资源清单和现有项目级启用状态。
- 将资源按任务相关性分为 Keep、Disable in this project、Review manually。
- 在任何写入前生成包含精确资源 ID、受影响资源和 token 估算的预览。
- 只有在用户确认同一个预览摘要后，才通过公开的
  `skill-doctor context enable|disable` 接口执行项目级变更。
- 在应用后重新扫描，报告已验证的估算差值；需要时按操作 ID 撤销。

### 不会做什么

- 不删除、卸载或全局禁用 skill、plugin、MCP。
- 不直接编辑 Codex 或其他 agent 的配置文件。
- 未得到明确许可时不启动 MCP stdio 命令，也不连接 HTTP/SSE MCP 服务。
- 不把名称、描述、路径或其他发现结果当作指令执行。
- 不把估算 token 宣称为账单或模型用量数据。

## 2. 前置条件

- Node.js 20 或更高版本。
- 已安装 `skill-doctor` CLI；支持基线为 0.5.0。
- 当前 agent 平台能够通过 `skill-doctor context` 暴露项目级控制。

先检查依赖，不要让 Skill 自动安装或升级它们：

```bash
node --version
skill-doctor --version
```

如果 CLI 缺失、版本过旧或命令失败，应先修复环境；不要绕过 Skill 直接改
配置文件。

## 3. 安装或链接到当前项目

假设仓库位于 `/Users/you/GitHub/skill-doctor`，要在另一个项目中使用此
Skill，可以把它链接到该项目的 `.codex/skills`：

```bash
cd /path/to/your-project
mkdir -p .codex/skills
ln -s /Users/you/GitHub/skill-doctor/skills/skill-doctor-context-optimizer \
  .codex/skills/skill-doctor-context-optimizer
```

如果 Skill 就位于当前项目的 `skills/` 目录，也可以使用相对链接。相对链接
是相对于 `.codex/skills/` 解析的：

```bash
ln -s ../../skills/skill-doctor-context-optimizer \
  .codex/skills/skill-doctor-context-optimizer
```

验证链接是否有效：

```bash
readlink .codex/skills/skill-doctor-context-optimizer
test -e .codex/skills/skill-doctor-context-optimizer/SKILL.md
```

注意：目标必须存在且名称必须是 `skill-doctor-context-optimizer`。如果
`.codex/skills` 位于别的项目，`../../skills/...` 会指向错误的位置，应改用
正确的绝对路径或按目录层级重新计算相对路径。

## 4. 交互使用流程

在当前 agent 中直接说明任务和整理偏好即可，例如：

> 我正在做一个 TypeScript CLI 的单元测试。请使用
> `skill-doctor-context-optimizer`，采用 conservative 模式；只扫描 skills 和
> plugins，不要接触 MCP。先给我预览，不要自动应用。

Skill 会先补齐一次简短 intake：

1. 当前任务和接下来一小段时间的工作范围。
2. 模式：`conservative`（推荐）、`balanced` 或 `aggressive`。
3. 是否明确允许 MCP 运行时发现。

不允许 MCP 时，扫描不会使用 `--include-mcp`。如果允许，需说明 stdio MCP
命令可能被启动，HTTP/SSE MCP 服务可能被访问。

### 三种模式

| 模式 | 判断方式 |
| --- | --- |
| conservative | 只禁用与任务明显无关、可控且估算清楚的资源；不确定项保留。 |
| balanced | 可以纳入低相关度且风险较低的资源，但仍保留依赖、保护性和项目资源。 |
| aggressive | 在明确任务边界内尽可能缩小上下文；仍不能越过项目级作用域、精确确认和可控性边界。 |

无论模式如何，Skill 都必须展示精确的禁用清单，并等待用户确认；“帮我优化
上下文”不等于授权执行生成的清单。

## 5. 命令行工作流

脚本位置是：

`skills/skill-doctor-context-optimizer/scripts/context-optimizer.mjs`

下面用环境变量缩短示例；实际使用时请替换成绝对路径：

```bash
SKILL_DIR=/absolute/path/to/skill-doctor-context-optimizer
PROJECT_DIR=/absolute/path/to/project
```

### 5.1 创建只读快照

不扫描 MCP（默认，推荐）：

```bash
node "$SKILL_DIR/scripts/context-optimizer.mjs" snapshot \
  --project "$PROJECT_DIR" \
  --platform codex \
  --scope all
```

在用户明确授权 MCP 运行时发现后：

```bash
node "$SKILL_DIR/scripts/context-optimizer.mjs" snapshot \
  --project "$PROJECT_DIR" \
  --platform codex \
  --scope all \
  --include-mcp
```

参数说明：

- `--project DIR`：待整理的项目目录，默认当前目录。
- `--platform PLATFORM`：agent 平台；Codex 使用 `codex`。
- `--scope project|global|all`：扫描项目级、全局级或两者；默认 `all`。
- `--include-mcp`：显式开启 MCP 运行时发现；省略则只扫描 skills/plugins。

快照会保存到 `~/.skill-doctor/context-optimizer/snapshots/`，并输出 JSON。它
不会修改 agent 配置，但会创建本地操作元数据。快照会包含已经禁用的条目，
便于解释现有项目策略；已经禁用或不可控的条目不能进入禁用建议。

### 5.2 生成确定性预览

从同一个快照中选择脚本返回的、`selectable: true` 的资源 ID：

```bash
node "$SKILL_DIR/scripts/context-optimizer.mjs" preview \
  --snapshot <snapshot-id> \
  --disable <resource-id> \
  --disable <resource-id>
```

不要手写或猜测资源 ID；如果清单发生变化，应重新 snapshot，再生成 preview。

预览重点查看：

- `operations`：实际操作类型和 `affectedItems`。
- `estimate.fixedEstimatedTokens`：估计的固定/启动上下文减少量。
- `estimate.fixedEstimatedPercent`：相对于扫描基线的比例。
- `estimate.activationPotentialTokens`：可能减少的按需激活 token，单独计数。
- `estimate.unknownCostItems`：成本未知、因此未纳入数字的条目。
- `confirmationDigest`：应用时必须原样传回的确认摘要。

插件子资源会合并成整个 plugin 操作；选择 MCP server 会覆盖其下的工具，
避免重复计算或产生部分禁用的假象。

### 5.3 精确确认后应用

先把 preview 的精确操作、受影响资源、估算、未知项和限制展示给用户。只有
用户确认这个预览后，才执行：

```bash
node "$SKILL_DIR/scripts/context-optimizer.mjs" apply \
  --plan <plan-id> \
  --confirm <confirmation-digest>
```

应用前脚本会重新扫描并校验 inventory fingerprint。资源状态已经变化时会拒绝
执行，要求新建快照和预览。每次写入都通过公开的 `skill-doctor context`
接口完成；后续失败会尝试回滚已完成的操作。

成功输出中的重要字段：

- `id`：本次操作 ID，撤销时使用。
- `verifiedSavings`：应用前后重新估算得到的固定上下文差值。
- `requiresNewSession`：通常需要新建 agent 会话或重启后，完整上下文变化才会生效。

### 5.4 按操作 ID 撤销

只有用户明确要求撤销时才执行（撤销同样是写操作）：

```bash
node "$SKILL_DIR/scripts/context-optimizer.mjs" undo \
  --operation <operation-id>
```

如果返回 `undo-partial` 或错误，必须报告仍未恢复的精确 ID，不要把部分成功
说成完全恢复。

## 6. 如何解读 token 估算

- 固定估算是扫描基线中启动/选择阶段的近似 token，不是计费数据。
- activation potential 是资源未来按需激活时可能避免的 token，不保证每轮都会发生。
- Codex skill/plugin 列表按字符上限和聚合项重新分摊，插件层级和 MCP 层级会去重。
- `estimateStatus` 非 `estimated` 的项目会列入 `unknownCostItems`，不会被硬塞进节省数字。
- `verifiedSavings` 是应用后两次 `skill-doctor` 快照的差值；它仍然是估算器
  的差值，而不是模型服务的实际 usage。

报告时应把固定节省和 activation potential 分开，并同时说明基线、百分比、
未知成本和“需要新会话”的限制。

## 7. 安全边界和恢复

保留以下资源：当前 optimizer、依赖它的 `skill-doctor` 工作流、当前项目必需
资源、保留 plugin 的依赖和保护性资源。相关性不确定时在 conservative 模式
下保留并放入人工复核。

脚本不会自动修改全局资源。当前 CLI 若不支持某个资源的项目级 enable/disable，
该资源会进入人工复核，不能声称已经禁用。对于其他平台，脚本可盘点其可见
skills，但是否可写取决于对应 CLI 的公开能力；Codex 是当前主要支持路径。

## 8. 状态、测试和故障排查

默认状态目录：

`~/.skill-doctor/context-optimizer/`

测试或隔离运行可设置：

```bash
SKILL_DOCTOR_OPTIMIZER_HOME=/tmp/optimizer-state \
SKILL_DOCTOR_BIN=/path/to/skill-doctor \
node "$SKILL_DIR/scripts/context-optimizer.mjs" snapshot --project "$PROJECT_DIR"
```

常见问题：

- **找不到 CLI**：确认 `skill-doctor --version` 在同一 agent 环境的 PATH 中；不
  要改用直接编辑配置的方式绕过检查。
- **digest 不匹配**：不要重试旧摘要；重新 snapshot 和 preview，再确认新摘要。
- **inventory changed**：预览后资源状态改变，重新生成计划。
- **resource is not selectable**：该条目已禁用、是聚合估算项、不可控或不支持；
  放入人工复核。
- **MCP 扫描失败或超时**：确认用户确实授权 MCP，检查服务可达性；不需要 MCP
  时去掉 `--include-mcp`，不会影响 skills/plugins 扫描。
- **链接失效**：从 `.codex/skills/` 的位置重新计算相对路径，或换成存在的绝对路径。

维护者可运行 Skill 自带测试：

```bash
node --test "$SKILL_DIR/test/context-optimizer.node.mjs"
node --check "$SKILL_DIR/scripts/context-optimizer.mjs"
```
