# Spec: Skill Doctor v0.1 CLI

## Assumptions I'm Making

1. 这是一个从零开始的新项目，目前仓库里还没有可执行代码，只有研究和想法文档。
2. v0.1 的交付形态是本地 CLI，而不是 Web 应用或 SaaS。
3. 技术栈使用 TypeScript/Node.js，并通过 npm/npx 分发。
4. 首周范围只包含 Skill 发现、单 Skill 查看、冲突检测，不包含安全扫描和可视化面板。
5. 冲突检测第一版采用离线、可解释的文本相似度算法，不依赖 embedding API。
6. v0.1 扫描路径覆盖业内主流 AI 编码工具：Claude Code、Cursor、GitHub Copilot、Codex、Gemini CLI、Windsurf、Trae、OpenCode、Kiro IDE。

如果这些假设有偏差，应先改 spec，再进入计划阶段。

## Objective

构建一个本地 CLI 工具，帮助重度 AI Agent 用户和小团队快速回答三个问题：

1. 我机器上到底装了哪些 Skill/规则？
2. 它们分别来自哪里，作用范围是什么？
3. 哪些 Skill 在争抢相似任务，可能导致 Agent 行为不稳定？

用户价值不是“安装更多 Skill”，而是“把已经装上的 Skill 看清、讲清、排查清”。

成功的第一阶段不依赖联网、不依赖账号，也不要求用户迁移现有工作流。用户只需要运行一次命令，就能看到本地 Skill 版图和冲突摘要。

## Tech Stack

- Runtime: Node.js 20+
- Language: TypeScript 5.x
- Package manager: npm
- CLI framework: `commander` 或 `cac`
- Terminal rendering: `chalk` + `cli-table3` 或等价轻量方案
- Frontmatter parsing: `gray-matter`
- Testing: `vitest`
- Build: `tsup` 或 `tsx` + `tsc`

约束：
- 避免引入重型 AI / embedding 依赖
- 保证 `npx skill-doctor` 可运行
- 首版优先离线能力和启动速度，而不是算法复杂度

## Commands

以下命令是 v0.1 目标命令面，而不是当前仓库已存在命令：

```bash
# 开发
npm install
npm run dev -- scan

# 构建
npm run build

# 测试
npm test
npm run test:watch
npm run test:coverage

# 类型检查
npx tsc --noEmit

# CLI 目标用法
npx skill-doctor scan
npx skill-doctor show git-workflow
npx skill-doctor conflicts
npx skill-doctor conflicts --fail-on high
```

## Project Structure

目标目录结构：

```text
src/
  cli/
    index.ts              # 命令注册与参数解析
  discovery/
    resolvePaths.ts       # 平台路径解析
    scanSkills.ts         # 扫描入口
  parsing/
    parseSkill.ts         # SKILL.md / .mdc 解析
    extractTriggers.ts    # 触发词与描述提取
  conflicts/
    tokenize.ts           # 分词与停用词过滤
    detectConflicts.ts    # 相似度计算与分级
  render/
    renderScan.ts         # scan 输出
    renderShow.ts         # show 输出
    renderConflicts.ts    # conflicts 输出
  types/
    skill.ts              # SkillRecord / ConflictPair 类型定义
  utils/
    paths.ts
    text.ts

tests/
  discovery/
  parsing/
  conflicts/
  cli/

doc/
  research/
  ideas/
  specs/
```

原则：
- 平台路径发现、文件解析、冲突计算、终端渲染必须解耦
- 不把 CLI 层和业务逻辑层混在一起
- 测试目录镜像核心源码目录，便于定位

## Code Style

风格目标：小模块、纯函数优先、显式类型、输出可解释。

```ts
export interface SkillRecord {
  name: string;
  sourcePath: string;
  platform: 'claude' | 'cursor' | 'copilot' | 'codex' | 'gemini' | 'windsurf' | 'trae' | 'opencode' | 'kiro' | 'unknown';
  scope: 'global' | 'project';
  description: string;
  triggers: string[];
}

export function normalizeSkillName(input: string): string {
  return input.trim().toLowerCase();
}
```

约定：
- 文件名使用 `camelCase.ts`，类型文件集中放在 `types/`
- 函数名使用动词开头，例如 `scanSkills`、`detectConflicts`
- 尽量让函数返回结构化数据，不直接打印到 stdout
- CLI 输出与业务判断分离，便于测试
- 第一版先写“最简单但正确”的实现，不做提前抽象

## Testing Strategy

测试目标是证明行为，而不是证明实现方式。

- Unit tests:
  - `resolvePaths`：给定不同用户目录和 cwd，返回正确扫描路径
  - `parseSkill`：能够从 SKILL.md / .mdc 中提取名称、描述、触发词
  - `detectConflicts`：对已知样本产生正确的冲突分级
