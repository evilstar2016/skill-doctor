# skill-doctor

[English](README.md) | [中文](README.zh-CN.md)

<p align="center">
  <img src="assets/brand/skill-doctor-logo.svg" alt="Skill Doctor" width="320">
</p>

[![npm version](https://img.shields.io/npm/v/%40evilstar2025%2Fskill-doctor.svg)](https://www.npmjs.com/package/@evilstar2025/skill-doctor)
[![Node.js](https://img.shields.io/badge/node-%3E%3D20-339933.svg)](https://nodejs.org/)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](#license)

**A local health check for AI agent skills, rules, and instructions.** Find duplicate skills, overlapping triggers, suspicious instructions, and oversized always-on context across coding agents.

Agent configuration accumulates across projects and platforms. `skill-doctor` helps explain inconsistent behavior by showing what is installed, what may compete, what deserves a security review, and what adds recurring context cost.

## Get started

Requires Node.js 20 or newer. Run a first scan without installing:

```bash
npx @evilstar2025/skill-doctor scan
```

Then check a project, or open the local UI:

```bash
npx @evilstar2025/skill-doctor check --scope project --fail-on high
npx @evilstar2025/skill-doctor ui
```

To try it on known sample data first, use the [safe demo project](examples/conflicted-agent-project/README.md) and compare its [expected findings](DEMO_OUTPUT.md).

## What it helps with

- **Inventory:** see skills and related agent configuration across supported platforms.
- **Consistency:** find duplicate installs and overlapping descriptions or triggers.
- **Security review:** flag suspicious shell, destructive, credential, and network instructions.
- **Context cost:** estimate recurring token usage for skills, rules, always-on files, and supported MCP tools.
- **Automation:** create reports or use `check` as a CI health gate.

The focus is diagnosis of configuration already on your machine. `skill-doctor` does not distribute or install skills by default.

## Trust and limitations

- Default local checks do not upload scanned content; optional model-powered analysis uses the provider you configure.
- Security findings are static signals for review, not a guarantee that a skill is safe or unsafe.
- Token totals are estimates, not official platform billing or a promise of savings.
- The 13 platform adapters differ in feature coverage and test evidence. See the [platform paths, feature coverage, and known limits](docs/platform-support.md).

## Documentation

Browse the [user manual index](docs/manuals/README.md) by workflow.

| Need | Guide |
|------|-------|
| Project health check: steps, real screenshots, and result interpretation | [Manual](docs/manuals/health-check.md) · [中文](docs/manuals/health-check.zh-CN.md) |
| Find resources, trace sources, and review sharing and linked issues | [Manual](docs/manuals/resources.md) · [中文](docs/manuals/resources.zh-CN.md) |
| Diagnose duplicates and trigger conflicts, compare files, and verify outcomes | [Manual](docs/manuals/conflicts.md) · [中文](docs/manuals/conflicts.zh-CN.md) |
| Understand context estimates, locate costly resources, and adjust budgets | [Manual](docs/manuals/context-budget.md) · [中文](docs/manuals/context-budget.zh-CN.md) |
| Interpret security levels, locate suspicious instructions, and review evidence | [Manual](docs/manuals/security-audit.md) · [中文](docs/manuals/security-audit.zh-CN.md) |
| Codex context optimization, confirmation, and new-task verification | [Optimization workflow](docs/manuals/codex-optimization.md#optimization-workflow) · [Historical estimates](docs/manuals/codex-optimization.md#history-estimate) · [中文](docs/manuals/codex-optimization.zh-CN.md) |
| Import and take over skills | [Import](docs/manuals/skill-library.md#import) · [Take over](docs/manuals/skill-library.md#take-over) · [Name conflicts](docs/manuals/skill-library.md#name-conflicts) · [中文](docs/manuals/skill-library.zh-CN.md#import) |
| Deploy and uninstall skills | [Deployment and conflicts](docs/manuals/skill-library.md#deploy) · [Uninstall or delete](docs/manuals/skill-library.md#uninstall) · [中文](docs/manuals/skill-library.zh-CN.md#deploy) |
| Sync and manage skills in bulk | [Installation status](docs/manuals/skill-library.md#installation-status) · [Sync](docs/manuals/skill-library.md#sync) · [Batch operations](docs/manuals/skill-library.md#batch-operations) · [中文](docs/manuals/skill-library.zh-CN.md#installation-status) |
| Commands, options, configuration, and CI | [CLI reference](docs/README.md) |
| Walkthroughs with terminal and UI screenshots | [Interactive manual](https://evilstar2016.github.io/skill-doctor/en/pages/manual.html) |
| Platform paths and test maturity | [Platform support](docs/platform-support.md) |
| Sample output | [Safe demo findings](DEMO_OUTPUT.md) |
| Compare with manual audits | [Comparison](COMPARISON.md) |
| Contribute or add a platform | [Contributing](CONTRIBUTING.md) · [Platform adapter guide](ADDING_PLATFORM.md) |
| Project status and security | [Roadmap](ROADMAP.md) · [Changelog](CHANGELOG.md) · [Security policy](SECURITY.md) |

For questions or redacted real-world drift reports, use [GitHub Discussions](https://github.com/evilstar2016/skill-doctor/discussions/6) or the [feedback issue](https://github.com/evilstar2016/skill-doctor/issues/4).

## License

MIT — see [LICENSE](LICENSE).
