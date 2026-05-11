# Plan: Skill Doctor v0.1 — Technical Implementation Plan

> 对应 `spec-driven-development` Phase 2: Plan  
> 依据 spec：`doc/specs/skill-doctor-v0.1-spec.md`  
> 进入 Phase 3（Tasks）前需人工 review 本文档

---

## 1. 架构总览

```
CLI Entry (commander)
      │
      ├── scan ──────────────► PathResolver ──► SkillScanner ──► SkillParser
      │                                                                │
      ├── show <name> ◄─────────────────────────── SkillRecord[]  ◄──┘
      │
      └── conflicts ──────────► ConflictDetector ──► ConflictPair[]
                                                           │
                                         Renderer (chalk / cli-table3)
```

**四个核心模块**，职责单一，无交叉依赖：

| 模块 | 职责 | 输入 | 输出 |
|---|---|---|---|
| `PathResolver` | 维护平台路径表，枚举存在的 Skill 文件 | 平台配置 + cwd | `SkillFile[]` |
| `SkillParser` | 读取文件，提取结构化字段 | `SkillFile` | `SkillRecord` |
| `ConflictDetector` | 计算相似度，产出冲突对 | `SkillRecord[]` | `ConflictPair[]` |
| `Renderer` | 终端彩色输出，不做业务判断 | `SkillRecord[] / ConflictPair[]` | stdout |

---

## 2. 组件依赖与实现顺序

按依赖图从底层到顶层：

```
Layer 0:  types/skill.ts           ← 最先定，无任何依赖
Layer 1:  PathResolver             ← 只依赖 Node.js fs/path
Layer 2:  SkillParser              ← 依赖 gray-matter + types
Layer 3:  ConflictDetector         ← 依赖 SkillRecord
Layer 3:  Renderer                 ← 依赖 SkillRecord + ConflictPair（可并行）
Layer 4:  CLI commands             ← 依赖全部 Layer 1-3
```

Layer 1-3 内部可以并行开发，但必须在有 types 之后才能开始。

---

## 3. 各组件设计决策

### 3.1 types/skill.ts

```ts
export type Platform =
  | 'claude' | 'cursor' | 'copilot' | 'codex'
  | 'gemini' | 'windsurf' | 'trae' | 'opencode' | 'kiro'
  | 'unknown';

export type Scope = 'global' | 'project';
export type Severity = 'high' | 'med' | 'low';
export type Confidence = 'high' | 'low';  // 用于标记 Trae/OpenCode 等路径不确定的平台

export interface SkillRecord {
  name: string;
  sourcePath: string;
  platform: Platform;
  scope: Scope;
  description: string;
  triggers: string[];
}

export interface ConflictPair {
  a: SkillRecord;
  b: SkillRecord;
  similarity: number;        // 0-1 的 Jaccard 分数
  sharedTokens: string[];    // 重叠词汇，用于输出解释
  severity: Severity;
}
```

### 3.2 PathResolver

**平台路径表**（hardcoded，后续可配置化）：

```ts
const PLATFORM_PATHS: PlatformDef[] = [
  {
    platform: 'claude',
    global: [join(HOME, '.claude', 'skills')],
    project: ['.claude/skills'],
    extensions: ['.md'],
  },
  {
    platform: 'cursor',
    global: [join(HOME, '.cursor', 'rules')],
    project: ['.cursor/rules', '.cursorrules'],   // .cursorrules 是单文件
    extensions: ['.md', '.mdc'],
  },
  {
    platform: 'copilot',
    global: [join(HOME, '.github', 'copilot')],
    project: ['.github/copilot-instructions.md', '.github/instructions'],
    extensions: ['.md', '.instructions.md'],
  },
  {
    platform: 'codex',
    global: [join(HOME, '.codex', 'AGENTS.md')],
    project: ['AGENTS.md'],
    extensions: ['.md'],
  },
  {
    platform: 'gemini',
    global: [join(HOME, '.gemini', 'skills')],
    project: ['.gemini/skills', 'GEMINI.md'],
    extensions: ['.md'],
  },
  {
    platform: 'windsurf',
    global: [],                                   // 无全局文件路径
    project: ['.windsurfrules'],
    extensions: ['.md'],
  },
  {
    platform: 'trae',
    global: [join(HOME, '.trae', 'rules')],       // confidence: low
    project: ['.trae/rules'],
    extensions: ['.md'],
  },
  {
    platform: 'opencode',
    global: [],
    project: ['AGENTS.md', 'skills'],             // AGENTS.md 与 codex 共享，按路径区分
    extensions: ['.md'],
  },
  {
    platform: 'kiro',
    global: [join(HOME, '.kiro', 'skills')],
    project: ['.kiro/skills'],
    extensions: ['.md'],
  },
];
```

**关键决策：**
- `AGENTS.md` 在 Codex 和 OpenCode 都使用，PathResolver 扫描时按存在性判断，可能两个平台都扫到同一文件——**不去重，标注来源**，让用户看到"这个文件被多个平台识别"
- Codex 全局路径不再递归扫描整个 `.codex/` 目录，只认 `~/.codex/AGENTS.md` 这个入口文件，避免把示例文档和参考资料误当成 Skill
- `.cursorrules` 是单个文件，不是目录，特殊处理：如果存在就当作一个 SkillRecord
- 不存在的目录/文件静默跳过，无警告

### 3.3 SkillParser

**多格式统一策略：**

解析器按文件特征分派到不同的子解析器，统一输出 `SkillRecord`：

