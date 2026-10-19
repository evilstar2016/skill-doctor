# Skill Library Manual

[Manual index](README.md) · [English project README](../../README.md#documentation) · [中文](skill-library.zh-CN.md) · [HTML reading version](../skill-library-manual.html)

> Applies to: the main branch of skill-doctor, where the unified skill center is available
> Page: “Resource library → Skill library” (资源库 → 技能库) in the left navigation; redesigned from the former “Manage and export” page

---

## 1. What does this page do?

**In one sentence: The skill library is a central repository and installation ledger for all agent Skills on this machine. It addresses scattered Skills, drifting copies, and the inability to reuse Skills across agents.**

### 1.1 Problems it solves

Without the skill library, the lifecycle of a Skill (a directory containing a <code>SKILL.md</code>) might look like this:

1. You install a copy in Claude Code (<code>.claude/skills/my-skill/</code>).
2. Later, you start using Codex and manually copy it to <code>.codex/skills/</code>.
3. Three months later, you update the Claude Code copy, but the Codex copy is still old.
4. Project A has another project-level copy with different contents.
5. There is nowhere to answer: “Where is this Skill installed? Which copy is current?”

This is **version drift** and **unmanaged copies**. The skill library’s approach is:

- **Single source of truth:** Each managed Skill has one physical copy in the central repository, by default at <code>~/.skill-doctor/skills/</code>.
- **Installation ledger:** <code>~/.skill-doctor/center.json</code> records which agents and scopes each Skill was deployed to, whether it was copied or linked, and its content fingerprint.
- **Status checks:** Each time you open the page, the tool compares fingerprints for the central version and installed versions to show which are synchronized, outdated, or changed.

### 1.2 Three things you can do on the page

| Action | UI operation | In brief |
| --- | --- | --- |
| **Bring in** | Add to center library / Take over / Adopt | Bring Skills scattered across the machine into the central repository and ledger |
| **Deploy out** | Deploy to agent | Install a central Skill in a project-level or global directory for any agent |
| **Manage** | Sync / Relink / Uninstall | Track each installation, update outdated copies, and cleanly remove unwanted ones |

---

## 2. Core concepts at a glance

| Term | Meaning | Location |
| --- | --- | --- |
| **Central repository** | Physical storage for managed Skills; the shared “master” for all agents | Defaults to <code>~/.skill-doctor/skills/</code>; change it to a custom directory using “Change” (更改) at the top of the page |
| **Center library record** | Structured ledger of each Skill’s name, source, content fingerprint, and installations | <code>~/.skill-doctor/center.json</code> (read and written by both CLI and UI, so changes made in either are visible to the other) |
| **Managed** | A Skill in the central repository that can be viewed, deployed, synced, or uninstalled | A row with a “Deploy to agent” button |
| **Unmanaged / pending adoption** (<code>physical</code>) | A Skill found in an agent directory but not recognized by the center library | A row with a “Take over” button, grouped by source agent |
| **Installation** | A deployment instance of a central Skill at a specific location, identified by platform and scope | The Skill’s <code>installations</code> array in <code>center.json</code> |
| **Install method** | <code>copy</code> (independent copy) or <code>link</code> (link back to the central repository; on Windows, a directory junction) | Recorded for each installation |
| **Content fingerprint** (<code>treeHash</code>) | Hash of all files in the Skill directory, used to tell whether two copies match | The central and deployed versions each store one; comparing them determines the status |

**How a Skill installation is identified:** The center library derives a unique installation ID from the Skill name, platform, and scope. One Skill can therefore be installed globally in Claude Code and in a specific Codex project, with each installation tracked separately.

---

## 3. Unmanaged vs managed: what they are, where they come from, and how to use them

### 3.1 Unmanaged (pending adoption)

**Definition:** After scanning project-level and global Skill directories for each agent, the tool finds a Skill that exists on disk but is not registered in <code>center.json</code>.

**Where these Skills come from:**

- A Skill you previously copied manually into an agent directory.
- A Skill installed by another tool.
- The repository’s own <code>skills/skill-doctor</code>. It appears as “unmanaged” the first time you use the page; this is normal and not an error.

**How the tool decides:** It matches directory names and compares content fingerprints. If an unmanaged Skill has the same name as a managed Skill but different contents, it is marked as a same-name content conflict. You need to decide how to handle it first (see [Handling same-name conflicts](#name-conflicts)).

**When to adopt it:**

- ✅ You want to reuse the Skill with another agent → adopt it, then deploy it with one action.
- ✅ You want version tracking, outdated notices, and synchronization → adopt it.
- ❌ It is a one-off experiment or project-only Skill that you do not want to share → you can leave it alone. It remains quietly listed and does not affect other features.

### 3.2 Managed

**Definition:** A Skill has a physical copy in the central repository and a record in <code>center.json</code>.

**What you can do after adopting it:**

| Capability | UI entry point | Description |
| --- | --- | --- |
| Deploy to any agent | “Deploy to agent” in the row | Choose the target platform and scope (project-level or global), then copy or link |
| Track status | Status badges in the installation list | Synced / outdated / modified / missing / conflict (see [Installation status](#installation-status)) |
| Sync in one action | “Sync” button | Push the central version to outdated installations |
| Clean uninstall | “Uninstall” button | Remove files at the installation location and clear the ledger entry, without leaving an orphan directory |
| Related issues | “View related issues” in the detail panel | Open the “Needs attention” page for diagnostic issues involving the Skill |

---

## 4. Three ways to bring a Skill into the library

<a id="import"></a>

### 4.1 Add to the center library (import a new Skill)

- **Entry point:** “Add to center library” (加入中心库) at the top of the page.
- **Use when:** The Skill is not yet in any agent directory. It may be in a development folder on your disk or come from GitHub or a marketplace.
- **Flow:** Choose a source (local directory, a <code>SKILL.md</code> path, or a directory URL) → review the preview → confirm. The files are **copied** into the central repository and registered.
- There is no link option here: the central repository needs an independent master copy. Changes made later in the source directory are not automatically imported.

<a id="take-over"></a>

### 4.2 Take over / adopt (move a Skill from an agent directory)

- **Entry point:** “Take over” (纳管) on an unmanaged row; the detail panel calls the same action “Adopt” (收回).
- **Use when:** A Skill already exists in an agent directory and you want to bring it under the center library’s management.
- **Flow** (<code>takeOver</code>): Move the physical files from the agent directory into the central repository → leave a **link pointing to the central copy** in the original location → record the installation in the ledger.
- **Result:** The agent continues to use the Skill without interruption because the link is transparent to it. The center library manages the Skill from then on. Editing the file from the agent directory edits the central master because that path is a link.

> Another way to think about it: “Take over” and “Adopt” mean the same thing—the physical directory moves into the central repository and a link is left in its place. The two labels are leftovers from the older UI; there is no need to distinguish them.

<a id="name-conflicts"></a>

### 4.3 Handle same-name conflicts

If the center library already has a same-name Skill with different contents, it offers two conflict options:

| Option | What it does | When to use it |
| --- | --- | --- |
| **Keep both and adopt the current version** | Stores the current contents in the center library under a new name (such as <code>my-skill-1</code>) and links the agent directory to that new copy | Both versions are valid evolutions and you want to keep them; you can compare them in the detail panel and merge later |
| **Use the central repository version** | **Backs up** the local directory first, then replaces it with a link to the existing central version | The central version is authoritative and the local changes can be discarded or have already been backed up |

The page shows a file-by-file diff with added and removed line counts to help you decide. During bulk adoption, conflict items are skipped automatically and must be handled one by one.

---

<a id="installation-status"></a>

## 5. Understand installation status (the most confusing part)

Every entry in the “Installations” list for a managed Skill has a status badge. The decision compares three fingerprints: **the current target-directory contents**, **the contents at the last deployment**, and **the current central-library contents**.

| Status | Plain-language condition | What it means | What to do |
| --- | --- | --- | --- |
| **Synced** (<code>synced</code>) | All three match, or the link points to the central repository | Everything is up to date | No action needed |
| **Outdated** (<code>outdated</code>) | Target matches the last deployed copy, but the central version has changed | The master copy was updated; this installation is old | Click “Sync” to deploy the new version |
| **Modified** (<code>modified</code>) | Target differs from the last deployed copy | Someone edited this copy in the agent directory | To keep the change, move it back to the central source manually before syncing. To discard it, sync to overwrite it. |
| **Missing** (<code>missing</code>) | The installation path no longer exists | Someone deleted the directory manually, or the drive changed | Sync or relink to restore it, or uninstall to clear the stale record |
| **Conflict** (<code>conflict</code>) | The link was replaced or broken, the central master was deleted, or the directory has the wrong shape | The current state does not match the ledger, so the tool will not handle it automatically | Inspect the current state manually, then decide whether to relink or uninstall |

**A typical timeline:**

```text
Adopt Skill v1 → deploy a copy to Codex (status: synced)
→ edit v2 in the central directory (Codex copy becomes: outdated)
→ click “Sync” → Codex gets v2 (back to: synced)
→ edit the file directly in the Codex directory (becomes: modified)
→ click “Sync” to force overwrite → back to: synced (your change is discarded)
```

> Note: **An installation in link mode always shows “Synced”** because it is the central copy itself. Only copy mode can become “Outdated” or “Modified.”

<a id="batch-operations"></a>

### 5.1 Bulk actions: select all, sync, and deploy

A Skill may be installed in several agents and scopes. Syncing each one individually gets tedious, so the library provides bulk actions. Select list rows and a **bulk action bar** appears at the bottom of the page.

**How to select:**

- Select individual row checkboxes.
- The “Managed skills” table header has a **Select all** checkbox to select every managed Skill in the current filtered results. Combine it with search, source, or status filters to target a specific set.
- Each agent group in “Unmanaged” has a **Select this group** checkbox. Same-name content conflicts are automatically excluded because they need individual decisions and must not enter the bulk flow.

**Bulk sync (most common):** Runs “Sync” on **every installation** of each selected Skill, bringing each deployment back in line with the center library:

| Installation status | Bulk-sync behavior | Risk |
| --- | --- | --- |
| Outdated | Overwrites the older copy with the central version (without force) | Safe |
| Modified / Conflict | **Force-overwrites** ⚠️ | Local changes in the agent directory are discarded |
| Synced / Missing | Safely relinks or reinstalls | None |

Example: <code>code-review</code> is installed in three agents—Claude is a link and always synchronized, the Codex copy is outdated, and someone modified the Cursor copy. Select it and click “Bulk sync” → confirm → Codex receives the central version, Cursor’s local changes are overwritten, and a toast says “Synced 3 installations.”

**When to use it:** You updated a group of Skills centrally and want to refresh outdated copies across agents, or you want to run a periodic alignment check. If you want to keep local customizations, move them into the central source first (see the “Modified” row in [Installation status](#installation-status)), then bulk sync.

**Bulk deploy:** Select several managed Skills and click “Bulk deploy.” Choose a target once (platform, scope, and install method) for all selected Skills. Conflict previews let you decide for each Skill-target pair whether to overwrite, keep, or skip; there is no silent overwrite.

**Bulk adopt / bulk uninstall:** Select unmanaged rows to adopt them together; their original locations are replaced with links to the central repository (conflicts are skipped automatically; see [Handling same-name conflicts](#name-conflicts)). Select managed rows to uninstall several at once: all installations are removed first, then the central masters are removed. This is a destructive operation with a confirmation step.

---

<a id="deploy"></a>

## 6. Deploy to an agent: copy or link?

After clicking “Deploy to agent” on a managed Skill, choose the target platform, scope (current project or global), install method, and conflict handling.

### 6.1 Two installation methods

| | Copy | Link |
| --- | --- | --- |
| What it is | Independent copy, no longer connected to the central repository | A link at the target pointing back to the central repository (a directory junction on Windows, no administrator permissions required) |
| After a central update | Status becomes “Outdated”; sync manually | **Takes effect automatically**; always uses the latest version |
| Edit from the agent | Changes only the copy and triggers “Modified”; the central version is unaffected | Edits the central master and affects every installation linked to it |
| Good for | Project-specific variants or when link compatibility is a concern | Primary Skills that should follow central updates |
| Windows notes | No special requirements | Junctions require an absolute path and **cannot cross drives**. If the center library is on C:, do not link it to a project on E:. |

### 6.2 Handle conflicts

If a same-name Skill already exists at the target location, choose one of three options for each conflict before deployment: **Overwrite the target version**, **Keep the target version**, or **Skip this target**. The tool previews conflicts first and does not silently overwrite.

---

## 7. Walk through common scenarios

### Scenario A: You wrote a new Skill and want to use it in Claude Code and Codex

1. Skill library → “Add to center library” → select the local development directory → confirm; the Skill enters the central repository.
2. Find it in the list → “Deploy to agent” → select Claude Code · Global · Link → confirm.
3. Click “Deploy to agent” again → select Codex · Global · Link → confirm.
4. From then on, edit only the central copy. Both agents automatically get the new version because both installations are links.

### Scenario B: You have several Skills in Claude Code and want to share them with Codex

1. Open the skill library. The unmanaged section lists them by agent.
2. Adopt each one, or select several and use “Bulk adopt,” then confirm. The original directory becomes a link and the physical copy moves into the central repository.
3. For each Skill, click “Deploy to agent” and select Codex with copy or link.
4. Done. Editing the Claude Code path edits the central Skill. Codex follows automatically if it is a link; a copy is marked “Outdated.”

<a id="sync"></a>

### Scenario C: A Skill in the center library was updated and all copies should follow

1. Open the skill library and find the Skill whose installation list has an “Outdated” badge.
2. If it has only a few installations, click “Sync” on each. If it has many installations—or you want to refresh several Skills at once—select them and use “Bulk sync” (see [Bulk actions](#batch-operations)).
3. Confirm that all statuses return to “Synced.”

<a id="uninstall"></a>

### Scenario D: You no longer want a Skill

- To remove it from one agent only: click “Uninstall” on that installation row. This removes its files and ledger record but keeps the central master.
- To delete it completely: remove the Skill from the detail panel. This deletes the central master; linked installations then become “Conflict” or “Missing” and must be uninstalled individually.

---

## 8. Frequently asked questions

**Q1: The page shows one record and the center library says “No skills yet.” Is it broken?**

No. The tool does not migrate Skills silently. If your existing Skills are all in agent directories and none has been adopted, the center library is empty; they appear as unmanaged. This is expected.

**Q2: Does changing the center-library location move the files?**

No automatic migration occurs. Changing the location affects only where Skills adopted later will be stored. Existing content stays where it is. Copy the old directory yourself before switching locations.

**Q3: Could uninstalling delete something I need?**

Uninstall removes only the installation path registered in the ledger (the directory or file written during deployment). It does not touch the central master or other installations. The separate “Resource inventory” page has path confirmation for dangerous duplicate cleanup.

**Q4: Can I edit a Skill in an agent directory using the file manager?**

In link mode, yes; that edits the central master and affects all linked installations. In copy mode, it edits only that copy and marks it “Modified.” A later sync overwrites your changes.

**Q5: Can I do the same thing from the CLI?**

Yes. The CLI and UI use the same <code>center.json</code>:

```bash
skill-doctor install <source> --target <platform>   # install and register in the center library
skill-doctor uninstall <name>                       # uninstall and remove the ledger entry
skill-doctor center show                            # view center-library contents (JSON)
skill-doctor center migrate                         # one-time migration from the old catalog/deployments/registry
```

**Q6: What should I know about privacy?**

The skill library runs locally: the central repository, ledger, and deployments stay on this machine, and Skill contents are not uploaded. Installing from a marketplace is the only operation here that needs a network connection to retrieve public entries.

---

## 9. Quick reference

- **Central repository** = one home for master copies (<code>~/.skill-doctor/skills/</code>); **center.json** = the ledger.
- **Unmanaged** = “on disk, not in the ledger”; **managed** = “in the repository, ready to deploy and track.”
- **Take over / adopt** = move into the repository and leave a link in place; the agent does not notice a change.
- **Deploy** = distribute from the repository to any platform or scope; **copy** is independent, **link** follows the center.
- **Five statuses:** Synced (all good) / Outdated (the center is newer; sync it) / Modified (the copy changed) / Missing (the path is gone) / Conflict (the current state does not match; inspect it manually).
- **Bulk actions:** Select rows → use the bottom action bar. Bulk sync brings all installations of selected Skills in line with the center library. Modified and conflicting copies are overwritten, so review the confirmation carefully.
- All operations run locally, and the UI and CLI share the same ledger.
