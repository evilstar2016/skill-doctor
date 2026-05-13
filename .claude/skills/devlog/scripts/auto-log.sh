#!/usr/bin/env bash
# Auto-log a git commit to today's devlog.
# Install as: Claude Code PostToolUse hook (see SKILL.md for setup)
# Or manually: git config core.hooksPath .githooks && cp this .githooks/post-commit

set -euo pipefail

DATE=$(date +%Y-%m-%d)
TIMESTAMP=$(date +%Y-%m-%dT%H:%M:%S%z)
LOG_DIR="doc/devlog"
LOG_FILE="${LOG_DIR}/${DATE}.md"

# Get latest commit info
SHA=$(git log -1 --format="%h")
MSG=$(git log -1 --format="%s")

# Create dir if needed
mkdir -p "$LOG_DIR"

# Create header if file is new
if [ ! -f "$LOG_FILE" ]; then
  BRANCH=$(git rev-parse --abbrev-ref HEAD)
  cat > "$LOG_FILE" <<EOF
# Dev Log: ${DATE}

## Status
Branch: ${BRANCH}
Active Feature: (update with /devlog)

## Commits
<!-- auto-logged; run /devlog to enrich with requirement links and decisions -->

EOF
fi

# Append the commit record
echo "<!-- auto: ${TIMESTAMP} -->" >> "$LOG_FILE"
echo "- \`${SHA}\` ${MSG}" >> "$LOG_FILE"
echo "" >> "$LOG_FILE"

echo "[devlog] Recorded commit ${SHA} to ${LOG_FILE}"
