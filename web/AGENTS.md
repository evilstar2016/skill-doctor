# Frontend style contract

Read `DESIGN.md` before changing frontend styles or components.

- Keep the fixed Sentry-inspired deep-purple workbench. Do not introduce alternate themes or follow OS color preferences unless the user requests it.
- Define theme values only in `src/theme.css`; consume those variables in shared and page styles.
- Preserve warm-purple surfaces, inset primary buttons, visible keyboard focus, and sparse lime highlights.
- Keep existing business behavior and responsive navigation. Validate desktop and mobile rendering when changing layout.
