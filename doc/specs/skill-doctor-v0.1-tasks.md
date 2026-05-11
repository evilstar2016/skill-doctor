# Tasks: Skill Doctor v0.1

> 对应 `spec-driven-development` Phase 3: Tasks  
> 依据：`doc/specs/skill-doctor-v0.1-plan.md`  
> 执行规则：每个 Task 完成后独立验证，不跳过，不批量合并

## Implementation Backfill Status (2026-05-11)

| Task | Status | Notes |
| --- | --- | --- |
| 1 | done | 脚手架、build/test/dev 脚本、tsup/vitest/tsconfig 已完成。 |
| 2 | done | `src/types/skill.ts` 已定义共享类型。 |
| 3 | done | `resolvePaths` 已覆盖 9 个平台，并包含 Codex 误扫修复。 |
| 4 | done | fixtures 已准备并用于解析/冲突测试。 |
| 5 | done | `parseSkill` 与触发词提取已落地。 |
| 6 | done | 分词器与停用词表已落地。 |
| 7 | done | 冲突检测、duplicate 分类与 severity 分级已落地。 |
| 8 | done | 三个 renderer 已落地，当前实现为纯文本格式。 |
| 9 | done | `scan` / `show` / `conflicts` CLI 已完成，并扩展了 `--json`、`--scope`、`--limit`、`--kind`。 |
| 10 | done | 自动化测试链路已齐，`npm run test:coverage` 已恢复；coverage gate 已定义为可执行核心源码模块，当前覆盖率 95.17%。 |
| 11 | done | `bin`、README、私有仓库远程、`npx skill-doctor --version` 冷启动测量（约 1.3s）均已完成。 |

---

## Day 1 — 脚手架 + 类型定义

### Task 1: 初始化项目结构

- **描述**: 在仓库根目录初始化 Node.js + TypeScript 项目，配置构建工具和测试框架
- **Acceptance**:
  - `package.json` 存在，包含 `build`/`test`/`dev` 脚本
  - `tsconfig.json` 配置 `strict: true`，输出到 `dist/`
  - `vitest.config.ts` 配置测试根为 `tests/`
  - `tsup.config.ts` 配置入口为 `src/cli/index.ts`，输出 CJS + ESM
  - `npm run build` 零错误通过（即使 src 还空）
  - `npm test` 零错误通过（即使没有测试文件）
- **Verify**: `npm run build ; npm test ; npx tsc --noEmit`
- **Files**: `package.json`, `tsconfig.json`, `vitest.config.ts`, `tsup.config.ts`, `.gitignore`

---

### Task 2: 定义核心类型

- **描述**: 创建 `src/types/skill.ts`，定义项目全局使用的接口和枚举
- **Acceptance**:
  - `Platform` 联合类型包含全部 9 个平台 + `unknown`
  - `SkillRecord` 接口包含 `name / sourcePath / platform / scope / description / triggers`
  - `ConflictPair` 接口包含 `a / b / similarity / sharedTokens / severity`
  - `Severity` 类型为 `'high' | 'med' | 'low'`
  - 所有类型均有 `export`，无任何运行时代码
- **Verify**: `npx tsc --noEmit`（无类型错误）
- **Files**: `src/types/skill.ts`

---

## Day 2 — 路径解析 + Skill 解析

### Task 3: 实现 PathResolver

- **描述**: 实现 `src/discovery/resolvePaths.ts`，维护平台路径表，枚举存在的 Skill 文件
- **Acceptance**:
  - 导出 `resolvePaths(cwd: string): SkillFile[]`
  - 覆盖 Plan 中全部 9 个平台的路径定义（全局 + 项目级）
  - 不存在的目录/文件静默跳过，不抛异常
  - `.cursorrules` 单文件作为单条 `SkillFile` 返回
  - `AGENTS.md` 可被 codex 和 opencode 同时枚举（不去重）
  - `platform` 字段正确标注，`scope` 字段区分 global/project
- **Verify**: `npm test` — `tests/discovery/resolvePaths.test.ts` 中的全部用例通过
- **Files**: `src/discovery/resolvePaths.ts`, `src/types/skill.ts`（可能微调）, `tests/discovery/resolvePaths.test.ts`

