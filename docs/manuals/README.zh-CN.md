# 使用手册

[返回项目 README](../../README.zh-CN.md#文档) · [Project README](../../README.md#documentation) · [English index](README.md) · [命令参考](../README.zh-CN.md)

按功能或完整操作流程查阅。前五篇包含本机实际操作截图；Codex 优化与技能库流程复用已有说明，直接进入相应章节。

| 功能流程 | 手册入口 |
| --- | --- |
| 项目体检 | [启动、选择范围、理解总览与复查](health-check.zh-CN.md) |
| 资源清单 | [筛选资源、查看用途与追溯来源](resources.zh-CN.md) |
| 重复与冲突诊断 | [核对副本、判断触发重叠与验证结果](conflicts.zh-CN.md) |
| 上下文成本与预算 | [理解估算、定位高成本资源与调整预算](context-budget.zh-CN.md) |
| 安全审计 | [风险等级、可疑指令定位与人工复核](security-audit.zh-CN.md) |
| Codex 上下文优化 | [优化流程、确认与新会话验证](codex-optimization.zh-CN.md#optimization-workflow) · [历史收益预估](codex-optimization.zh-CN.md#history-estimate) · [English](codex-optimization.md#optimization-workflow) |
| 技能导入与纳管 | [导入新技能](skill-library.zh-CN.md#import) · [纳管现有技能](skill-library.zh-CN.md#take-over) · [同名冲突](skill-library.zh-CN.md#name-conflicts) |
| 技能部署与卸载 | [部署方式与目标冲突](skill-library.zh-CN.md#deploy) · [卸载与删除的区别](skill-library.zh-CN.md#uninstall) |
| 技能同步与批量操作 | [安装状态](skill-library.zh-CN.md#installation-status) · [同步](skill-library.zh-CN.md#sync) · [批量操作](skill-library.zh-CN.md#batch-operations) |

完整技能库说明见[技能库使用手册](skill-library.zh-CN.md)，已有 [HTML 阅读版](../skill-library-manual.html) 保留发布位置。交互式网页手册仍位于 [中文页面](../zh-CN/pages/manual.html)和 [English page](../en/pages/manual.html)。

## 维护约定

- Markdown 手册源统一放在 `docs/manuals/`，英文目录索引为 `README.md`，中文目录索引为 `README.zh-CN.md`。每项功能或完整流程维护一篇；多个功能已经在同一篇中说明时，通过章节入口复用。
- 文件名使用小写英文短横线，如 `health-check.zh-CN.md`；中文以 `.zh-CN.md` 结尾，英文使用 `.md`。阅读顺序由本目录表格管理。
- 截图及附带记录集中在 `assets/manual/<module>/`，手册以 `../../assets/manual/...` 引用。保留真实结果及敏感位置说明。
- 对 README 中引用的具体章节保留稳定锚点；调整标题时检查锚点仍指向对应内容。
- 新增、移动或重命名手册时，同步更新本目录、中英文项目 README、篇间导航和图片路径，并核对链接与锚点。
- 内部实施方案保存在 Git 忽略的 `doc/`，不放入公开手册目录。
