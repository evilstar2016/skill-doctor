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

| Need | Guide |
|------|-------|
| Commands, options, configuration, and CI | [CLI reference](docs/README.md) |
| Walkthroughs with terminal and UI screenshots | [Interactive manual](https://evilstar2016.github.io/skill-doctor/en/pages/manual.html) |
| Platform paths and test maturity | [Platform support](docs/platform-support.md) |
| Codex context optimization and evidence limits | [Codex optimization guide](docs/codex-optimization.md) |
| Sample output | [Safe demo findings](DEMO_OUTPUT.md) |
| Compare with manual audits | [Comparison](COMPARISON.md) |
| Contribute or add a platform | [Contributing](CONTRIBUTING.md) · [Platform adapter guide](ADDING_PLATFORM.md) |
| Project status and security | [Roadmap](ROADMAP.md) · [Changelog](CHANGELOG.md) · [Security policy](SECURITY.md) |

For questions or redacted real-world drift reports, use [GitHub Discussions](https://github.com/evilstar2016/skill-doctor/discussions/6) or the [feedback issue](https://github.com/evilstar2016/skill-doctor/issues/4).

## License

MIT — see [LICENSE](LICENSE).
