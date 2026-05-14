# Spec: F5 Safety Audit

> 基于 v0.1 已有的扫描和解析能力，在 v0.1 基础上叠加安全审计层。  
> 本 spec 对应 roadmap F5，不影响已有的 scan / show / conflicts 命令。

## Objective

让用户在本地运行一条命令，就能知道他们安装的哪些 Skill 包含高风险指令——无需联网、无需账号、不改变现有工作流。

安全审计的核心用户问题只有一个：

> **"我机器上有没有哪个 Skill 在悄悄让 Agent 做危险的事？"**

## Assumptions

1. 审计完全离线，基于静态文本分析，不调用任何 AI API。
2. 检测粒度是"skill 文件级别"，不做行级精确定位（v0.2 可加）。
3. 审计结果是告警，不是封锁——工具不会删除或禁用任何 skill。
4. 误报可接受，漏报不可接受——宁可多报，不能漏掉高风险 skill。
5. 复用 `parseSkill` 解析出的 `SkillRecord`，不重新读文件。

## New Command

```bash
skill-doctor audit [options]
```

### Options

| Flag | 说明 |
|------|------|
| `--scope <global\|project>` | 只审计全局或项目级 skill |
| `--severity <high\|med\|low>` | 只显示指定及以上 severity 的告警 |
| `--fail-on <high\|med>` | 有匹配告警时 exit 1（供 CI 使用） |
| `--json` | 输出机器可读 JSON |

### Output Example (plain text)

```
Skill Safety Audit — 12 skills scanned

HIGH  deploy-helper        shell-exec      "run npm deploy" triggers shell execution
HIGH  file-cleaner         destructive     "rm -rf node_modules" — destructive file operation
MED   secret-exporter      secret-leak     references "API_KEY" in output instruction
LOW   webhook-notifier     network-call    instructs agent to POST to external URL

4 findings  (2 high · 1 med · 1 low)
Run with --json for machine-readable output.
```

### Output Example (JSON)

```json
{
  "scanned": 12,
  "findings": [
    {
      "skillName": "deploy-helper",
      "sourcePath": "/Users/x/.claude/skills/deploy-helper/SKILL.md",
      "platform": "claude",
      "scope": "global",
      "ruleId": "shell-exec",
      "severity": "high",
      "summary": "\"run npm deploy\" triggers shell execution",
      "matchedText": "run npm deploy"
    }
  ],
  "summary": { "high": 2, "med": 1, "low": 1 }
}
```

## Risk Rules

每条规则包含：`ruleId`、`severity`、一组触发模式（正则或关键词列表）、以及解释文本。

### R1 — shell-exec（severity: high）

Skill 指令要求 Agent 执行 shell 命令或系统命令。

触发模式（任意匹配则告警）：
- 关键词（大小写不敏感）：`run`, `execute`, `bash`, `sh -c`, `eval`, `subprocess`, `os.system`, `exec(`
- 上下文：关键词出现在祈使句或 "you should/must/will" 句子中

误报抑制：
- 纯代码块内（用 ` ``` ` 包裹）的关键词不触发（v0.2 可加）

### R2 — destructive（severity: high）

Skill 指令包含破坏性操作词汇，可能导致不可逆的数据丢失。

触发模式：
- 关键词：`rm -rf`, `drop table`, `truncate`, `delete *`, `overwrite`, `format`, `wipe`, `destroy`
- 中文词汇：`删除所有`, `清空`, `格式化`

### R3 — secret-leak（severity: med）

Skill 指令要求 Agent 暴露或传递敏感凭证信息。

触发模式：
- 关键词：`api_key`, `api key`, `token`, `password`, `secret`, `credential`, `private key`, `access key`
- 上下文：这些词出现在 "output", "send", "return", "include", "attach", "expose", "print" 附近（同一句话内）

### R4 — network-call（severity: low）

Skill 指令要求 Agent 主动向外部发起网络请求或上传数据。

触发模式：
- 关键词：`curl`, `wget`, `fetch`, `http://`, `https://`, `POST to`, `upload`, `send to`, `webhook`
- 中文词汇：`发送请求`, `调用接口`, `上传`

## Data Model

```typescript
// src/types/audit.ts

export type RuleId = 'shell-exec' | 'destructive' | 'secret-leak' | 'network-call';

export interface AuditFinding {
  skillName: string;
  sourcePath: string;
  platform: string;
  scope: 'global' | 'project';
  ruleId: RuleId;
  severity: 'high' | 'med' | 'low';
  summary: string;      // human-readable one-liner
  matchedText: string;  // the excerpt that triggered the rule
}

export interface AuditResult {
  scanned: number;
  findings: AuditFinding[];
  summary: Record<'high' | 'med' | 'low', number>;
}
```

## Architecture

```
src/
  audit/
    rules.ts          # 规则定义（ruleId、severity、patterns）
    runAudit.ts       # 对 SkillRecord[] 跑全部规则，产出 AuditFinding[]
  render/
    renderAudit.ts    # 格式化输出，复用已有 chalk 风格
  cli/
    index.ts          # 新增 audit 命令，串联 scan → parse → audit → render
  types/
    audit.ts          # AuditFinding / AuditResult
```

`runAudit` 不依赖文件系统，只接收 `SkillRecord[]`，纯函数，易于测试。

## Acceptance Criteria

| # | Criterion |
|---|-----------|
| AC1 | `skill-doctor audit` 能在当前机器上无报错运行，输出扫描的 skill 数量 |
| AC2 | 四条规则（R1–R4）各有至少 2 个正向 fixture 和 1 个负向 fixture |
| AC3 | `--json` 输出符合 `AuditResult` schema，findings 数组结构正确 |
| AC4 | `--fail-on high` 在发现 high 告警时 exit 1，无 high 告警时 exit 0 |
| AC5 | `--severity high` 时只输出 high 级别告警，med/low 不出现 |
| AC6 | 纯文本输出中 high 用红色、med 用黄色、low 用灰色（CI 下退化为纯文本） |
| AC7 | 核心模块（`src/audit/*`）单元测试覆盖率 ≥ 90% |
| AC8 | 空 skill 列表时输出 "0 skills scanned，0 findings"，不报错 |

## Out of Scope（本版本不做）

- 行级精确定位（只到文件级）
- AI 辅助误报过滤
- 任何写操作（不删除、不修改 skill 文件）

## Open Questions

无。已通过用户确认：独立 `audit` 命令，覆盖 shell-exec / destructive / secret-leak / network-call 四类规则。
