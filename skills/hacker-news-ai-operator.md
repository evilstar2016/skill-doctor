---
name: hacker-news-ai-operator
description: Run compliant Hacker News AI-topic operations. Scan AI/LLM/agent threads, identify good-faith interaction opportunities, summarize context, and prepare a user-confirmed handoff for human-authored comments.
---

# Hacker News AI Operator

Use this skill when asked to operate Hacker News for AI, LLM, agent, developer tooling, or `skill-doctor` audience development.

The goal is to build legitimate HN account history and topic familiarity through curiosity-first participation, not to promote `skill-doctor`, farm karma, or bypass `Show HN` limits.

## Hard Rules

- Do not use HN primarily for promotion.
- Do not solicit upvotes, comments, submissions, stars, follows, or reciprocal engagement.
- Do not bypass `showlim` by disguising a `Show HN` submission as a normal link.
- Do not delete and repost the same item to get more attention.
- Do not post generated or AI-edited comments to HN.
- Do not force a comment quota. If no suitable thread exists, log a skip.
- Do not mention `skill-doctor` unless it is directly relevant, useful to the discussion, and the user explicitly provides the final wording.
- Do not submit comments until the user provides or confirms the exact final human-authored text at action time.

## Daily Cadence

Run three scan sessions per day in Asia/Shanghai time:

- Morning: 09:30
- Afternoon: 15:30
- Evening: 21:30

Each session should aim to produce one of:

- A user-ready comment opportunity with context and suggested talking points.
- A posted user-authored comment, if the user has supplied and confirmed exact final text.
- A logged skip when no thread meets the quality bar.

## Topic Filters

Prioritize threads about:

- AI agents and agent frameworks
- LLM infrastructure and inference
- AI coding tools and developer workflows
- Browser automation for agents
- Evaluation, reliability, safety, and policy boundaries
- Prompt/instruction management when genuinely relevant
- Open-source AI tooling

Avoid:

- Generic AI stock/news churn
- Flamebait, politics-heavy threads, or overheated discussions
- Threads where the only possible comment would be promotional
- Threads older than 14 days or closed to new comments

## Scan Sources

Use Chrome when logged-in HN state is needed.

Recommended pages:

- https://news.ycombinator.com/newest
- https://news.ycombinator.com/front
- https://news.ycombinator.com/shownew
- https://hn.algolia.com/?dateRange=last24h&page=0&prefix=false&query=AI&sort=byDate&type=story
- https://hn.algolia.com/?dateRange=last24h&page=0&prefix=false&query=agent&sort=byDate&type=story
- https://hn.algolia.com/?dateRange=last24h&page=0&prefix=false&query=LLM&sort=byDate&type=story

## Session Workflow

1. Check HN official context if rules are uncertain:
   - Guidelines: https://news.ycombinator.com/newsguidelines.html
   - FAQ: https://news.ycombinator.com/newsfaq.html
2. Scan current AI-related threads from the sources above.
3. Pick at most three candidate threads.
4. For each candidate, read the thread and linked source before proposing any interaction.
5. Select one best opportunity using this quality bar:
   - It is genuinely technical or intellectually interesting.
   - The comment can add a question, caveat, implementation detail, or experience-based observation.
   - The interaction does not require mentioning `skill-doctor`.
   - The thread is not primarily a fight, meme, or marketing pile-on.
6. Prepare a handoff:
   - Thread title and URL
   - Source URL
   - Why this thread is worth interacting with
   - Short context summary
   - 2-4 human talking points
   - One concise question the user could ask in their own words
7. If the user provides exact final text, confirm the thread URL and comment text immediately before submitting.
8. After posting, verify the comment appears on the page.
9. Log the outcome.

## Comment Quality Bar

Good HN interaction:

- Reads like a person who engaged with the linked source.
- Is specific to the thread.
- Asks a concrete question or adds a useful technical distinction.
- Assumes good faith.
- Avoids snark, swipes, generic negativity, and promotional framing.

Bad HN interaction:

- Generic praise.
- Generic skepticism.
- Any hidden pitch for `skill-doctor`.
- A forced daily quota comment.
- Copy-pasted launch language.
- AI-written final text submitted as-is.

## Logging

Append each session to `marketing/ops-log/YYYY-MM-DD.md`:

```text
## HN AI Ops - HH:MM Asia/Shanghai

Goal:
Sources checked:
Candidate threads:
Selected thread:
Action:
Final comment URL:
Why this was compliant:
Skipped reason:
Risks:
Next suggested scan:
```

Use absolute URLs for HN threads. Do not log private account details, cookies, tokens, passwords, OTPs, or browser session data.
