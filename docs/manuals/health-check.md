# Project Health Check Manual

[Manual index](README.md) · [English project README](../../README.md#documentation) · [中文](health-check.zh-CN.md) · [CLI reference](../README.md) · [Platform support](../platform-support.md)

This manual walks through a project health check: start the local UI, confirm the project and agent, choose a scan scope, read the overview, inspect issue evidence, and run another check. It is for first-time Skill Doctor users and for anyone who wants to check a project after adding Skills, Rules, Instructions, or MCP configuration.

A check inventories resources, looks for duplicates, trigger overlap, and static security signals, and estimates identifiable context usage. It does not change or uninstall agent resources. After a scan completes, Skill Doctor saves a local scan record.

## 1. Environment used in this walkthrough

The screenshots show this machine’s actual configuration and scan results. No demo project was used, and no Skill or agent configuration was changed to manufacture findings.

| Item | Value used in this walkthrough |
| --- | --- |
| Walkthrough date | 2026-10-18 (Asia/Shanghai) |
| System | macOS |
| Skill Doctor | Repository version 0.7.1 |
| Node.js | v25.4.0; runtime requirement is Node.js 20 or newer |
| Project directory | <code>/Users/evilstar/GitHub/skill-doctor</code> |
| Current agent | Codex |
| Analysis mode | Standard check |
| Scan scope | “Current project only” first, then “Current project and global configuration” |
| Per-turn budget | 2,000 tokens |
| Tokenizer | OpenAI tokenizer (<code>gpt-4o</code>) |

Your resource counts, risks, and token estimates will vary with your local configuration. They do not need to match the screenshots. Before comparing results, check the project, agent, scope, and budget.

## 2. Start the local UI

### Use the published package

In a terminal, go to the project you want to inspect and run:

```bash
npx @evilstar2025/skill-doctor ui
```

You can also specify the project and open the browser yourself:

```bash
npx @evilstar2025/skill-doctor ui /path/to/your-project --port 4173 --no-open
```

Replace <code>/path/to/your-project</code> with the actual project directory. If the port is already in use, choose another port or omit <code>--port</code> to let the system assign one.

### Run from this repository

If you have cloned the source, prepare dependencies and build from the repository root:

```bash
npm install
npm run build
```

This walkthrough started the service with:

```bash
npm run dev -- ui . --port 4173 --no-open
```

The <code>.</code> means the current repository. <code>npm run dev</code> starts the backend, and the UI uses the built <code>dist/ui/</code>. Running only <code>npm run dev:ui</code> does not replace the full local service used here.

The terminal prints an address prefixed with <code>Skill Doctor UI:</code>. Open the full URL printed by your terminal; it contains an access credential for the local service. Do not use another person’s URL or a fixed example as your own entry point. When finished, press <code>Ctrl+C</code> in the terminal running the service.

## 3. Confirm the project, agent, and check mode

### First use

When the “Confirm inspection target” (确认检查目标) dialog appears:

1. Check the “Project directory” (项目目录). Enter a different path or click “Choose directory” (选择目录) if needed.
2. Click “Detect agents” (检测 Agent) and select the agent used by this project. This walkthrough selects **Codex**.
3. Choose **Standard check** (标准体检), then click “Start check” (开始体检).

If the project has configuration for several agents, select the one you need. Choose “Cross-agent overview” (跨 Agent 总览) to inventory them together. An agent tab means configuration was detected; it does not mean that application is currently running.

### Existing scan records

This machine already had historical records, so the UI opened directly to the overview instead of showing the first-use guide. If that happens, confirm which project the start command selected, then check the agent, scope, and analysis mode at the top and run a new check. Do not treat an old result shown at startup as the result of a new scan.

### Check the scan options

Set “Analysis mode” (分析模式) to **Standard check** (标准体检). Click “Scan settings” (扫描设置) next to it. This walkthrough uses the following settings; scroll down if the panel is taller than the window:

| Option | Setting here | Purpose |
| --- | --- | --- |
| Context cost | On | Estimate fixed and on-demand usage |
| Show disabled resources | Off | Include only active resources in this walkthrough |
| Inventory Codex plugin cache | Off | Do not treat cache directories as extra inventory targets |
| Connect to MCP for tool lists | Off | Do not run MCP tool discovery |
| Conflict detection | Fast keyword analysis | Check overlap using keyword signals |
| AI security audit / AI analysis of conflict boundaries | Off | Do not use model-assisted analysis |
| Per-turn budget | 2000 | Budget line for comparison with fixed context cost |
| Tokenizer | OpenAI tokenizer | Estimate text token counts |

![Figure 1: Standard-check settings on this machine, including fast keyword analysis, AI toggles, and a 2,000-token budget](../../assets/manual/health-check/02-scan-settings.jpg)

**Reading Figure 1:** Fast keyword analysis is selected, both AI analyses are off, and the budget is 2,000. Context-cost and MCP options are higher in the same panel; check them against the table above. A model service is not required for this workflow, and you do not need to enter an API key for a standard check.

After changing settings, click “Save and rescan” (保存并重新体检). If you only inspected them and made no changes, close the panel and select the scope in the next section.

If you turn on MCP tool discovery, it may connect to configured services; stdio configuration may also start a local command. A deep check can use configured analysis or embedding services. Those options behave differently from the settings used in this walkthrough, where the relevant switches are off.

## 4. Check “Current project only” first

1. Change the scope under “Inspection target” (检查目标) to **Current project only** (仅当前项目).
2. Select **Codex** in the agent tabs. Changing agents starts a check for that agent. After changing the scope, click “Rescan” (重新体检) to apply it.
3. While scanning, the button changes to “Cancel” (取消). Wait until the scan finishes and the button returns to “Rescan” before reading the results.
4. Open “Overview” (总览) in the left navigation. In a narrow window, navigation appears at the bottom and the agent tabs can scroll horizontally.

![Figure 2: Actual overview for Codex, standard check, and current project only; 0 clear issues, about 1.3k fixed usage, and 1 optimization opportunity](../../assets/manual/health-check/01-project-overview.jpg)

**Reading Figure 2:** This project-scope check reports “Healthy” (状态良好) and **0 clear issues**. Estimated fixed usage is about **1.3k tokens**, on-demand loading is about **3.6k**, **0 items** are uncounted, and there is **1 optimization opportunity**. Platform coverage lists **5 Codex** and **1 OpenCode** resource entries.

“No clear issues” and “there is still an optimization opportunity” can both be true. The first means this scan did not find items to list as issues in its scope. The second points to a resource or control that can be reviewed; it does not mean you must disable anything.

## 5. Check “Current project and global configuration”

Global configuration can affect a project too. Keep the same project, Codex agent, standard-check mode, and budget for the second scan:

1. Set the scope to **Current project and global configuration** (当前项目与全局配置).
2. Click “Rescan” (重新体检) at the upper right.
3. Wait for the scan to finish and confirm that the overview has updated.

![Figure 3: Actual overview after adding global configuration; 1 clear issue, about 2.1k fixed usage, and an over-budget notice](../../assets/manual/health-check/03-project-and-global-overview.jpg)

**Reading Figure 3:** The result changes to “Needs attention” (需要关注), with **1 clear issue**, about **2.1k tokens** of fixed usage, about **24k** on-demand loading, and **2 optimization opportunities**. The “Priority actions” (优先处理) area shows “Fixed context cost exceeds budget” (固定上下文成本超过预算).

This real screenshot also preserves a wording inconsistency in the current version: the “Clear issues” (明确问题) card’s main number is <code>1</code>, but its subtext still says “No clear issues.” In this example, use the overview’s “1 clear issue needs attention” message, the card’s main number, and the issue details as evidence.

The two scopes compare as follows:

| Metric | Current project only | Current project and global configuration |
| --- | --- | --- |
| Clear issues | 0 | 1 |
| Estimated fixed usage (rounded on page) | 1.3k tokens | 2.1k tokens |
| On-demand loading (rounded on page) | 3.6k tokens | 24k tokens |
| Uncounted | 0 items | 0 items |
| Optimization opportunities | 1 | 2 |
| Resource entries in platform coverage | Codex 5, OpenCode 1 | Codex 18, OpenCode 1, WorkBuddy 2 |

This is a **difference in scan scope**. No resources were fixed or disabled between scans, so the change in numbers is not an optimization gain. Platform coverage counts are not necessarily Skill installation counts. To identify a specific entry, open “Resource inventory” (资源清单) and check its type, source, and scope.

## 6. Read issue evidence and suggestions

Click **Fixed context cost exceeds budget** (固定上下文成本超过预算) in “Priority actions” (优先处理) to open its details on the right. You can also click “View issues” (查看问题) and open it in the issue list.

![Figure 4: Over-budget issue details show affected resources, evidence of 2,118 / 2,000 tokens, and a suggestion](../../assets/manual/health-check/04-budget-issue-detail.jpg)

**Reading Figure 4:** The details give this scan’s exact integer estimate: **2,118 / 2,000 tokens**, which is **118 tokens** above the configured budget. The page labels it “Context · Medium risk” (上下文 · 中风险). This is a context-budget issue; it does not establish that the resources contain malicious instructions.

Check three parts of the details:

- **Affected resources:** These are entries you can inspect further. In this example they include <code>AGENTS.md</code>, <code>Codex skill list</code>, and several local Skill names. Being listed here does not mean each resource has a separate defect.
- **Evidence:** Check the actual estimate and budget to see why the issue appeared. Do not rely only on the overview’s rounded <code>2.1k</code>.
- **Suggestion:** This example recommends reviewing always-on instructions, MCP tool descriptions, and broad Skill metadata first. Check each source and purpose before deciding whether to change it.

This walkthrough ends after diagnosis. Do not uninstall a resource just to remove a notice. For configuration changes and the Codex optimization workflow, see the [Codex context optimization manual](codex-optimization.md).

### How to read the overview numbers

| Page information | How to interpret it |
| --- | --- |
| Clear issues | Number of items summarized by this scan that need attention; not the number of high-risk security issues |
| Estimated fixed usage | Estimate for identifiable always-on context; not all input tokens in every real request |
| On-demand loading | Text that may be involved when a resource activates; do not add all of it to every turn’s fixed usage |
| Uncounted | Items that could not be included in the current estimate; 0 does not prove that all runtime context is covered |
| Optimization opportunities | Entries that can be reviewed or controlled; not token savings already achieved |
| Platform coverage | Resource distribution returned by this scan; inspect details to learn whether an entry is a Skill, instruction, or another type |
| Healthy | No obvious issue was found under the current scope, rules, and evidence; not a guarantee of safety or zero cost |

## 7. Rescan to confirm changes under the same conditions

After you actually change configuration or add or remove resources:

1. Keep the same project, agent, scan scope, budget, and analysis options.
2. Click “Rescan” and wait for it to finish.
3. Check whether issues and related resources changed. If you changed only the budget, do not describe that as lower actual usage.
4. Open “Scan history” (扫描记录), select a compatible baseline if needed, and click “Compare changes” (比较差异).

![Figure 5: Local scan history retains a 0-issue project-scope record and a 1-issue all-scope record](../../assets/manual/health-check/05-scan-history.jpg)

**Reading Figure 5:** The project-scope record at **19:32:27** has **0 issues**; the all-scope record at **19:33:33** has **1 issue**, matching the overviews above. The comparison area selects another Codex all-scope record. Records with different projects, agents, scopes, or estimation methods are excluded. Do not treat the project-scope 0 and all-scope 1 as before-and-after results from one fix.

At this point, you should be able to confirm the inspection target, finish a scan, interpret the main numbers, and locate issue evidence. For Codex configuration controls, a new static scan still cannot replace runtime verification in a new session.

## 8. Frequently asked questions

### Why are there results as soon as I open the UI?

A scan snapshot already exists on this machine. Confirm the target and options, then run a new check and use its completed result.

### Why do my resource counts differ from the screenshots?

The project directory, global installations, agent, scan sources, and disabled-resource or cache options all affect the count. Check the scope first, then inspect sources in “Resource inventory.” To check custom sources, open “Scan settings → Scan sources and paths” (扫描设置 → 扫描来源与路径).

### Why are there no resources, or why was an expected agent not detected?

Check which directory the start command points to, whether configuration exists in a supported path, and whether that scan source is enabled. An agent detected only through global configuration may have no resource in “Current project only” scope. See [Platform support](../platform-support.md) for coverage differences.

### What should I do when the page says “Scan results are incomplete”?

Read the warning at the top of the page to see which step did not finish. An older record loaded at startup on this machine had two MCP tool discovery warnings: <code>serena: fetch failed</code> and <code>ast: Timed out waiting for initialize</code>. They mean complete tool information was not obtained at that time; they do not mean the resources were found safe or unsafe.

To reproduce this walkthrough, turn off “Connect to MCP for tool lists” and scan again. If you need tool lists, inspect the relevant service or command before enabling it. Turning off discovery removes this connection dependency, but also means there is no live tool-list evidence from that scan.

### Why can’t I select deep check?

Configure the relevant analysis or embedding service first. The standard-check workflow in this manual does not require a model.

### Why does the page say access is denied or fail to open?

Confirm that the local service is still running and open the full URL printed by the terminal for this run. If you restart the service, get a new URL instead of reusing an old session link.

### Can I directly compare the counts from CLI scan, check, and the UI overview?

The <code>scan</code> command mainly inventories Skills and checks duplicates or conflicts. The <code>check</code> command is a health gate for security, conflicts, and context budget. The UI overview combines resources, issues, and cost. Align the supported scope, platform filters, and budget before interpreting results. See the [CLI reference](../README.md) for full usage.

## 9. Information in these screenshots to review before sharing

The images show real local results without additional redaction. The blur behind the details panel comes from the interface. The environment owner may want to review these items before sharing publicly:

| Image | Location and information |
| --- | --- |
| Figure 3: Overview including global configuration | Resource names in the “Priority actions” card, including <code>requirement-doc-kit</code>, <code>implementation-tracking-kit-v2</code>, and <code>data-migration-kit</code> |
| Figure 4: Over-budget issue details | The same local Skill names under “Affected resources” on the right, which may reveal internal workflows or naming |
| Figure 5: Scan history | Actual times, agents, and issue counts in “Current scan,” the baseline dropdown, and “Saved snapshots,” reflecting local usage history |

All five images show some detected agent names. These images do not show API keys or credentials in local-service access URLs. The environment table in this manual does include the real project path.

Next: [Resource inventory](resources.md), which shows how to find resources, check sources and sharing, and follow related issues to their evidence.
