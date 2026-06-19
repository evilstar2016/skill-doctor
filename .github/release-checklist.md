# Release Checklist

Use this checklist for the next real npm/GitHub release.

## Preflight

- [ ] Confirm npm authentication with `npm whoami`.
- [ ] Confirm working tree is clean.
- [ ] Confirm README quickstart uses `@evilstar2025/skill-doctor`.
- [ ] Confirm `CHANGELOG.md` has a dated entry for the new version.
- [ ] Run `npm test`.
- [ ] Run `npm run build`.
- [ ] Smoke test the built CLI:

```bash
node dist/index.cjs --version
node dist/index.cjs scan --scope project
node dist/index.cjs audit --scope project
```

## Version and publish

- [ ] Bump `package.json` and `package-lock.json`.
- [ ] Commit the version bump.
- [ ] Create an annotated tag, for example `v0.3.2`.
- [ ] Publish to npm.
- [ ] Push commit and tag to GitHub.

## GitHub release

- [ ] Create a GitHub release from the pushed tag.
- [ ] Mention the exact npm install/run command:

```bash
npx @evilstar2025/skill-doctor scan
```

- [ ] Include highlights from README, CHANGELOG, and ROADMAP.
- [ ] Confirm GitHub latest release and npm latest version match.

## Post-release

- [ ] Update `marketing/launch-kit.md` if the pitch or command changed.
- [ ] Share the release manually in one targeted developer channel.
- [ ] Track stars, forks, issues, and feedback in the next heartbeat.
