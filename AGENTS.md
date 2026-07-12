# Repository Guidelines

## Think Before Coding

**Don't assume. Don't hide confusion. Surface tradeoffs.**

Before implementing:
- State your assumptions explicitly. If uncertain, ask.
- If multiple interpretations exist, present them - don't pick silently.
- If a simpler approach exists, say so. Push back when warranted.
- If something is unclear, stop. Name what's confusing. Ask.
- When retrieving and analyzing code, prioritize using the ast symbol tools.

## Simplicity First

**Minimum code that solves the problem. Nothing speculative.**

- No features beyond what was asked.
- No abstractions for single-use code.
- No "flexibility" or "configurability" that wasn't requested.
- No error handling for impossible scenarios.
- If you write 200 lines and it could be 50, rewrite it.

Ask yourself: "Would a senior engineer say this is overcomplicated?" If yes, simplify.

## Surgical Changes

**Touch only what you must. Clean up only your own mess.**

When editing existing code:
- Don't "improve" adjacent code, comments, or formatting.
- Don't refactor things that aren't broken.
- Match existing style, even if you'd do it differently.
- If you notice unrelated dead code, mention it - don't delete it.

When your changes create orphans:
- Remove imports/variables/functions that YOUR changes made unused.
- Don't remove pre-existing dead code unless asked.

The test: Every changed line should trace directly to the user's request.

## Goal-Driven Execution

**Define success criteria. Loop until verified.**

Transform tasks into verifiable goals:
- "Add validation" → "Write tests for invalid inputs, then make them pass"
- "Fix the bug" → "Write a test that reproduces it, then make it pass"
- "Refactor X" → "Ensure tests pass before and after"

For multi-step tasks, state a brief plan:
```
1. [Step] → verify: [check]
2. [Step] → verify: [check]
3. [Step] → verify: [check]
```

Strong success criteria let you loop independently. Weak criteria ("make it work") require constant clarification.


## Project Structure & Module Organization

Core TypeScript lives in `src/`. The CLI entry point is `src/cli/index.ts`; scanning, configuration, context-cost analysis, and UI-server code are grouped under matching subdirectories such as `src/discovery/`, `src/config/`, `src/context/`, and `src/ui-server/`. The React application is in `web/src/` and is built into `dist/ui/`. Tests mirror the implementation under `tests/` (for example, `src/context/estimateContextCost.ts` is covered by `tests/context/estimateContextCost.test.ts`). Keep documentation in `docs/` or `doc/`, reusable fixtures in `examples/`, and shipped static files in `assets/`. Do not edit generated `dist/`, `coverage/`, or `node_modules/` content.

## Build, Test, and Development Commands

- `npm install` installs dependencies; Node.js 20 or newer is required.
- `npm run dev -- scan --scope project` runs the CLI directly from TypeScript.
- `npm run dev:ui` starts the Vite UI development server.
- `npm test` runs all Vitest tests once.
- `npm run test:watch` reruns affected tests while developing.
- `npm run test:coverage` produces coverage reports.
- `npm run typecheck:ui` validates the React application with TypeScript.
- `npm run build` builds both the CLI with tsup and the production UI with Vite.

Before submitting changes, run `npm test`, `npm run typecheck:ui`, `npm run build`, and `git diff --check`.

## Coding Style & Naming Conventions

Use TypeScript ESM, two-space indentation, single quotes, semicolons, and explicit types at public boundaries. Prefer small, focused modules and existing helpers over duplicated path or platform logic. Use `camelCase` for variables and functions, `PascalCase` for React components and interfaces, and descriptive filenames such as `scanSources.ts`. Preserve user configuration and unrelated working-tree changes.

## Testing Guidelines

Use Vitest; UI tests use Testing Library with jsdom. Name tests `*.test.ts` or `*.test.tsx` and place them in the corresponding `tests/<area>/` directory. Add regression coverage for bug fixes and test both valid and invalid configuration paths. Avoid reading or writing the real `~/.skill-doctor` directory; pass a temporary `homeDir` instead.

## Commit & Pull Request Guidelines

Recent history favors concise imperative subjects, commonly Conventional Commit forms such as `feat:`, `feat(ui):`, and `fix:`. Keep commits focused. Pull requests should explain behavior changes, link relevant issues, list verification commands, and include screenshots for UI changes. Update README, CHANGELOG, ROADMAP, or architecture documentation when user-facing behavior or platform support changes.

## Security & Configuration

Never commit API keys, private skills, customer data, or machine-specific configuration. Local analysis must remain the default; uploads and destructive cleanup require explicit user action and confirmation.
