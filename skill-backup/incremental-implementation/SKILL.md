---
name: incremental-implementation
description: Delivers changes incrementally. Use when implementing any feature or change that touches more than one file. Use when you're about to write a large amount of code at once, or when a task feels too big to land in one step.
---

# Incremental Implementation

## Overview

Build in thin vertical slices — implement one piece, test it, verify it, then expand. Avoid implementing an entire feature in one pass. Each increment should leave the system in a working, testable state.

## When to Use

- Implementing any multi-file change
- Building a new feature from a task breakdown
- Refactoring existing code
- Any time you're tempted to write more than ~100 lines before testing

## The Increment Cycle

1. Implement the smallest complete piece of functionality
2. Test — run the test suite (or write a test if none exists)
3. Verify — confirm the slice works as expected
4. Commit — save progress with a descriptive message
5. Move to the next slice

## Slicing Rules

- Prefer vertical slices
- Keep the project buildable after every slice
- Use feature flags for incomplete features
- Default to the simplest thing that could work
- Touch only what the current task requires

## Increment Checklist

After each increment, verify:
- [ ] The change does one thing and does it completely
- [ ] All existing tests still pass
- [ ] The build succeeds
- [ ] Type checking passes
- [ ] Linting passes
- [ ] The new functionality works as expected

## Verification

After completing all increments for a task:
- [ ] Each increment was individually tested and verified
- [ ] The full test suite passes
- [ ] The build is clean
- [ ] The feature works end-to-end as specified
- [ ] No uncommitted changes remain