**测试要求**:
- 给定临时目录模拟 `~/.claude/skills/` 中有两个 SKILL.md，验证返回 2 条记录，platform=claude，scope=global
- 给定 cwd 中有 `.cursor/rules/`，验证 platform=cursor，scope=project
- 给定不存在的目录，验证返回空数组、不报错
- 给定 cwd 中同时有 `AGENTS.md`（被 codex + opencode 各扫一次），验证返回 2 条，各自 platform 不同

---

### Task 4: 准备解析 Fixture 文件

- **描述**: 在 `tests/fixtures/` 下创建各平台格式的样本文件，供 SkillParser 测试使用
- **Acceptance**:
  - `claude-with-frontmatter.md` — 含 YAML frontmatter（name/description）+ `## When to Use` 段落
  - `claude-no-frontmatter.md` — 纯 Markdown，只有 H1 标题
  - `cursor-with-globs.mdc` — 含 globs frontmatter 的 Cursor 格式
  - `copilot-instructions.md` — 含 `applyTo` frontmatter 的 Copilot 格式
  - `agents-md.md` — 类似 AGENTS.md 的单文件格式
  - `conflicting-a.md` / `conflicting-b.md` — 两个高度相似的 Skill，用于冲突检测测试
  - `unrelated-a.md` / `unrelated-b.md` — 两个完全不同的 Skill，用于验证无冲突场景
- **Verify**: fixture 文件存在，格式正确（人工 review 内容合理）
- **Files**: `tests/fixtures/*.md`, `tests/fixtures/*.mdc`

---

### Task 5: 实现 SkillParser

- **描述**: 实现 `src/parsing/parseSkill.ts`，将 `SkillFile` 解析为 `SkillRecord`
- **Acceptance**:
  - 导出 `parseSkill(file: SkillFile): SkillRecord`
  - 能正确解析 Task 4 准备的全部 8 种 fixture
  - frontmatter 中的 `name` 优先，否则取 H1 标题，否则取文件名
  - `description` 优先取 frontmatter，否则取 `## Description` 段落，否则取正文前 200 字
  - `triggers` 从 `## When to Use` / `## Trigger` / `description:` 字段中提取
  - 对损坏或空文件返回 `null`（不抛异常）
- **Verify**: `npm test` — `tests/parsing/parseSkill.test.ts` 全部通过
- **Files**: `src/parsing/parseSkill.ts`, `src/parsing/extractTriggers.ts`, `tests/parsing/parseSkill.test.ts`

---

## Day 3 — 冲突检测

### Task 6: 实现分词器

- **描述**: 实现 `src/conflicts/tokenize.ts`，将文本转换为 token 集合
- **Acceptance**:
  - 导出 `tokenize(text: string): Set<string>`
  - 按空格 / 驼峰 / 连字符 / 下划线分割
  - 小写化，过滤长度 ≤ 2 的 token
  - 过滤停用词（中英双语，约 80 词，见文末列表）
  - 对空字符串返回空 Set，不报错
- **Verify**: `npm test` — `tests/conflicts/tokenize.test.ts` 通过，对 "Create a PR with git commit" 能正确产出 `{"create", "pull", "request", "git", "commit"}` 类似结果
- **Files**: `src/conflicts/tokenize.ts`, `src/conflicts/stopwords.ts`, `tests/conflicts/tokenize.test.ts`

---

### Task 7: 实现 ConflictDetector

- **描述**: 实现 `src/conflicts/detectConflicts.ts`，对 `SkillRecord[]` 两两计算 Jaccard 相似度，产出 `ConflictPair[]`
- **Acceptance**:
  - 导出 `detectConflicts(skills: SkillRecord[]): ConflictPair[]`
  - 只返回 similarity ≥ 0.25 的 pair
  - severity 阈值：≥ 0.65 = high，≥ 0.40 = med，≥ 0.25 = low
  - `sharedTokens` 包含交集 token，最多展示前 10 个（按字母排序）
  - 不返回自身与自身的 pair
  - 输入空数组或只有一条记录时返回空数组
- **Verify**: `npm test` — `tests/conflicts/detectConflicts.test.ts` 通过：
  - `conflicting-a` + `conflicting-b` fixture → severity = high
  - `unrelated-a` + `unrelated-b` fixture → 无 pair 返回
