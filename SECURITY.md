# Security Policy

## Supported Versions

We currently support the latest released version of `skill-doctor`. Security
fixes are shipped as patch releases on the most recent minor line.

| Version | Supported          |
| ------- | ------------------ |
| 0.4.x   | :white_check_mark: |
| < 0.4.0 | :x:                |

## Reporting a Vulnerability

**Please do not open public GitHub issues for security vulnerabilities.**

Instead, report privately using one of these channels:

- **GitHub private vulnerability reporting**: open the project's **Security** tab
  and choose **Report a vulnerability**. This keeps the details confidential
  until a fix is ready.
- **Email**: send details to the maintainer (see the npm package `author` /
  repository owner). Use the subject prefix `[skill-doctor security]`.

When reporting, please include:

- A clear description of the vulnerability and its impact.
- The affected `skill-doctor` version (output of `skill-doctor --version`).
- Steps to reproduce, or a minimal redacted fixture.
- Any suggested mitigation if you have one.

You can expect an acknowledgement within a few business days. Once the issue is
confirmed, we will coordinate a fix and disclosure timeline with you.

## Scope Notes

`skill-doctor` is a **local-first CLI**. By design it:

- reads local skill, rule, and instruction files on your machine;
- does **not** upload your skills, rules, or configuration by default;
- performs destructive actions (for example `cleanup --execute`) only with
  explicit, interactive confirmation.

Please prioritize reports about:

- unintended data exfiltration or network upload of local files;
- unsafe or non-confirmed destructive behavior;
- audit-rule bypasses that let risky instructions pass as safe;
- anything that could expose credentials, API keys, or tokens.

## Safe Testing

To test the tool without touching your own configuration, use the bundled demo
project:

```bash
git clone https://github.com/evilstar2016/skill-doctor.git
cd skill-doctor/examples/conflicted-agent-project
npx @evilstar2025/skill-doctor scan --scope project
```

Redact any private paths, keys, customer names, or internal URLs before sharing
output in a report.
