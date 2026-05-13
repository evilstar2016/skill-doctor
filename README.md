# Skill Doctor

Local CLI for discovering AI agent skills and detecting conflicts across mainstream coding tools.

## Supported Platforms

- Claude Code
- Cursor
- GitHub Copilot
- Codex
- Gemini CLI
- Windsurf
- Trae
- OpenCode
- Kiro IDE

## Usage

```bash
npm install
npm run build

node dist/index.cjs scan
node dist/index.cjs scan --scope project
node dist/index.cjs scan --json
node dist/index.cjs scan --scope all --json
node dist/index.cjs show karpathy-guidelines
node dist/index.cjs show karpathy-guidelines --json
node dist/index.cjs conflicts --fail-on high
node dist/index.cjs conflicts --scope global
node dist/index.cjs conflicts --kind duplicate
node dist/index.cjs conflicts --limit 10 --json
```

## Commands

- `scan` — discover skills from supported local paths and print a summary, including duplicate counts; `--json` also includes `summary.scopes` and `summary.platformsByScope`
- `show <name>` — print one skill's details; supports `--json`
- `conflicts` — detect duplicates and overlapping skills, with optional `--scope project|global|all`, `--kind duplicate|conflict|all`, `--limit N`, and `--json`

## Development

```bash
npm test
npm run test:coverage
npx tsc --noEmit
```

## LLM Configuration (OpenAI-Compatible)

The `show` command's LLM explanation and `scan --group` semantic labels read from:

- `~/.skill-doctor/config.json`

Example (MiniMax OpenAI-compatible API):

```json
{
  "analysis": {
    "baseUrl": "https://api.minimaxi.com/v1",
    "model": "MiniMax-M2.7-highspeed",
    "apiKey": "<YOUR_PLAN_API_KEY>"
  }
}
```

Notes:

- Provider type in some tools is named `OpenAI Compatible`, `Custom`, or `OpenAI-format`.
- You can switch model to `MiniMax-M2.7` if needed.
