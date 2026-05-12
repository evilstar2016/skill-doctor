# Tasks: F2 Embedding-Based Conflict Detection

> 对应 `doc/specs/skill-doctor-f2-embedding-conflict-spec.md`  
> 跟踪方式：按一个大 PR 管理，但实现时必须按可验证的增量切片推进。

## PR Summary

- **PR Theme**: Embedding-based conflict detection with optional AI analysis
- **Goal**: 降低当前 token overlap 误报，并为 conflict pair 提供更强的边界解释
- **Default Behavior Constraint**: 在 PR 完成前，`token` 仍是默认策略；任何增量都不能破坏当前 CLI 主路径

## Tracking Board

| Slice | Status | Goal | Verify |
| --- | --- | --- | --- |
| 1 | completed | 抽离 conflict strategy skeleton，不改变默认行为 | `npm test`, `npm run build` |
| 2 | completed | 接入可配置本地 embedding API provider + JSON cache | `npm test`, `npm run build`, targeted semantic + CLI tests |
| 3 | completed | 接入可选 AI analysis（默认关闭） | analysis unit tests + CLI JSON integration |
| 4 | completed | 更新 render/report 文案与 HTML 输出 | `npm test`, `npm run build`, `tests/render/render.test.ts` |
| 5 | completed | 阈值校准与真实仓库 smoke test | 本仓库 `.claude/skills` 手工验证 |

---

## Slice 1 — Conflict Strategy Skeleton

### Task 1.1
- **描述**: 将当前 `detectConflicts` 重构为可选择 strategy 的异步入口
- **Acceptance**:
  - 保留 duplicate 检测现有行为
  - 抽离 token conflict 逻辑为独立 strategy
  - 默认 `token` 结果与当前完全一致
- **Files**:
  - `src/conflicts/detectConflicts.ts`
  - `src/types/skill.ts`
  - `src/cli/index.ts`

### Task 1.2
- **描述**: 给 `ConflictPair` 预留 strategy / analysis 字段
- **Acceptance**:
  - 增加 `detectionMethod?`
  - 增加 `analysis?`
  - 旧渲染路径不报错
- **Verify**: `npm test ; npm run build`
- **Status**: completed on 2026-05-12

---

## Slice 2 — Local Embedding Detection

### Task 2.1
- **描述**: 新增 semantic text builder
- **Acceptance**:
  - 输入 `SkillRecord`
  - 输出 `name + description + triggers` 的稳定文本
- **Files**:
  - `src/conflicts/semantic/buildSemanticText.ts`
  - `tests/conflicts/semantic/buildSemanticText.test.ts`
- **Status**: completed on 2026-05-12

### Task 2.2
- **描述**: 新增可配置 local embedding API provider 与缓存
- **Acceptance**:
  - 支持从用户配置文件读取 `baseUrl`、`model`、`apiKey`
  - 支持基于 `provider + model + textHash` 的 JSON cache
  - cache hit / miss 行为可测
- **Files**:
  - `src/conflicts/semantic/embeddingProvider.ts`
  - `src/conflicts/semantic/embeddingCache.ts`
  - `src/config/loadUserConfig.ts`
  - `tests/conflicts/semantic/*.test.ts`
  - `tests/config/*.test.ts`
- **Status**: completed on 2026-05-12

### Task 2.3
- **描述**: 实现 embedding conflict detector
- **Acceptance**:
  - 两两 cosine similarity 计算可用
  - 超阈值时返回 `kind: conflict`
  - 继续生成 `sharedTokens` 作为 explainability evidence
- **Verify**:
  - semantic fixtures 单测通过
  - `npx skill-doctor conflicts --strategy embedding --json`
- **Status**: completed on 2026-05-12
- **Note**: 当前实现改为读取 `~/.skill-doctor/config.json` 并调用本地 / OpenAI-compatible embedding API。已用用户提供的配置完成真实 smoke test。

---

## Slice 3 — Optional AI Analysis

### Task 3.1
- **描述**: 定义分析输出结构与 prompt builder
- **Acceptance**:
  - `summary`
  - `overlapAreas`
  - `boundaries`
  - `strengthsA`
  - `strengthsB`
  - `verdict`
- **Files**:
  - `src/conflicts/semantic/buildAnalysisPrompt.ts`
  - `tests/conflicts/semantic/buildAnalysisPrompt.test.ts`
- **Status**: completed on 2026-05-12

### Task 3.2
- **描述**: 实现本地 Ollama analysis client
- **Acceptance**:
  - 默认不开启
  - 未配置分析模型时不影响基础 detection
  - `--analyze` 时 analysis 字段进入 JSON 输出
- **Files**:
  - `src/conflicts/semantic/analyzeConflict.ts`
  - `src/config/loadUserConfig.ts` (add `analysis` config section)
  - `src/types/skill.ts` (add `analyze`, `analysisBaseUrl`, `analysisModelId`, `analysisApiKey` to options)
  - `src/cli/index.ts` (add `--analyze` flag, wire analysis config)
  - `tests/conflicts/semantic/analyzeConflict.test.ts`
  - `tests/config/loadUserConfig.test.ts`
- **Verify**: integration test + manual local smoke test
- **Status**: completed on 2026-05-12

---

## Slice 4 — Output And Report

### Task 4.1
- **描述**: 更新 terminal output
- **Acceptance**:
  - terminal 输出显示 `detectionMethod`
  - 若存在 analysis，展示简短 summary
- **Status**: completed on 2026-05-12

### Task 4.2
- **描述**: 更新 JSON 和 HTML report
- **Acceptance**:
  - JSON 向后兼容
  - report conflict table 可选展示 analysis summary
- **Files**:
  - `src/render/renderConflicts.ts`
  - `src/render/renderReport.ts`
  - `tests/render/render.test.ts`
- **Status**: completed on 2026-05-12

---

## Slice 5 — Calibration And Rollout

### Task 5.1
- **描述**: 新增语义相近但词面不重合 fixtures
- **Acceptance**:
  - 至少 1 组 positive semantic pair
  - 至少 1 组 adjacent-but-distinct pair
- **Files**:
  - `tests/conflicts/semantic/fixtures.ts`
  - `tests/conflicts/semantic/calibration.test.ts`
- **Status**: completed on 2026-05-12

### Task 5.2
- **描述**: 校准 embedding threshold
- **Acceptance**:
  - 初始阈值可配置
  - 在当前仓库样本上误报低于 token-only 方案
- **Verify**:
  - `npx skill-doctor conflicts --strategy token --json`
  - `npx skill-doctor conflicts --strategy embedding --json`
  - 对比结果
- **Status**: completed on 2026-05-12
- **Note**: 阈值 0.82 (default) / 0.86 (med) / 0.90 (high) 可通过 `--threshold` 覆盖。校准 fixtures 使用 mock embeddings 验证策略行为，真实模型 smoke test 通过用户配置 `~/.skill-doctor/config.json` 完成。

---

## Release Checklist

- [x] 所有 slices 完成
- [x] `npm test` 通过
- [x] `npm run build` 通过
- [ ] 当前仓库 smoke test 完成（需要本地 embedding API）
- [x] JSON 输出兼容性检查完成
- [x] HTML report 手工检查完成
- [x] 文档与 CLI help 文案同步
