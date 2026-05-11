# Spec: F4 Explanation Layer

> 在 v0.1 和 F5 的基础上叠加「可读性」层。  
> 目标：让用户不只是看到 skill 存在，还能理解它的用途和归属。

## Objective

用户当前面对的问题：

1. `show <name>` 输出的是原始字段堆叠，看不出「什么时候该用这个 skill」
2. `scan` 把所有 skill 按平台平铺，装了 30 个 skill 的用户根本无法快速定位

F4 回答这两个问题，完全离线，不依赖任何 AI API。

## Assumptions

1. 解释内容完全从已有字段生成（name / description / triggers），不做语义推理。
2. 分组基于 token 重叠聚类，不依赖预定义的 workflow 分类表。
3. 两个新功能都是纯展示层增强，不改变已有命令的默认行为。
4. 复用 `tokenize` 已有分词器，不引入新的文本处理依赖。

## F4.1 — 增强 `show` 命令

### 当前输出（简化）

```
SKILL: git-workflow
Platform: claude
Scope: global
Description: manage git workflow, branches, commits, and pull requests
Triggers: create branch, write commit message, open pull request
```

### 新输出

```
SKILL: git-workflow
Platform: claude  |  Scope: global

DESCRIPTION
  Manage git workflow, branches, commits, and pull requests.

WHEN TO USE
  → create branch
  → write commit message
  → open pull request

RELATED SKILLS  (based on shared triggers)
  github-automation  (similarity: 0.82, shared: branch, commit, pull)
```

### 规则

| 字段 | 生成规则 |
|------|----------|
| DESCRIPTION | 直接取 `skill.description`，首字母大写，确保以句号结尾 |
| WHEN TO USE | 取 `skill.triggers`，每条加 `→` 前缀；若 triggers 为空则显示 `(no trigger conditions defined)` |
| RELATED SKILLS | 从已扫描的所有 skill 中，找 Jaccard similarity ≥ 0.25 的 skill，最多展示 3 个，按 similarity 降序 |

RELATED SKILLS 需要 full scan，因此 `show` 命令要执行完整的 `scanSkills`（当前已经是这样），然后额外计算 similarity。

### Options 变更

`show` 命令不新增 flag，`--json` 输出中新增 `relatedSkills` 字段：

```json
{
  "name": "git-workflow",
  "platform": "claude",
  "scope": "global",
  "description": "...",
  "triggers": ["create branch", "..."],
  "relatedSkills": [
    { "name": "github-automation", "similarity": 0.82, "sharedTokens": ["branch", "commit"] }
  ]
}
```

---

## F4.2 — `scan --group` 分组视图

### 命令

```bash
skill-doctor scan --group [--scope project|global|all] [--json]
```

`--group` 与其他 scan flag（`--scope`、`--json`）正交，可以同时使用。

### 输出示例（plain text）

```
Skill Groups — 18 skills across 5 groups

── Version Control (3 skills) ────────────────
  git-workflow          claude / global
  github-automation     claude / global
  commit-helper         cursor / project

── Documentation (4 skills) ──────────────────
  readme-generator      claude / global
  docs-writer           claude / global
  api-doc-helper        cursor / project
  changelog-gen         claude / global

── Code Review (2 skills) ────────────────────
  review-helper         claude / global
  pr-reviewer           claude / global

── (other) (9 skills) ────────────────────────
  skill-a               claude / global
  ...
```

### 分组算法

1. **Tokenize**：对每个 skill 的 `description + triggers` 分词（复用 `tokenize`）
2. **构建邻接关系**：两个 skill 如果 Jaccard similarity ≥ 0.30，则认为相关
3. **贪心聚类（Union-Find）**：将相关的 skill pair 合并到同一 group
4. **Group 命名**：取 group 内所有 skill 的 token 集合，选 top-3 高频 token 组成 label（跳过 stopwords）
5. **孤立 skill**：similarity < 0.30 且与其他任何 skill 无关联的，归入 `(other)` 组

### JSON 输出结构

```json
{
  "groups": [
    {
      "label": "git branch commit",
      "skills": [
        { "name": "git-workflow", "platform": "claude", "scope": "global" },
        { "name": "github-automation", "platform": "claude", "scope": "global" }
      ]
    }
  ],
  "ungrouped": [
    { "name": "skill-a", "platform": "claude", "scope": "global" }
  ]
}
```

---

## Data Model

```typescript
// src/types/explain.ts

export interface RelatedSkill {
  name: string;
  similarity: number;
  sharedTokens: string[];
}

export interface SkillExplanation extends SkillRecord {
  relatedSkills: RelatedSkill[];
}

export interface SkillGroup {
  label: string;
  skills: SkillRecord[];
}

export interface GroupResult {
  groups: SkillGroup[];
  ungrouped: SkillRecord[];
}
```

## Architecture

```
src/
  explain/
    buildExplanation.ts   # SkillRecord[] + target skill → SkillExplanation
    groupSkills.ts        # SkillRecord[] → GroupResult (Union-Find 聚类)
  render/
    renderShow.ts         # 更新：接受 SkillExplanation，输出增强卡片
    renderGroup.ts        # 新增：GroupResult → 格式化分组文本
  cli/
    index.ts              # show 传入 SkillExplanation; scan 增加 --group 分支
  types/
    explain.ts            # RelatedSkill / SkillExplanation / GroupResult
```

`buildExplanation` 和 `groupSkills` 均为纯函数，易于单元测试。

## Acceptance Criteria

| # | Criterion |
|---|-----------|
| AC1 | `show <name>` 输出包含 WHEN TO USE 段落，每条 trigger 以 `→` 开头 |
| AC2 | `show <name>` 输出包含 RELATED SKILLS，展示 similarity ≥ 0.25 的 skill（最多3个） |
| AC3 | `show <name> --json` 输出包含 `relatedSkills` 数组，字段结构符合 `RelatedSkill` schema |
| AC4 | `scan --group` 输出中每个 group 有 label 和 skill 列表 |
| AC5 | `scan --group` 中无关联 skill 归入 `(other)` 组 |
| AC6 | `scan --group --json` 输出符合 `GroupResult` schema |
| AC7 | 只有一个 skill 时，`show` 不展示 RELATED SKILLS，`scan --group` 全部归入 `(other)` |
| AC8 | `src/explain/*` 单元测试覆盖率 ≥ 90% |

## Out of Scope

- AI 生成的解释文本（完全离线）
- 跨 skill 的「竞争叙事」（roadmap 标注为 later）
- Group 的手动编辑或命名