- Integration tests:
  - `scanSkills`：在临时目录中模拟多平台 Skill 目录，验证 scan 结果
  - CLI 命令：验证 `scan` / `show` / `conflicts` 的 stdout 和 exit code
- Coverage expectation:
  - 核心模块目标覆盖率 80%+
  - CLI 输出格式允许比算法模块略低，但关键路径必须有测试

测试原则：
- 优先真实文件 fixture，而不是大规模 mock
- 冲突检测测试要包含正例和反例
- 一旦出现 bug，先补复现测试，再修复

## Boundaries

- Always:
  - 在新增行为前先补对应测试或 fixture
  - 保持 CLI 可在无网络环境下运行
  - 每次改动后运行受影响的测试与类型检查
  - 新增平台支持时复用统一 `SkillRecord` 抽象
- Ask first:
  - 引入新的核心依赖
  - 将扫描范围扩展到 MCP、hooks、memory 等非 Skill 资产
  - 变更商业定位，从 CLI 工具转为云服务
  - 引入需要联网的模型/API 能力
- Never:
  - 上传用户本地 Skill 内容到外部服务作为默认行为
  - 在没有测试保护的情况下重写冲突检测核心逻辑
  - 为了“以后可能会用”提前加入复杂插件系统
  - 把安全扫描偷偷塞进 v0.1 范围

## Success Criteria

满足以下条件，才算 v0.1 规格被正确实现：

1. 用户在一个空白环境中可通过 `npx skill-doctor scan` 或等价本地命令运行 CLI。
2. 工具能扫描以下主流平台路径（目录存在才纳入，不报错）：

   | Platform | 全局 | 项目 |
   |---|---|---|
   | Claude Code | `~/.claude/skills/` | `.claude/skills/` |
   | Cursor | `~/.cursor/rules/` | `.cursor/rules/`, `.cursorrules` |
   | GitHub Copilot | `~/.github/copilot/` | `.github/copilot-instructions.md` |
  | Codex | `~/.codex/AGENTS.md` | `AGENTS.md` |
   | Gemini CLI | `~/.gemini/skills/` | `.gemini/skills/`, `GEMINI.md` |
   | Windsurf | *(无全局文件路径)* | `.windsurfrules` |
   | Trae | `~/.trae/rules/` | `.trae/rules/` |
   | OpenCode | — | `AGENTS.md`, `skills/` |
   | Kiro | `~/.kiro/skills/` | `.kiro/skills/` |
3. `scan` 命令输出 Skill 总数、平台来源、作用域，以及冲突摘要。
4. `show <name>` 能显示单个 Skill 的名称、来源路径、描述和触发词。
5. `conflicts` 能输出至少一组冲突对，并解释重叠依据与 severity。
6. 冲突检测逻辑完全离线运行，不依赖第三方 API。
7. 核心模块有自动化测试，且类型检查通过。
8. README 和 spec 对齐，不出现“代码实现了但规格没写”或反之。

## Open Questions

1. Copilot 本地规则文件的最小可支持格式到底是什么，v0.1 是否先做降级支持而非完整解析？
2. Cursor `.mdc` 的触发元数据提取规则要做到多精确，还是先统一为纯文本扫描？
3. 冲突分级阈值是否采用固定值，还是在样本跑通后再校准？
4. v0.1 是否需要 `--json` 输出以便后续接 Web Dashboard，还是刻意推迟避免过早抽象？
5. 命令入口是否直接叫 `skill-doctor`，还是先以仓库内部脚本验证交互面，再发布 npm 包？

## Status

- [x] Phase 1: Specify — 已完成，路径覆盖已更新至全平台
- [x] Phase 2: Plan — 见 `doc/specs/skill-doctor-v0.1-plan.md`
- [x] Phase 3: Tasks — 已完成并进入持续回写阶段
- [x] Phase 4: Implement — v0.1 CLI 主链路已落地
- [~] Phase 4a: Release hardening — coverage 门槛与发布清单见 `doc/specs/skill-doctor-v0.1-release-checklist.md`

## Implementation Notes (2026-05-11)

- 当前实现保留了 spec 的核心分层，但为了降低冷启动和依赖复杂度，CLI 入口采用轻量自定义参数解析，而不是 `commander` / `cac`。
- 解析层使用轻量自定义 frontmatter 提取，而不是 `gray-matter`。
- 渲染层当前输出为纯文本格式，未引入 `chalk` 或 `cli-table3`，但保持了 CLI 输出与业务判断分离。
- 已交付命令除 spec 中的最小集合外，还包含 `--scope`、`--json`、`--limit`、`--kind` 等增强参数。
- 当前仓库已推送到私有远程：`evilstar2016/skill-doctor`。
