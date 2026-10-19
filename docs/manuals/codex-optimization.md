# Codex context optimization manual

[Manual index](README.md) · [Project README](../../README.md#documentation) · [中文](codex-optimization.zh-CN.md)

This guide collects the Codex-specific optimization workflow and its evidence limits. It is a companion to the [CLI reference](../README.md).

<a id="optimization-workflow"></a>

## Codex optimization suggestions

Open `skill-doctor ui` and choose **Optimization suggestions** with Codex selected.
The three-step flow defaults to all tasks in the current month (with a current-week
switch); the detail table is capped at 20 rows without truncating the period total.
It highlights cumulative estimated token and API-equivalent cost savings, with a
smaller selected-session first-response estimate and recorded period turn/response counts. The default price
is the highest model in the bundled table; a subtle control can switch to prices
recorded per response. Savings follow retained target text per response; compaction
and missing evidence are reported as coverage gaps, not extrapolated by multiplying
turn counts.
Supported actions:

- Hide the automatic skill catalog: project `skills.include_instructions = false`.
- Stop memory injection: user `memories.use_memories = false`, with global-impact confirmation.
- Turn off Plugins entirely: user `features.plugins = false`, which removes both `plugins.usage_instructions` and `plugins.recommendations` in a new task; this also disables plugin tools and skill discovery.

These controls were tested on Desktop `0.154.0-alpha.6.2`. Other identifiable versions
show a verification reminder rather than locking the controls. Closing requires a
complete initial header; already disabled controls offer Re-enable without requiring
the missing block in the header. Writes remain **pending** until
a newly created task's JSONL confirms removal or restoration; undo restores only the
changed key. Unknown prices/usage remain unknown, and estimates are not subscription
bills or guaranteed savings. Analysis covers the selected month or week; the detail
table shows up to 20 tasks without truncating the period total.
Single-skill disabling and standalone recommendation-block disabling are not offered
because their Desktop behavior has not been established reliably. The Plugins action
is intentionally a whole-feature switch, not a hide-only recommendation switch.

### Legacy history-driven configuration writes

**Warning:** the commands below can write configuration, but do not prove Desktop
prompt removal. In particular, project-level skill rules and recommendation flags
were ineffective in the tested Desktop version. Use the verified UI flow above;
do not interpret a successful configuration write as realized token savings.

The legacy workflow offers evidence, preview, confirmation and undo for configuration
writes. It does not disable installed plugins or global configuration.

```sh
# Run in the target project; keep this report private
skill-doctor benefit --json --output /tmp/project-benefit.json
skill-doctor context control --report /tmp/project-benefit.json --kind recommended_plugins --id 'figma@openai-curated-remote' --action disable
skill-doctor context control --report /tmp/project-benefit.json --kind recommendations --id recommended_plugins --action disable
# After reviewing, repeat the selected command with --confirm <preview-digest>
skill-doctor context control --undo <operation-id> --confirm <operation-id>
```

Use `--kind skills_instructions --id '<catalog Skill name>'` for a Skill. IDs come
from the report's `historyAnalysis.usageProfile`. `--action enable` explicitly enables
an entry; undo restores the previous configuration. Enabling an entry does not reopen
a closed recommendation block. Unsupported layouts/sources fail without a config write.
Private backups live under `.codex/skill-doctor-operations/`; do not commit them.
Writes are digest-confirmed, preserve existing disabled entries, and undo refuses to
overwrite subsequent changes. A trusted project and a new session are required to
verify actual context reduction; config verification is not realized token savings.

The UI includes a copyable Agent prompt. The `skill-doctor-context-optimizer` Skill
supports `history`, `history-control` and `history-undo`, sharing the CLI control path.
Ask it for a full evidence-backed report and preview before approving project changes.
The CLI must list `context control` in its help; older builds must not substitute
installed-plugin disabling for recommendation hiding.

<a id="history-estimate"></a>

## `benefit` (Codex historical estimate)

Estimate the effect of a Skill Doctor optimization plan against recent Codex
rollout JSONL sessions in the current project. If `--plan` is omitted, the
command enters read-only offline mode: all readable project history (including
archives, unless explicitly restricted by time/count) supplies a usage profile;
the latest active main session supplies each complete Skill/plugin catalog;
the main session with the most complete model responses supplies the workload.
Used resources are retained; unused catalog entries become review-before-disable
recommendations, even when absent from today's local inventory. The command
does not change Codex configuration, re-run Codex, or
claim a subscription-billing reduction.

```bash
skill-doctor benefit --project .  # all-history offline simulation
skill-doctor benefit --project . --format csv --output benefit.csv
skill-doctor benefit --project . --since 24h --limit 20 --plan <plan-id>
skill-doctor benefit --project . --since 7d --limit 50 --plan <plan-id> --format json --output benefit.json
skill-doctor benefit --project . --since 24h --plan <plan-id> --tokenizer openai --tokenizer-model gpt-4o --format html --output benefit.html
skill-doctor benefit --project . --include-archived --price-table ./prices.json
skill-doctor benefit --project . --retention-days 30
skill-doctor benefit --project . --delete-index --json
skill-doctor benefit --project . --delete-index-entry /path/to/rollout.jsonl --json
```

The report keeps observed input/cache/output/reasoning usage separate from the
projected input delta. It shows historical-cache and cache-rebuild sensitivity
scenarios, model-price coverage, skipped-session diagnostics, and the exact
response source file/line for local review. A no-plan result is an offline
simulation of latest-catalog text deletion across that workload, not realized
savings. A separate historical replay reports reconstructable responses and
unknown gaps after compaction. Reports identify catalog source hashes and baseline
session, distinguish user messages/turn IDs/completed turns/model responses, and
show first-response, first-interaction and per-response cache bounds in JSON,
HTML, CSV and the UI. Child usage is separate from main-thread savings.

`recommended_plugins` is a recommendation list, not installed plugins. The
configuration-only controls are `tool_suggest.disabled_tools` (exact plugin ID,
preserving existing connector/plugin entries) or both
`features.tool_suggest=false` and `features.recommended_plugins=false` for the
whole-block candidate. Per-ID filtering may refill unseen candidates (50-entry
render limit); whole-block disable also removes model-side installation
suggestions. A config write is not runtime proof: use a fresh Desktop task and
`skill-doctor context blocks --file <new-session.jsonl> --json`, then rely on its
`verification` and provenance fields. Unknown Skill controls remain hypothetical.

Historical context attribution keeps a recoverable source-file/line reference and
content hash rather than copying AGENTS or Skill text into the metadata index. If
an indexed analysis needs text reconstruction, the local rollout is re-read.
Truncated, duplicated, or incomplete host skill lists remain evidence-insufficient
instead of being treated as proof that a resource was removed.

For a plan with selected resources, the projected result is reconstructed from
matched historical context snapshots and a tokenizer-counted before/after text
diff; unmatched responses remain unchanged. A plan without per-resource
evidence uses the optimizer's proportional static estimate. Both paths hold
output, reasoning, tools, retries, compactions, quality, and latency constant.
Displayed money is an equivalent API-price estimate; it is not a Codex or
ChatGPT subscription bill.

Use `--tokenizer approx` only for a quick chars/4 comparison; the report records
the tokenizer and any model fallback. `--format html` writes a static, escaped,
redacted preview. `--format json --redact` writes a redacted JSON report for
sharing; the default JSON keeps local provenance for local re-computation.
The incremental index stores metadata only and can be explicitly removed with
`--delete-index`; it is rebuildable and does not delete Codex sessions. Use
`--retention-days N` to prune old index metadata, or `--delete-index-entry` to
remove one source file's index record. These commands only modify Skill Doctor's
own index.

Every custom price entry must declare either `maxInputTokens` or `inputTiers`.
Without an explicit long-context applicability range, the amount is marked
unknown while Token metrics remain available. The UI runs the local estimate as
a cancellable job and reports reading, association/validation, and simulation
phases over SSE.

When running through npm scripts, pass CLI flags after `--`:

```bash
npm run dev -- cost --platform codex
```

`cost` uses platform-aware modes:

| Mode | Applies to | Estimate basis |
|------|------------|----------------|
| `claude-skill-description` | Claude Code `SKILL.md` files | Name, description, and trigger metadata |
| `agent-skill-description` | Gemini, Windsurf, Kiro, Trae, OpenCode, OpenClaw, Hermes, WorkBuddy, InfCode, and Copilot skill dirs | Name, description, and trigger metadata |
| `cursor-rule-file` | Cursor `.cursor/rules/*.mdc` and rule files | Local rule file content |
| `copilot-instruction-file` | GitHub Copilot `.github/copilot-instructions.md` and `.github/instructions/**/*.instructions.md` | Local instruction file content |
| `copilot-prompt-file` | GitHub Copilot `.github/prompts/**/*.prompt.md` | Prompt file content, counted as manual activation context |
| `always-on-file` | `AGENTS.md`, `.codex/AGENTS.md`, `GEMINI.md`, `.windsurfrules`, `.cursorrules`, and similar always-on files | Local file content |
| `mcp-tool-list` | MCP servers for Copilot, Codex, Claude Code, Gemini CLI, Cursor, WorkBuddy, and InfCode | Live `tools/list` names, descriptions, and schemas when the server can be reached |

This keeps Claude's token-tax behavior as one mode inside a broader coding-agent configuration health check.

MCP cost mode reads local config files, then tries to inspect each configured MCP server. Streamable HTTP and legacy SSE servers are contacted through their configured URL; stdio servers are started from the project directory with their configured command and queried with `tools/list`. VS Code `.vscode/mcp.json` files are parsed as JSONC, including comments and trailing commas. If a server cannot be reached or started, the report keeps a zero-token MCP item with a fix message explaining the failure. MCP tool counts are a live preview, not a guarantee that every runtime tool will be present in the next agent session. UI scans inspect MCP tools by default; custom mode can disable live MCP discovery for untrusted projects.

Codex cost mode is configuration-driven. The built-in defaults live in `src/platforms/codex-config.json` and cover current Codex locations for `AGENTS.md`, skills, plugins, MCP config, and memories. Advanced users can add or override preview paths with `~/.skill-doctor/codex-config.json`, or pass a one-off file with `--codex-config <path>`. Arrays merge by `id`: matching ids override built-ins, new ids append, and `enabled: false` disables a scan source.

Codex resource filters:

```bash
skill-doctor cost --platform codex --scope project      # project startup context preview
skill-doctor cost --platform codex --scope global       # user-space startup context preview
skill-doctor cost --platform codex --resource agents
skill-doctor cost --platform codex --resource skill
skill-doctor cost --platform codex --resource mcp
skill-doctor cost --platform codex --resource plugin
skill-doctor cost --platform codex --resource memory
skill-doctor cost --platform codex --show-disable       # show disabled resources separately
skill-doctor cost --platform codex --resource plugin --include-cache  # inventory cached UI entries; zero token tax
```

Without `--scope`, `cost` uses `all`: current-project resources plus enabled user/global resources. For example, an enabled skill from a plugin under `~/.codex/plugins/` is reported as `scope: global` because it can affect every Codex project; user-layer `[[skills.config]]` selectors still disable individual plugin skills, but project-layer selectors do not. Use `--scope project` to inspect only files configured in the current project.

The Codex report includes only active context in `Estimated token tax`, `items`, and `resources`. With `--show-disable`, disabled skills, MCP servers, plugins, and other resources appear in a separate `Disabled resources (not counted)` section; JSON output uses `disabledItems` and `disabledResources`. Each controllable entry includes the corresponding `context enable` command. The former `--include-disabled` flag remains available as a compatibility alias.

`--include-cache` adds a separate inventory of plugin and skill UI metadata found under `~/.codex/plugins/cache`, including display names, descriptions, icon paths, cache provenance, and implicit/explicit invocation policy. Cached catalog entries are marked `cached` and `not counted`; merely appearing in the Codex UI is not treated as evidence that the metadata is injected into model context. The option is available for Codex with `--resource all|plugin`, and the structured inventory is returned as `catalog` in JSON output.

Codex controls:

| Resource | Cost preview | Automatic enable/disable | Written control |
|----------|--------------|--------------------------|-----------------|
| Skills | Historical initial-header catalog in the Codex UI; static metadata estimates in CLI cost reports | No project-level per-skill control | Project `skills.config` rules are ignored by Codex; manage individual skills at User/SessionFlags scope |
| MCP servers | Server config plus live `tools/list` when reachable | Config-only; fresh-task verification required | `[mcp_servers.<name>] enabled` |
| MCP tools | Individual live tools under a controllable MCP server | Config-only; fresh-task verification required | `enabled_tools` / `disabled_tools` on `[mcp_servers.<name>]` |
| Plugins | Plugin-contributed skills and MCP tools | Config-only; fresh-task verification required | `[plugins."<id>"] enabled` |
| `AGENTS.md` files | Always-on project and user guidance files | No | Reported as `unsupported`; edit or move the file manually |
| Memories | Memory presence and approximate text when available | No | Reported as `memory-context-unknown`; change Codex memory settings/config manually |

`context enable|disable` writes only the configured project Codex control file, normally `.codex/config.toml`; it does not edit global `~/.codex/config.toml`, plugin manifests, skill files, `AGENTS.md`, or memory storage. Results distinguish `changed`/`controlStatus: configured` from runtime verification and return `requiresNewSession: true`; start a new Codex session or restart Codex, then inspect its JSONL before claiming a header block was removed.

The context UI defaults to Current Context for every agent. For Codex, it lists skills from trusted `host_skills.instructions` / `<skills_instructions>` initial-header blocks in the latest 20 local project sessions. Select a session to inspect names, descriptions, resolved catalog paths and the block's Token estimate. Missing history or inherited/incomplete headers remain unknown instead of falling back to filesystem inventory. These are historical observations, not live context or proof of skill activation. The page links to Optimization Suggestions; hiding the entire automatic catalog remains available there and is distinct from disabling an individual skill.

Estimate limitations:

- Token estimates use the OpenAI tokenizer by default (`--tokenizer openai --tokenizer-model gpt-4o`) and reports include the tokenizer metadata. Use `--tokenizer approx` for the legacy `chars / 4` estimate. Non-OpenAI agent totals are still budgeting estimates, not official billing.
- Live MCP inspection depends on the current server being reachable and on `tools/list` returning the same tools Codex will see later.
- Runtime dynamic context can still add or remove instructions, tool schemas, memories, or plugin content after startup.
- Memories may appear as `memory-context-unknown` because Codex memory storage can affect future sessions without exposing deterministic injected text to this preview.

## Further reading

- [CLI reference](../README.md) for command options and usage.
- [Interactive English manual](https://evilstar2016.github.io/skill-doctor/en/pages/manual.html).
- [Platform support and validation](../platform-support.md).
- [中文指南](codex-optimization.zh-CN.md).
