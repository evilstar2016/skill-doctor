---
name: test-driven-development
description: Drives development with tests. Use when implementing any logic, fixing any bug, or changing any behavior. Use when you need to prove that code works, when a bug report arrives, or when you're about to modify existing functionality.
---

# Test-Driven Development

## Overview

Write a failing test before writing the code that makes it pass. For bug fixes, reproduce the bug with a test before attempting a fix. Tests are proof — "seems right" is not done.

## When to Use

- Implementing any new logic or behavior
- Fixing any bug
- Modifying existing functionality
- Adding edge case handling
- Any change that could break existing behavior

## The TDD Cycle

1. RED — write a test that fails
2. GREEN — write the minimum code to make it pass
3. REFACTOR — improve the implementation while keeping tests green

## Testing Principles

- Test behavior, not implementation details
- Prefer real implementations over mocks when practical
- Use Arrange-Act-Assert
- Keep tests descriptive and isolated
- Use the test pyramid: mostly unit tests, fewer integration tests, very few E2E tests

## Verification

After completing any implementation:
- [ ] Every new behavior has a corresponding test
- [ ] All tests pass
- [ ] Bug fixes include a reproduction test that failed before the fix
- [ ] Test names describe the behavior being verified
- [ ] No tests were skipped or disabled
