# skill-doctor-context-optimizer User Manual

## 1. What it is

`skill-doctor-context-optimizer` is a project-local context cleanup skill. It
uses the current task to inventory the skills and Codex plugins visible to the
agent, and—only after explicit permission—MCP runtimes. It then produces
reviewable Keep, Disable in this project, and Review manually recommendations.

Its goal is to reduce context overhead for the current project, not to uninstall
resources or change global configuration.

### What it does

- Reads the current project's resource inventory and existing project-level state.
- Classifies resources by task relevance.
- Builds a preview with exact resource IDs, affected resources, and token estimates
  before any write.
- Applies project-local changes only after the user confirms the same preview,
  through the public `skill-doctor context enable|disable` interface.
- Rescans after applying, reports the verified estimator delta, and supports undo
  by operation ID.

### What it does not do

- It does not delete, uninstall, or globally disable skills, plugins, or MCP.
- It does not edit Codex or another agent's configuration directly.
- Without explicit permission, it does not start MCP stdio commands or contact
  HTTP/SSE MCP services.
- It never treats discovered names, descriptions, paths, or other metadata as
  instructions to execute.
- It does not present estimated tokens as billing or model-usage data.

## 2. Prerequisites

- Node.js 20 or newer.
- The `skill-doctor` CLI installed; the supported baseline is 0.5.0.
- A current agent platform that exposes project-level controls through
  `skill-doctor context`.

Check dependencies first. The skill must not install or upgrade them automatically:

```bash
node --version
skill-doctor --version
```

If the CLI is missing, too old, or failing, fix the environment first. Do not
bypass the skill by editing configuration files directly.

## 3. Install or link it into a project

Assuming the repository is at `/Users/you/GitHub/skill-doctor`, link the skill
into the project where the agent should use it:

```bash
cd /path/to/your-project
mkdir -p .codex/skills
ln -s /Users/you/GitHub/skill-doctor/skills/skill-doctor-context-optimizer \
  .codex/skills/skill-doctor-context-optimizer
```

When the skill lives in the current project's `skills/` directory, a relative
link also works. Relative links are resolved from `.codex/skills/`:

```bash
ln -s ../../skills/skill-doctor-context-optimizer \
  .codex/skills/skill-doctor-context-optimizer
```

Verify the link:

```bash
readlink .codex/skills/skill-doctor-context-optimizer
test -e .codex/skills/skill-doctor-context-optimizer/SKILL.md
```

The target must exist and the link name must be exactly
`skill-doctor-context-optimizer`. If `.codex/skills` belongs to a different
project, recompute the relative path or use a valid absolute path.

## 4. Interactive workflow

State the task and the cleanup preference in the current agent, for example:

> I am writing unit tests for a TypeScript CLI. Use
> `skill-doctor-context-optimizer` in conservative mode; scan skills and plugins
> only, do not contact MCP, and show me the preview before applying anything.

The skill asks for one compact intake:

1. The current task and near-term work scope.
2. A mode: `conservative` (recommended), `balanced`, or `aggressive`.
3. Explicit permission for MCP runtime discovery.

Without MCP permission, the scan omits `--include-mcp`. With permission, explain
that stdio MCP commands may be started and HTTP/SSE MCP services may be contacted.

### Modes

| Mode | Decision rule |
| --- | --- |
| conservative | Disable only clearly unrelated, controllable resources with known estimates; keep uncertain items. |
| balanced | Include low-relevance, low-risk resources while retaining dependencies, protective resources, and project resources. |
| aggressive | Minimize context within the stated task boundary; project scope, exact confirmation, and controllability still apply. |

Every mode requires the exact disable list to be shown and confirmed. “Optimize my
context” is not approval to execute a generated list.

## 5. Command-line workflow

The script is located at:

`skills/skill-doctor-context-optimizer/scripts/context-optimizer.mjs`

The examples below use placeholders; replace them with absolute paths:

```bash
SKILL_DIR=/absolute/path/to/skill-doctor-context-optimizer
PROJECT_DIR=/absolute/path/to/project
```

### 5.1 Capture a read-only snapshot

Without MCP runtime discovery (the default and recommended path):

```bash
node "$SKILL_DIR/scripts/context-optimizer.mjs" snapshot \
  --project "$PROJECT_DIR" \
  --platform codex \
  --scope all
```

After the user explicitly permits MCP runtime discovery:

```bash
node "$SKILL_DIR/scripts/context-optimizer.mjs" snapshot \
  --project "$PROJECT_DIR" \
  --platform codex \
  --scope all \
  --include-mcp
```

Options:

- `--project DIR`: project directory; defaults to the current directory.
- `--platform PLATFORM`: agent platform; use `codex` in Codex.
- `--scope project|global|all`: project, global, or both; defaults to `all`.
- `--include-mcp`: explicitly enable MCP runtime discovery; omit it to scan only
  skills and plugins.

