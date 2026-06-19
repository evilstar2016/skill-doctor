## Summary

What changed and why?

## Verification

- [ ] `npm test`
- [ ] `npm run build`
- [ ] Manual CLI check, if relevant:

```bash
node dist/index.cjs scan --scope project
```

## Safety

- [ ] Does not upload local skill files by default
- [ ] Does not introduce destructive behavior without explicit confirmation
- [ ] Does not include private skills, secrets, tokens, or local-only data