- **Files**: `src/conflicts/detectConflicts.ts`, `tests/conflicts/detectConflicts.test.ts`

---

## Day 4 — 渲染层 + CLI 骨架

### Task 8: 实现 Renderer

- **描述**: 实现三个渲染函数，返回字符串（不直接 console.log）
- **Acceptance**:
  - `renderScan(skills: SkillRecord[], conflicts: ConflictPair[]): string` — 输出平台统计表 + 冲突摘要
  - `renderShow(skill: SkillRecord): string` — 输出单 Skill 详情卡片
  - `renderConflicts(pairs: ConflictPair[]): string` — 输出冲突对表格，high 红色，med 黄色
  - 无 chalk 时（CI 环境）输出纯文本，不报错（`chalk` 支持 `FORCE_COLOR=0`）
  - 渲染函数不引入任何业务逻辑，只做格式化
- **Verify**: `npm test` — `tests/render/` 下测试通过（验证输出字符串包含关键内容，不验证颜色）
- **Files**: `src/render/renderScan.ts`, `src/render/renderShow.ts`, `src/render/renderConflicts.ts`, `tests/render/*.test.ts`

---

### Task 9: 实现 CLI 入口

- **描述**: 实现 `src/cli/index.ts`，注册三个命令，串联各模块
- **Acceptance**:
  - `scan` 命令：调用 PathResolver → SkillParser → ConflictDetector → renderScan，打印输出
  - `show <name>` 命令：在 scan 结果中按 name 查找，调用 renderShow；未找到时输出错误 + exit 1
  - `conflicts` 命令：调用 ConflictDetector → renderConflicts；`--fail-on <high|med>` 时，如有匹配 severity 则 exit 1
  - `--version` 从 `package.json` 读取版本号
  - `--help` 输出所有命令的说明
- **Verify**: 手动运行 `node dist/cli/index.js scan`，能在本仓库 `.claude/skills/` 目录中发现已安装的 6 个 Skill
- **Files**: `src/cli/index.ts`, `src/discovery/scanSkills.ts`

---

## Day 5 — 集成测试 + 发布配置

### Task 10: 集成测试 + CLI E2E

- **描述**: 在临时目录模拟多平台环境，验证三个命令全链路可用
- **Acceptance**:
  - `tests/cli/` 下有集成测试，使用 `execa` 运行构建后的 CLI 二进制
  - `scan` 命令能发现至少一个 fixture Skill
  - `show` 命令对存在的 Skill 输出详情，对不存在的 Skill exit 1
  - `conflicts --fail-on high` 在有 high 冲突时 exit 1，无冲突时 exit 0
  - `npm run test:coverage` 核心模块覆盖率 ≥ 80%
- **Verify**: `npm test ; npm run test:coverage`
- **Files**: `tests/cli/integration.test.ts`

---

### Task 11: npm 包配置 + README

- **描述**: 配置 `package.json` 的 `bin` 字段，确保 `npx skill-doctor` 可用；写 README 基础内容
- **Acceptance**:
  - `package.json` 中 `bin.skill-doctor` 指向构建产物
  - `npm link` 后本地可直接运行 `skill-doctor scan`
  - `npx skill-doctor --version` 冷启动 ≤ 3s（本地测量）
  - `README.md` 包含：一句话描述、安装方法、三个命令示例、覆盖平台列表
- **Verify**: `npm link ; skill-doctor --version`（输出版本号，无报错）
- **Files**: `package.json`（补 bin 字段）, `README.md`

---

## 停用词表（Task 6 参考）

**英文高频通用词（~50词）**: a, an, the, and, or, or, not, is, are, was, were, be, been, have, has, had, do, does, did, will, would, could, should, may, might, can, this, that, these, those, with, for, from, to, of, in, on, at, by, as, it, its, if, so, but, when, where, how, what, which, who

**中文高频通用词（~30词）**: 的、了、在、是、我、有、和、就、不、都、一、这、中、上、个、到、说、要、去、你、会、着、没、看、好、自、来、用、们、为

---

## Status

- [x] Phase 1: Specify
- [x] Phase 2: Plan
- [x] Phase 3: Tasks — 共 11 个 Tasks，跨 5 天
- [~] Phase 4: Implement — 主体已完成，正在做 release hardening