| 文件模式 | 子解析器 | 提取字段 |
|---|---|---|
| YAML frontmatter 存在 | `parseFrontmatter` | `name`, `description` from frontmatter |
| `## When to Use` 段落 | `extractWhenToUse` | 将段落内容作为 triggers |
| `## Description` 段落 | `extractDescription` | fallback description |
| 无 frontmatter 的纯 MD | `parseRawMarkdown` | 用文件名作为 name，H1 标题或前200字作为 description |
| `.mdc`（Cursor）| `parseMdc` | 解析 globs 字段 + 正文 |

**触发词提取（triggers）优先级：**
1. frontmatter `description:` 字段
2. `## When to Use` 段落内容
3. `## Usage` / `## Trigger` 段落
4. fallback：文件名的 slug 化版本

### 3.4 ConflictDetector

**Jaccard 相似度：**

```
Jaccard(A, B) = |tokens(A) ∩ tokens(B)| / |tokens(A) ∪ tokens(B)|
```

**分词管道：**
1. 合并 `description` + `triggers` 为一段文本
2. 分词：按空格/驼峰/连字符分割
3. 小写化
4. 过滤停用词（中英双语基础停用词表，~100词）
5. 去除长度 ≤ 2 的 token

**Severity 阈值（初始值，发布后根据数据校准）：**

| Severity | Jaccard 阈值 | 含义 |
|---|---|---|
| `high` | ≥ 0.65 | 两个 Skill 大量重叠，几乎必然冲突 |
| `med` | ≥ 0.40 | 重叠显著，可能竞争同类任务 |
| `low` | ≥ 0.25 | 轻度重叠，仅作参考 |
| 忽略 | < 0.25 | 不输出 |

**ConflictPair 里保留 `sharedTokens`**：让用户看到"git, commit, branch, PR"等具体词汇，比分数更可解释。

### 3.5 Renderer

- 使用 `chalk` 控制颜色（`high` = 红，`med` = 黄，`low` = 白）
- 使用 `cli-table3` 输出表格
- 所有 Renderer 函数接受数据、不做业务判断、不直接 console.log（返回字符串），CLI 层统一打印——便于测试断言

---

## 4. 风险与缓解策略

| 风险 | 概率 | 影响 | 缓解策略 |
|---|---|---|---|
| Trae/OpenCode 路径不准确 | 高 | 低 | 路径不存在时静默跳过，用户无感知；v0.2 可接受 PR 修正 |
| `AGENTS.md` 被多个平台扫到 | 中 | 低 | 当作功能：展示"此文件被多平台识别"，提醒用户注意 |
| `.cursorrules` 单文件解析歧义 | 中 | 低 | 将文件整体视为一个 SkillRecord，名称取文件名 |
| npx 冷启动超过 3s | 低 | 中 | 严格控制依赖数量；`tsup` bundle 成单文件减少模块加载时间；发布前计时验证 |
| 停用词表导致误判 | 中 | 低 | 先用极小停用词表（高频通用词），技术词汇保留；样本测试后逐步扩充 |
| 冲突阈值误报率高 | 中 | 中 | v0.1 先用保守阈值（0.65 才 high）；收集真实用户 Skill 集合校准 |

---

## 5. 并行 vs 顺序

```
顺序（有依赖）:
  Day 1a: 项目脚手架（tsup / vitest / commander 配置）
  Day 1b: types/skill.ts（必须最先定，所有模块依赖）

可并行（Day 2 开始）:
  ├── PathResolver + 测试
  └── SkillParser + fixture 文件准备

顺序（PathResolver + SkillParser 完成后）:
  Day 3: ConflictDetector + 测试（需要有 SkillRecord 样本）

可并行（Day 4）:
  ├── Renderer（只依赖类型定义）
  └── CLI commands 骨架

顺序（Day 5）:
  集成测试 + E2E CLI 测试 + npm 包配置
```

---

## 6. 验证检查点

| 检查点 | 时间 | 验证方式 |
|---|---|---|
| Types 定义 | Day 1 结束 | 无编译错误，`tsc --noEmit` 通过 |
| PathResolver | Day 2 | 单元测试通过；在开发机上 `scan` 能找到本项目的 `.claude/skills/` |
| SkillParser | Day 2-3 | 能正确解析本项目现有 6 个 SKILL.md fixture |
| ConflictDetector | Day 3 | 对手工标注的冲突对输出正确 severity，对非冲突对输出 < 0.25 |
| CLI scan | Day 4 | `node dist/cli/index.js scan` 输出表格，不报错 |
| 集成 | Day 5 | `npx .` 冷启动 ≤ 3s；三个命令全部可用 |

---

## 7. Open Questions 决议（基于现有信息）

1. **Copilot 格式**：v0.1 降级处理，`.instructions.md` 读取正文 + `applyTo` frontmatter，不做深度解析
2. **`.mdc` 精度**：纯文本扫描为主，globs 字段提取为附加 trigger
3. **阈值**：v0.1 使用固定值（0.65/0.40/0.25），不在运行时可配置；后续根据数据调整
4. **`--json` 输出**：v0.1 不加，刻意延后；CLI 已设计为"Renderer 返回字符串"，加 `--json` 改动极小
5. **命令名**：直接叫 `skill-doctor`，本地 dev 阶段用 `npm link`，发布时用 `npx skill-doctor`

---

## Status

`spec-driven-development` Phase 2: Plan — 待人工 review  
Phase 3（Tasks breakdown）将在 review 通过后开始
