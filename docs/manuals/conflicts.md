# Duplicate and Conflict Diagnosis Manual

[Manual index](README.md) · [English project README](../../README.md#documentation) · [中文](conflicts.zh-CN.md) · [Previous: Resource inventory](resources.md) · [CLI reference](../README.md)

This manual is for three situations: same-name Skills installed in different places, different behavior across agents after an update, or descriptions and trigger scopes that may overlap. The goal is to identify the affected entry points, inspect their contents and maintenance sources, then decide whether to keep them, manage them centrally, or clarify their responsibilities.

Afterward, you should be able to answer: Are these duplicate installations or overlapping trigger scopes? Are the two files actually different? Does an entry point link to another repository? What else should be checked, and how can you verify the result?

## 1. Distinguish two kinds of issues

| Type | Signal | What to check next |
| --- | --- | --- |
| Duplicate | A resource with the same name appears under different installation entry points; this example is marked high risk by the default rule | Full paths, actual link targets, whether the contents match, and each agent’s purpose and update method |
| Conflict | Standard check finds potentially overlapping keyword scopes based on descriptions and trigger information | The task boundaries, actual trigger conditions, rule priority, and whether the original instructions contradict each other |

A duplicate warning does not mean the file contents were compared. A high-risk label does not mean malicious instructions were found. Two resources across agents may be intentionally installed separately; do not assume they will compete for a task in the same conversation.

This walkthrough uses the actual local environment on **2026-10-19**: macOS, Skill Doctor repository version **0.7.1**, and the project <code>/Users/evilstar/GitHub/skill-doctor</code>. The actual results were **10 duplicates, 0 trigger conflicts, and 1 context-budget issue**.

This walkthrough only scanned, viewed details, checked files read-only, and compared scan history. It did not change, uninstall, or delete agent resources. Screenshots retain actual results; detail views use original crops for readability. Figure 8 is an attached record of an actual file check, clearly marked as documentation rather than a product page.

## 2. Include the relevant agents and global configuration in the scan

**Use this when:** The same Skill may be installed in Codex, WorkBuddy, or other agents, and a project-only or single-platform scan may not show both entry points.

Start the UI:

```bash
npx @evilstar2025/skill-doctor ui /path/to/your-project
```

Replace the path with your actual project directory. For source setup, see [Starting the local UI](health-check.md#2-start-the-local-ui). This walkthrough ran <code>npm run dev -- ui . --port 4173 --no-open</code> and opened the full local URL printed by the terminal.

In the UI:

1. Set the top-level scope to **Current project and global configuration** (当前项目与全局配置).
2. Set the analysis mode to **Standard check** (标准体检).
3. Click **Cross-agent overview** (跨 Agent 总览). If you only changed the scope, click “Rescan” (重新体检).
4. Wait for the scan to finish and the button to return to “Rescan.”

![Figure 1: Cross-agent standard check includes the current project and global configuration and finds 11 issues](../../assets/manual/conflicts/01-scan-scope.jpg)

**What this example shows:** The overview reports **11 clear issues**, including duplicate notices for resources such as <code>data-migration-kit</code>.

**Why it helps:** This establishes the scan boundary. Later reducing the number of visible entries or switching to a single agent does not mean that duplicate relationships were resolved. Standard check uses local keyword rules. MCP tool discovery and AI security/conflict analysis were off in this walkthrough.

If an analysis service is already configured locally, opening Skill details may still use it to provide an explanation. That is separate from AI audit during the scan; you do not need to configure a model for this manual.

## 3. Open the issue list and check types, not just the total

**Action:** Click “Issues” (问题) in the left navigation. Keep “All types” (全部类型) and “Needs attention” (需处理), and leave the search box empty.

![Figure 2: The issue list shows duplicate and context issues, 11 in total](../../assets/manual/conflicts/02-all-issues.jpg)

**What this example shows:** The list contains several “Duplicate · High risk” (重复 · 高风险) entries and one “Context · Medium risk” (上下文 · 中风险) budget issue.

**How to use this result:** The 11 is the total number of issues needing attention in the current scope. It does not mean 11 conflicts or 11 files should be deleted. Review each type separately so a budget issue is not mistaken for a duplicate file.

## 4. Filter duplicates and locate one pair

### 4.1 Narrow by type

Change “Type” to **Duplicate** (重复) and keep the severity filter at “Needs attention” (需处理).

![Figure 3: Filtering by duplicate type returns 10 issues](../../assets/manual/conflicts/03-duplicate-filter.jpg)

**What this example shows:** The result drops from 11 to **10**; the context-budget issue is excluded.

**Why this step helps:** You are now looking at duplicate relationships. Ten relationships do not mean you can automatically delete ten directories, nor do they tell you the total number of duplicate files. Shared resources, multiple entry points, and multi-way duplicates still need to be checked group by group.

### 4.2 Locate a resource by name

Search for **data-migration-kit**.

![Figure 4: Searching by resource name locates one duplicate relationship](../../assets/manual/conflicts/04-locate-duplicate.jpg)

**What this example shows:** **1 issue** remains, involving two resources with the same name.

**Why it helps:** You can collect evidence for this pair without switching among similar names and accidentally selecting a different pair. The 1 is the issue count, not the number of resources.

## 5. Open the issue and record both full sources

**Action:** Click “Duplicate resource found: data-migration-kit” (发现重复资源：data-migration-kit) and inspect copies A and B under “Evidence” (证据) on the right.

![Figure 5: The duplicate issue shows both source paths and the deletion confirmation area](../../assets/manual/conflicts/05-duplicate-path-evidence.jpg)

The evidence in this example is:

```text
Copy A: /Users/evilstar/.codex/skills/data-migration-kit/SKILL.md
Copy B: /Users/evilstar/.workbuddy/skills/data-migration-kit/SKILL.md
```

**What you can confirm:** The two scan entry points are in the user-level Skill directories for Codex and WorkBuddy.

**What still needs checking:** Whether either entry is a link, whether it points to another repository, whether the contents match, and whether each agent needs its own version. The warning’s “keep one copy” suggestion and the deletion dropdown’s default option do not answer these questions.

This walkthrough does not enter a deletion confirmation value, so the action button stays disabled. Cleanup deletes the resource and cannot be undone in Skill Doctor. A user should confirm the maintenance source, references, and recovery method before choosing and confirming a target. This manual continues by checking sources and contents instead.

## 6. Check each resource’s purpose and installation source

### 6.1 Inspect the Codex entry

Click one <code>data-migration-kit</code> under “Affected resources” (受影响资源) and read the subtitle in its detail view. Both buttons have the same name, so identify the resource by the platform and path shown in the details, **not by the button order**.

![Figure 6: The purpose, source, and installation directory for the Codex global copy](../../assets/manual/conflicts/06-codex-copy-detail.jpg)

The details for this copy show:

- Platform and scope: **Codex · Global**.
- Source: <code>.codex/skills/data-migration-kit/SKILL.md</code>.
- Stated purpose: Deliverables such as data migration scripts, upgrade runbooks, and indexes.
- Related issue: This duplicate issue.

**Why it helps:** Confirm which file you are viewing and what it is for before deciding whether it fits the task. “1 issue to review” is this same related issue, not another independent defect.

### 6.2 Inspect the other entry point

Close the details, reopen the same duplicate issue, and inspect the other same-name resource. Confirm that its subtitle says **WorkBuddy · Global**.

![Figure 7: Purpose and scan source for the WorkBuddy global copy](../../assets/manual/conflicts/07-workbuddy-copy-detail.jpg)

**What this example shows:** The purpose descriptions match, but the installation entry points differ. Codex’s configuration source is <code>builtin:scan-sources</code>, while WorkBuddy’s is <code>workbuddy-global-skills</code>.

**How to interpret this:** The configuration source says which scan rule discovered the entry; it is not the author or a security certification. Matching summaries also do not prove that the full contents, attached scripts, or resource directories match. Check the actual files next.

## 7. Compare the contents and link targets using the real paths

**Use this when:** You want to check whether versions have drifted, or whether apparently independent entry points actually point to another repository.

Copy both full paths from Figure 5 or the resource details and open them in a local editor. On macOS, you can also run these read-only commands, replacing the paths with the actual entries you found:

```bash
realpath "$HOME/.codex/skills/data-migration-kit/SKILL.md" "$HOME/.workbuddy/skills/data-migration-kit/SKILL.md"
shasum -a 256 "$HOME/.codex/skills/data-migration-kit/SKILL.md" "$HOME/.workbuddy/skills/data-migration-kit/SKILL.md"
cmp -s "$HOME/.codex/skills/data-migration-kit/SKILL.md" "$HOME/.workbuddy/skills/data-migration-kit/SKILL.md"
echo $?
```

Run <code>echo $?</code> immediately after <code>cmp</code>: <code>0</code> means the two files read are byte-for-byte identical; <code>1</code> means they differ. For any other value, investigate a read or execution error first. If they differ, compare them line by line in an editor or use <code>diff -u</code> to inspect the changes.

![Figure 8: A read-only record generated from actual local files, showing paths, byte counts, and SHA-256](../../assets/manual/conflicts/08-file-content-comparison.jpg)

Figure 8 comes from the attached [local file comparison record (HTML; download and open locally)](../../assets/manual/conflicts/local-file-comparison.html). It is not a new Skill Doctor feature page. The record reads the local files directly, and its results match the actual <code>realpath</code>, <code>shasum</code>, and <code>cmp</code> checks.

**Findings from this example:**

- Both <code>SKILL.md</code> files are **10,847 bytes**, have the same SHA-256, and <code>cmp</code> returns **0**. Their current contents are byte-for-byte identical.
- The two entry points lead to different physical files.
- The WorkBuddy entry resolves to <code>/Users/evilstar/GitHub/skills/.claude/skills/data-migration-kit/SKILL.md</code>, which belongs to another skill repository.

**How this evidence informs a decision:** Do not delete either copy on the basis that their current contents have diverged. However, their update sources differ and may cause version drift later. Before acting, confirm which source is maintained, how updates are synchronized, and whether both agent installation entry points are needed.

This check compared only <code>SKILL.md</code>. It does not prove that the full directories, scripts, templates, permissions, or runtime behavior match. Identical file contents also do not mean the two resources must be merged. Do not infer full equality from a matching summary, file size, or similarity score.

Compare same-name copies by their **full paths**. The current <code>skill-doctor diff</code> command resolves objects by two different Skill names, so <code>diff data-migration-kit data-migration-kit</code> cannot identify these two same-name files.

## 8. Choose an approach based on the evidence

This example ends after diagnosis and source review; no copy was selected for deletion. Use your actual findings to decide:

| Finding | Possible approach | What to verify |
| --- | --- | --- |
| Contents match and each agent needs a separate installation | Identify a shared maintenance source and update process; consider centralized management | Both agents still find the required entry, and later updates can be synchronized |
| Contents differ because of necessary platform-specific customization | Keep the needed differences and document the platform and purpose | The differences serve distinct needs rather than accidental drift |
| One copy is obsolete | Confirm its source, link target, and references, then have the user confirm cleanup | The intended copy was removed and the retained version and dependencies still work |
| An entry resolves to a shared repository | Check the shared source and its other users before planning changes | Do not remove a maintenance source still used by another agent |
| Only descriptions and trigger scopes look similar | Narrow task boundaries, trigger conditions, and usage descriptions | Both static findings and actual resource selection behave as expected |

If you need centralized management or synchronization, start with the [Skill library manual](skill-library.md). Do not delete or rename resources just to make the count smaller; renaming also does not resolve overlapping responsibilities in the instructions themselves.

## 9. Check trigger conflicts and rule out filters hiding results

**Use this when:** You suspect several Skills may cover the same task and need to distinguish “the rule found nothing” from “search or severity filters hid the result.”

Close the details panel and return to “Issues” (问题):

1. Clear the <code>data-migration-kit</code> search term.
2. Change “Type” to **Conflict** (冲突).
3. Set “Severity” to **All levels** (全部等级).

![Figure 9: After clearing search and including all severity levels, the local conflict category still has 0 results](../../assets/manual/conflicts/09-no-trigger-conflicts.jpg)

**What this example shows:** The result is **0 issues; no matching issues**. These screenshots retain the real empty result. Do not relabel the 10 duplicate relationships above as 10 trigger conflicts.

**What you can conclude:** Under this scan scope and the standard keyword rules, no trigger overlap was detected.

**What remains unknown:** Standard rules mainly analyze descriptions and trigger information. They do not prove that every sentence in the full contents is free from contradiction, nor can they guarantee that the host will select the right Skill for an actual task. If you have seen a problem, continue checking the actual task, descriptions, original instructions, and host selection records.

### What if your environment has conflict rows?

This machine had no non-empty conflict rows. The steps below describe how to review a real result; Figure 9 reflects the actual local state:

1. Click a conflict and record the two resources, detection method, similarity score, or shared trigger information.
2. Interpret the overlapping keywords in the real task context: do they describe a legitimate shared subject area, or do both Skills claim the same entry point? A similarity score is not the “probability of an inevitable conflict.”
3. If the details offer “Compare two resources side by side” (并排对比两个资源), review the descriptions, use cases, trigger words, and extracted workflow items. This compares structured descriptions; use an editor for line-by-line differences in the complete files.
4. Clarify descriptions and triggers based on responsibility. For example, one Skill could “review migration scripts only” and the other “prepare upgrade runbooks only.” Then rescan under the same scope and verify selection behavior with actual tasks.

If you need semantic analysis, first check which embedding or analysis service is configured and where its data is sent. Semantic results still require review in context. This walkthrough did not change the model, threshold, or resource contents just to produce a non-empty result.

## 10. Restore the default filters and confirm nothing is hidden

**Action:** Leave the search box empty, set “Type” to **All types** (全部类型), and restore “Severity” to **Needs attention** (需处理).

![Figure 10: Restoring the default filters makes the original 11 issues appear again](../../assets/manual/conflicts/10-restore-all-issues.jpg)

**What this example shows:** The list returns to **11 issues** and the duplicate issues are still present. This does not conflict with the 0 trigger conflicts just shown; the two results use different filters.

**Why it helps:** This distinguishes an issue hidden by filters from an issue that disappeared after a new scan. Changing filters only changes how results are displayed. It does not change the underlying configuration and should not be recorded as a fix.

## 11. Rescan and verify the result under the same conditions

### 11.1 Rescan with the same scope

Keep the current project, cross-agent overview, current-project-and-global scope, standard check, and original budget. Click “Rescan” and wait for it to finish.

![Figure 11: A rescan after read-only checks still reports 11 issues](../../assets/manual/conflicts/11-rescan-result.jpg)

**Why the count did not decrease:** This walkthrough only read resources and checked files; it did not change or remove any entry point. Confirming that the contents match does not automatically clear a warning based on the same name appearing in multiple locations.

After you actually change configuration, check whether the original issue disappeared, and confirm that retained resources and shared entry points still behave as expected. Do not look only at the total; other issues may have appeared or changed at the same time.

### 11.2 Compare a compatible history baseline

Open “Scan history” (扫描记录), select a baseline with the same project, agent, scope, and compatible estimation method, then click “Compare changes” (比较差异).

![Figure 12: Comparing two cross-agent all-scope scans shows 0 added, 0 resolved, and no resource-count change](../../assets/manual/conflicts/12-compatible-baseline-comparison.jpg)

**Result from this example:** Comparing the cross-agent, all-scope scans at **22:10:02** and **22:15:30** shows **0 new issues**, **0 resolved issues**, and **69 → 69 resources**. Fixed and on-demand context estimates are also unchanged, as expected after read-only checks.

Do not use a historical “Codex only · 1 issue” record as a cross-agent baseline and claim that 10 issues were resolved. To verify actual changes, check the relevant alert under the same conditions, the source and contents of retained resources, and whether affected agents still work as needed.

## 12. Actionable findings from this diagnosis

| Question | Actual finding on this machine | How it helps next |
| --- | --- | --- |
| How many duplicates and conflicts? | 10 duplicates, 0 trigger conflicts, and 1 separate budget issue | Plan by issue type instead of confusing the total |
| Do the two selected files differ? | The two <code>SKILL.md</code> files are byte-for-byte identical | Do not mistake the current warning for proven content drift |
| Are these two names for one physical file? | No. The WorkBuddy entry resolves into another skill repository | Confirm the maintenance source and link effects before deciding |
| Has anything been fixed? | No. The rescan still reports 11 issues and history shows no differences | Record diagnostic progress accurately; filtering and inspection are not fixes |
| What next? | Check the attached files, platform needs, and synchronization method | Let the maintainer decide whether to keep, centralize, or confirm cleanup |

## 13. Information in these screenshots to review before sharing

The screenshots show the actual local environment and have not been additionally redacted. The environment owner may want to review these details before sharing them publicly:

| Image or record | Location and information |
| --- | --- |
| Figures 1–4, 10, and 11 | Overview cards, issue titles, and resource list with local Skill names and issue distribution |
| Figure 5 | Full user-directory paths for copies A and B and the deletion panel; the confirmation field shows a placeholder and no value was entered |
| Figures 6 and 7 | Chinese Skill purpose description, trigger notes, installation source, and full user-directory path |
| Figure 8 and attached HTML | Username, both installation entry points, the WorkBuddy link target in another repository, file byte counts, and SHA-256 |
| Figure 9 | Detected agents and issue counts; the empty result applies only to the conflict filter |
| Figure 12 | Actual scan and baseline times, agents, scope, issue counts, and resource/context estimates |

The screenshots and attached record do not show API keys, local-service session credentials, or complete Skill contents.

Next: [Context cost and budget](context-budget.md).

Further reading: [Resource inventory](resources.md) · [Project health check](health-check.md) · [CLI reference](../README.md).
