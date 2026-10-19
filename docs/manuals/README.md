# User Manuals

[English project README](../../README.md#documentation) · [中文项目 README](../../README.zh-CN.md#文档) · [中文目录](README.zh-CN.md) · [CLI reference](../README.md)

Browse by workflow. The first five guides include screenshots from real local use. The Codex optimization guide and skill-library workflow are available in both languages.

| Workflow | Manual |
| --- | --- |
| Project health check | [Start a scan, choose scope, read the overview, and review results](health-check.md) · [中文](health-check.zh-CN.md) |
| Resource inventory | [Filter resources, inspect purpose, and trace sources](resources.md) · [中文](resources.zh-CN.md) |
| Duplicate and conflict diagnosis | [Compare copies, assess trigger overlap, and verify outcomes](conflicts.md) · [中文](conflicts.zh-CN.md) |
| Context cost and budget | [Understand estimates, find costly resources, and adjust budgets](context-budget.md) · [中文](context-budget.zh-CN.md) |
| Security audit | [Understand risk levels, find suspicious instructions, and review evidence](security-audit.md) · [中文](security-audit.zh-CN.md) |
| Codex context optimization | [Optimization workflow, confirmation, and new-session verification](codex-optimization.md#optimization-workflow) · [Historical estimates](codex-optimization.md#history-estimate) · [中文](codex-optimization.zh-CN.md#optimization-workflow) |
| Import and take over Skills | [Import](skill-library.md#import) · [Take over](skill-library.md#take-over) · [Name conflicts](skill-library.md#name-conflicts) · [中文](skill-library.zh-CN.md#import) |
| Deploy and uninstall Skills | [Deployment and target conflicts](skill-library.md#deploy) · [Uninstall or delete](skill-library.md#uninstall) · [中文](skill-library.zh-CN.md#deploy) |
| Sync and bulk operations | [Installation status](skill-library.md#installation-status) · [Sync](skill-library.md#sync) · [Bulk operations](skill-library.md#batch-operations) · [中文](skill-library.zh-CN.md#installation-status) |

For the complete skill-library guide, see [Skill Library Manual](skill-library.md). The existing [HTML reading version](../skill-library-manual.html) keeps its published location. The interactive web manual is available in [English](../en/pages/manual.html) and [Chinese](../zh-CN/pages/manual.html).

## Maintenance conventions

- Markdown manuals live in <code>docs/manuals/</code>; <code>README.md</code> is the English directory index and <code>README.zh-CN.md</code> is its Chinese counterpart. Maintain one file per feature or complete workflow; link to sections when several workflows share one guide.
- Use lowercase, hyphenated English filenames, such as <code>health-check.md</code>; Chinese versions end in <code>.zh-CN.md</code>. The table in this directory controls reading order.
- Keep screenshots and supporting records under <code>assets/manual/&lt;module&gt;/</code>, referenced from manuals with <code>../../assets/manual/...</code>. Retain actual results and disclose sensitive local information.
- Keep stable anchors for sections linked from README files. When changing a heading, confirm that the anchor still points to the intended section.
- When adding, moving, or renaming a manual, update this index, both project READMEs, cross-manual navigation, and image paths; check links and anchors.
- Keep internal implementation plans in the Git-ignored <code>doc/</code> directory, outside the public manual directory.
