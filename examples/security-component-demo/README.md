# Security component demo: invoice ownership

Synthetic Alice/Bob invoice data demonstrates a missing ownership check and a safe control. This intentionally vulnerable example is a local function fixture, not a server. Never deploy it or replace its data with customer data.

```bash
node examples/security-component-demo/reproduce.mjs
```

The script asserts that the vulnerable function returns Bob's invoice to Alice, the control rejects that request, and the control still returns Alice's own invoice. All three assertions must pass. This reproduces a boundary defect; it does not independently validate a model's audit or production exploitability.

For design mode, scope the optional security component to `examples/security-component-demo/design.md`. For code mode, use `examples/security-component-demo/invoices.mjs` and `reproduce.mjs`, and link the imported design report. Run the generated task in an external Agent. Import its complete `security-report.json`, not a bare findings array. If independent verification is unavailable, keep the lead as `needs_validation`.
