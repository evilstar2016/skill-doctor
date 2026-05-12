# Spec: F2 Embedding-Based Conflict Detection

> 在现有 token overlap 冲突检测之上，引入本地 embedding 语义检测与可选 AI 分析。  
> 本 spec 对应 F2 的下一阶段能力，目标是降低误报、提升相近 skill 的边界解释能力。

## Objective

让 `skill-doctor conflicts` 不再主要依赖共享词，而能基于 skill 的语义相似性检测真正的冲突候选，并在需要时给出更清晰的差异说明。

核心用户问题：

> **"这两个 skill 真的冲突吗，还是只是看起来像？如果冲突，它们的边界和优劣势分别是什么？"**

## Scope

本阶段覆盖两部分：

1. **本地 embedding 冲突检测**
   - 用用户配置的本地 / OpenAI-compatible embedding API 对 skill 语义文本做向量化
   - 用 cosine similarity 作为 conflict candidate 的主要判定依据
   - duplicate 检测继续保留现有同名规则，不改为 embedding

2. **可选 AI 分析**
   - 仅对高相似候选对进行二次分析
   - 输出 overlap / boundary / strengths / verdict
   - 默认关闭，不影响离线基础能力

## Assumptions

1. 当前仓库扫描规模仍是几十到低几百个 skill，不需要真正的向量数据库。
2. duplicate 检测仍然以 `name + sourcePath` 规则为准，优先级高于语义冲突。
3. embedding 与 AI 分析都必须是可选策略，不能破坏现有 `token` 默认行为。
4. v1 的 AI 分析只增强解释性，不参与 `--fail-on` 的 exit 判定。
5. Windows 本地运行是必须支持的，依赖选择要尽量减少原生编译负担。

## User-Facing Changes

### Updated Command

```bash
skill-doctor conflicts [options]
skill-doctor scan [options]
```

### New Options

| Flag | 说明 |
|------|------|
| `--strategy <token\|embedding>` | 冲突检测策略，默认 `token` |
| `--threshold <0..1>` | embedding 相似度阈值 |
| `--embedding-model <id>` | 覆盖配置文件中的 embedding 模型名 |
| `--analyze` | 对候选冲突对做 AI 分析 |
| `--analysis-provider <ollama>` | AI 分析 provider，第一版仅本地 Ollama |

### Expected Behavior

- `--strategy token`：保持当前行为不变
- `--strategy embedding`：
  - duplicate 仍按同名规则返回
  - semantic conflict 改由 embedding similarity 判定
  - 默认从 `~/.skill-doctor/config.json` 读取 `embedding.baseUrl`、`embedding.model`、`embedding.apiKey`
  - `--embedding-model` 可覆盖配置文件中的模型名
  - `sharedTokens` 继续作为 explainability evidence 输出
- `--analyze`：在 JSON / 终端 / HTML 输出中增加结构化分析摘要

## Detection Model

### Stage 1 — Duplicate Detection

复用现有规则：
- `normalizeName(left.name) === normalizeName(right.name)`
- `left.sourcePath !== right.sourcePath`
- 命中后直接返回 `kind: 'duplicate'`

### Stage 2 — Embedding Conflict Detection

为每个 `SkillRecord` 构造语义文本：

```text
name + description + triggers
```

设计原则：
- 不只看 `description`
- `triggers` 能提供使用场景信号
- `name` 能提供职责标签

检测过程：
1. 生成语义文本
2. 获取 embedding（模型本地运行）
3. 对 skill 两两计算 cosine similarity
4. similarity ≥ threshold 时，记为 `kind: 'conflict'`
5. 同时保留 token overlap 生成 `sharedTokens`

### Stage 3 — Optional AI Analysis

仅对 embedding similarity 超阈值的 pair 执行：
- summarize overlap
- explain boundaries
- explain strengths of A / B
- output verdict: `conflicting` / `adjacent` / `distinct`

## Data Model