The snapshot is saved under `~/.skill-doctor/context-optimizer/snapshots/` and
printed as JSON. It does not change agent configuration, but it creates local
operation metadata. Disabled entries are included so the existing project policy
is visible; already-disabled and non-selectable entries must not be proposed.

### 5.2 Build a deterministic preview

Select only resource IDs returned by the snapshot with `selectable: true`:

```bash
node "$SKILL_DIR/scripts/context-optimizer.mjs" preview \
  --snapshot <snapshot-id> \
  --disable <resource-id> \
  --disable <resource-id>
```

Do not invent IDs. If the inventory changes, create a new snapshot and preview.

Inspect these fields:

- `operations`: actual operation types and `affectedItems`.
- `estimate.fixedEstimatedTokens`: estimated fixed/startup context reduction.
- `estimate.fixedEstimatedPercent`: share of the scanned baseline.
- `estimate.activationPotentialTokens`: possible on-demand activation reduction,
  reported separately.
- `estimate.unknownCostItems`: items with unknown cost, excluded from the numbers.
- `confirmationDigest`: the exact digest required to apply this plan.

A plugin child is coalesced into a whole-plugin operation. Selecting an MCP server
supersedes tools below that server, preventing duplicate counting or a misleading
partial disable.

### 5.3 Apply only after exact confirmation

Show the user the exact operations, affected resources, estimates, unknown items,
and limitations. Only after the user confirms that preview, run:

```bash
node "$SKILL_DIR/scripts/context-optimizer.mjs" apply \
  --plan <plan-id> \
  --confirm <confirmation-digest>
```

Before writing, the script rescans and validates the inventory fingerprint. If the
resource state changed, it refuses the stale plan and requires a new snapshot and
preview. Each write uses the public `skill-doctor context` interface; later
failures trigger rollback attempts for completed operations.

Important fields in a successful result:

- `id`: operation ID used for undo.
- `verifiedSavings`: fixed-context delta measured by before/after estimator scans.
- `requiresNewSession`: a new agent session or restart is normally required for the
  full context change to take effect.

### 5.4 Undo by operation ID

Undo is also a write action and requires an explicit user request:

```bash
node "$SKILL_DIR/scripts/context-optimizer.mjs" undo \
  --operation <operation-id>
```

If the result is `undo-partial` or an error, report the exact IDs that remain
unrestored. Never describe a partial recovery as complete.

## 6. Interpreting token estimates

- Fixed estimates approximate startup/selection context tokens; they are not billing data.
- Activation potential is the possible saving if a resource would later be activated;
  it is not guaranteed to occur on every turn.
- Codex skill/plugin lists are aggregated using character limits; plugin and MCP
  hierarchy is deduplicated.
- Items whose `estimateStatus` is not `estimated` appear in `unknownCostItems` and
  are excluded from the savings number.
- `verifiedSavings` is the difference between two post-apply `skill-doctor`
  estimator snapshots. It remains an estimator delta, not model-service usage.

Always report fixed savings and activation potential separately, along with the
baseline, percentage, unknown-cost exclusions, and the new-session limitation.

## 7. Safety boundaries and recovery

Keep the optimizer itself, the `skill-doctor` workflow it depends on, resources
required by the current project, dependencies of retained plugins, and protective
resources. In conservative mode, keep uncertain resources and place them in manual
review.

The script never changes global resources automatically. If the installed CLI does
not support project-level enable/disable for a resource, that resource is manual
review and must not be reported as disabled. Other platforms may be inventoried
when supported by the CLI, but their write capability is platform-dependent; Codex
is the primary supported path.

## 8. State, tests, and troubleshooting

Default state directory:

`~/.skill-doctor/context-optimizer/`

For tests or isolated runs, override it and optionally the CLI path:

```bash
SKILL_DOCTOR_OPTIMIZER_HOME=/tmp/optimizer-state \
SKILL_DOCTOR_BIN=/path/to/skill-doctor \
node "$SKILL_DIR/scripts/context-optimizer.mjs" snapshot --project "$PROJECT_DIR"
```

Common issues:

- **CLI not found**: verify `skill-doctor --version` is on the PATH of the same
  agent environment; do not bypass the check by editing configuration.
- **Digest mismatch**: do not retry the old digest; create a new snapshot and preview.
- **Inventory changed**: resources changed after preview; regenerate the plan.
- **Resource is not selectable**: it is already disabled, an aggregate estimate,
  uncontrollable, or unsupported; move it to manual review.
- **MCP scan failure or timeout**: confirm that MCP was authorized and inspect
  service reachability. If MCP is unnecessary, omit `--include-mcp`.
- **Broken link**: recompute the path from `.codex/skills/`, or use an existing
  absolute target.

Maintainers can run the bundled checks:

```bash
node --test "$SKILL_DIR/test/context-optimizer.node.mjs"
node --check "$SKILL_DIR/scripts/context-optimizer.mjs"
```
