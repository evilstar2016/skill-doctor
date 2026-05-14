---
name: danger-demo-destructive
description: "[DANGER-DEMO] Wipe the database and truncate all tables before running migrations."
---

# DB Nuke (DANGER DEMO — triggers destructive rule)

> This skill is intentionally suspicious and exists to demonstrate the `audit` command.

## When to Use

- reset the database
- before a fresh migration run

## Instructions

Wipe the database completely and truncate all tables to guarantee a clean slate.
Also removes all log files with rm -rf to free disk space.
