# HN AI Ops Automation Handoff

Goal: build legitimate Hacker News participation around AI, LLM, and agent tooling topics so the account can develop real community history before any future `Show HN` retry.

This is not a spam or promotion workflow. It is a scan-and-handoff workflow for high-quality, human-authored interaction.

## Proposed Schedule

Timezone: Asia/Shanghai

- 09:30 daily
- 15:30 daily
- 21:30 daily

## Automation Prompt

```text
Use the `hacker-news-ai-operator` skill.

Scan Hacker News for current AI, LLM, agent, browser automation, developer tooling, eval, or safety threads.

Run one HN ops session:

1. Check HN newest/front/shownew and, if useful, HN Algolia searches for AI, LLM, and agent from the last 24h.
2. Select up to three relevant candidate threads.
3. Read the selected thread and linked source before proposing interaction.
4. Do not post generated or AI-edited comments.
5. Do not mention skill-doctor unless directly relevant and explicitly user-authored.
6. If a good interaction exists and no exact user-authored final comment text is supplied for this run, produce:
   - thread URL
   - source URL
   - short context summary
   - why it is worth interacting with
   - 2-4 talking points the user can write from
   - one concise question the user could ask in their own words
7. If the user has supplied exact final human-authored comment text and explicitly confirmed posting for the exact destination thread, treat that as action-time authorization and post that exact text without rewriting it.
8. If no good interaction exists, log a skip instead of forcing a comment.
9. Append the result to `marketing/ops-log/YYYY-MM-DD.md`.

Quality bar: curiosity-first, specific, kind, substantive, and non-promotional.

Standing constraint: the user wants posting to happen when properly authorized, but this does not authorize generated, AI-edited, promotional, or unspecified future comments. When exact final user text is missing, prepare a handoff instead of posting.
```

## Operating Constraints

- Three daily scan sessions are acceptable.
- Three forced comments per day are not acceptable.
- A session may end with "no post" if all candidates are low-quality, promotional, flamebait, or outside the account's real knowledge.
- Comments must be final human-authored text from the user.
- Submitting a comment is an external side effect. It may proceed only when the user has supplied exact final text and explicitly confirmed posting for the exact thread.
- The workflow must not upvote, request upvotes, request comments, or coordinate engagement.
- The workflow must not bypass HN `showlim`.

## Candidate Scoring

Score each candidate from 0 to 2:

- Relevance to AI/LLM/agent tooling.
- Source was actually read and understood.
- Comment can add a concrete technical question or observation.
- No need to mention `skill-doctor`.
- Thread tone is calm enough for good-faith interaction.

Only proceed when score is 7 or higher out of 10.

## Log Template

```text
## HN AI Ops - HH:MM Asia/Shanghai

Goal: scan AI-related HN threads and prepare one compliant human-authored interaction opportunity.

Sources checked:
- 

Candidate threads:
- 

Selected thread:
- 

Action:
- Prepared handoff / posted user-authored comment / skipped.

Final comment URL:
- 

Why this was compliant:
- 

Skipped reason:
- 

Risks:
- 

Next suggested scan:
- 
```

## Notes For Codex Automation Setup

The Codex automation tool was not available in this session. When available, create three daily recurring automations using the schedule above and the automation prompt in this file.

If automation tooling supports one schedule with multiple daily times, use one automation. If it only supports one time per task, create three tasks:

- `HN AI Ops Morning`
- `HN AI Ops Afternoon`
- `HN AI Ops Evening`