```ts
export interface ConflictAnalysis {
  summary: string;
  overlapAreas: string[];
  boundaries: string[];
  strengthsA: string[];
  strengthsB: string[];
  verdict: 'conflicting' | 'adjacent' | 'distinct';
}

export interface ConflictPair {
  a: SkillRecord;
  b: SkillRecord;
  kind: 'duplicate' | 'conflict';
  similarity: number;
  sharedTokens: string[];
  severity: 'high' | 'med' | 'low';
  detectionMethod?: 'duplicate-name' | 'token' | 'embedding';
  analysis?: ConflictAnalysis;
}
```

## Architecture

```text
src/
  conflicts/
    detectConflicts.ts              # async coordinator + strategy selection
    token/
      detectTokenConflicts.ts       # current behavior extracted
    semantic/
      buildSemanticText.ts          # name + description + triggers
      cosine.ts                     # vector similarity helpers
      embeddingProvider.ts          # configured OpenAI-compatible embedding API adapter
      embeddingCache.ts             # local JSON-backed cache
      detectEmbeddingConflicts.ts   # embedding-based candidate detection
    analysis/
      buildAnalysisPrompt.ts        # structured prompt builder
      ollamaClient.ts               # local model HTTP client
      analyzeConflictPair.ts        # optional AI analysis
  render/
    renderConflicts.ts
    renderReport.ts
  cli/
    index.ts
  types/
    skill.ts
```

## Storage Strategy

### Embedding Storage

v1 不使用真正的 vector DB。

使用方式：
- 本地 JSON 缓存文件作为 embedding store
- key: `modelId + textHash`
- value: embedding vector + metadata

原因：
- 当前数据量小
- 内存全量 pairwise comparison 足够
- 可避免额外 native / DB 依赖
- 更适合 Windows CLI

### AI Analysis Runtime

第一版仅考虑：
- 本地 Ollama HTTP API
- 默认关闭
- 没有配置时，不影响基础 conflict 结果

## Rollout Plan

### Slice 1 — Strategy skeleton (no behavior change)
- 把当前 token 逻辑抽到可切换 strategy
- 默认仍使用 `token`
- `ConflictPair` 扩展新字段

### Slice 2 — Local embedding detection
- 添加 semantic text builder
- 添加 local embedding provider
- 添加 JSON embedding cache
- 实现 `embedding` strategy

### Slice 3 — Optional AI analysis
- 增加 `--analyze`
- 对 candidate pairs 追加 analysis payload

### Slice 4 — CLI / render / report polish
- 扩展 JSON 输出
- 更新 terminal renderer
- 更新 HTML report
- 补 manual smoke tests

## Acceptance Criteria

| # | Criterion |
|---|-----------|
| AC1 | `conflicts --strategy token` 行为与现状一致 |
| AC2 | `conflicts --strategy embedding` 可在本地模型可用时返回 semantic conflicts |
| AC3 | duplicate 与 semantic conflict 能同时输出且互不覆盖 |
| AC4 | `--json` 输出包含 `detectionMethod`，`analysis` 为可选字段 |
| AC5 | `--analyze` 开启时返回结构化分析；关闭时不出现分析字段 |
| AC6 | embedding cache 可复用，二次运行快于首次冷启动 |
| AC7 | `npm test` 与 `npm run build` 全绿 |
| AC8 | 当前仓库 `.claude/skills` smoke test 能减少明显误报 |

## Verification

### Automated
- `tests/conflicts/detectConflicts.test.ts`
- `tests/cli/integration.test.ts`
- `tests/render/render.test.ts`
- 必要时新增 `tests/conflicts/semantic/*.test.ts`

### Manual
- `npx skill-doctor conflicts --strategy token`
- `npx skill-doctor conflicts --strategy embedding --json`
- `npx skill-doctor scan --strategy embedding --report`
- 如启用 AI：`npx skill-doctor conflicts --strategy embedding --analyze --json`

## Out of Scope (v1)

- 真正的向量数据库 / ANN 检索
- 将 AI 分析结果反向影响 `severity`
- 远程云模型作为默认运行时
- 自动 remediation / merge 建议直接写入文件

## Open Questions

1. 默认 embedding 模型是否随仓库文档固定，还是允许用户自由指定？
2. AI 分析是否只支持 Ollama，还是预留 provider 抽象但先不暴露更多 provider？
3. `scan --report` 的 HTML 中 analysis 信息是否默认展示，还是只在 `--analyze` 且有数据时展示？
