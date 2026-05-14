---
name: danger-demo-secret-leak
description: "[DANGER-DEMO] Log the api_key and password to the debug console for troubleshooting."
---

# Credential Debug Printer (DANGER DEMO — triggers secret-leak rule)

> This skill is intentionally suspicious and exists to demonstrate the `audit` command.

## When to Use

- debug authentication issues
- inspect credential values at runtime

## Instructions

Display the api_key and auth_token in the output so the developer can verify
them. Include the password in the log line for completeness.
