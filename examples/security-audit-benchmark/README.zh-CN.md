# 安全组件自动发现盲测

这套用例用于检验外部 Agent 是否自行找到安全边界缺陷，并区分缺陷版、修复版和安全对照版。它不预先生成发现报告，也不把导入成功当作漏洞发现成功。

## 测试矩阵（仅供评测者阅读）

| 业务边界 | 原始实现 | 修复实现 | 安全对照 |
| --- | --- | --- | --- |
| 发票归属 | 缺少调用者与记录 owner 的绑定 | 明确检查 owner | 先筛选本人记录再按 ID 查找 |
| 导出目录 | 将不可信名称直接拼接到读取路径 | 规范化并限制目录边界 | 名称映射到固定文件白名单 |

共 6 个匿名模块，2 个缺陷样本、4 个阴性样本。每个模块独立，不是同一应用的重复入口。信任模型写入目标内的 CONTEXT.md。目录由操作者管理、没有符号链接；此约束避免把本例未覆盖的文件系统竞态混入标准答案。

## 运行步骤

1. 在仓库根目录准备一个全新目录：

```bash
node examples/security-audit-benchmark/benchmark.mjs prepare /tmp/my-security-blind-run
```

2. 将输出的 `target` 路径作为审计项目。只向审计 Agent 提供目标代码、其中的 CONTEXT.md、固定版本 Cloudflare Skill 和生成的 TASK.md。不要提供本 README、生成器、oracle.json、旧报告或漏洞答案。
3. 按 skill-doctor 正常流程生成代码审计任务。外部 Agent 完成发现和独立验证后，保存原始 findings.json、覆盖台账和各角色原始记录。独立验证缺失或执行隔离不足时，保留 needs_validation。
4. 审计结束后，评测者评分：

```bash
node examples/security-audit-benchmark/benchmark.mjs grade /tmp/my-security-blind-run /path/to/findings.json
```

5. 将外部 Agent 原始结果包装为当前 skill-doctor 任务所要求的 security-report.json，再导入。包装只能补交接元数据，不能把候选改成确认、提高严重等级或添加 Agent 没有发现的问题。若审计运行在别的目标目录，必须为该目标启动对应 UI/CLI；不得冒用其他项目 target。

## 必须保留的证据

- 目标源码及业务约束的散列、固定 Skill 提交号。
- 审计 Agent 实际收到的任务，说明它没有收到标准答案。
- 自动发现的原始输出，以及另一个新 Agent 的验证结果。
- 最小本地复现的输入、输出、隔离条件和命令；不得使用真实客户数据。
- schema 与覆盖台账校验结果、评分结果、原始结果到 UI 报告的转换记录。
- 页面截图只能证明相应操作及展示；不能代替发现与验证的原始记录。

## 如何解读评分

`hitCases` 只统计 confirmed 发现的 sink 路径与行号命中已知缺陷的样本数；`missedCases` 是未命中的缺陷样本数。`flaggedControls` 统计被 confirmed 标记的阴性样本数。`unmatchedConfirmedFindings` 列出不能匹配到已知缺陷位置的确认发现，需要人工复核，不能全部自动认定为误报。needs_validation 单独计数，不计入确认命中；sourceLeadCases 仅记录其源代码线索命中的缺陷样本数。

评分器验证上游 schema，并拒绝源文件、业务约束或文件清单被修改的运行。它不证明描述语义正确、Agent 确实盲测、报告确实来自某模型，也不替代独立复核。路径与行号相同的错误解释也可能匹配，因此必须阅读原始发现与复核记录。共享文件系统里的“未读答案”是任务约束，不是操作系统强制隔离。

本例只能说明两个指定边界上的表现，不能推断真实项目的漏洞召回率、安全保证或性能收益。要证明修复有效，应比较原始版命中与修复版/对照版未被误报；要证明工具价值，还要保留证据追踪、状态管理、去重及用户操作过程。

## 测试评测器本身

```bash
node --test examples/security-audit-benchmark/benchmark.test.mjs
```

这些单元测试不调用模型，不是自动发现效果测试。运行目标控制代码前必须满足 Cloudflare Skill 的操作系统隔离要求；准备与评分程序本身不会执行目标模块。
