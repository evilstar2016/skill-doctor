# Skill Doctor — Frontend Design System (DESIGN.md)

> AI-readable design specification for the **skill-doctor** local UI.
> The web UI is a diagnostic dashboard for AI-agent skills (conflicts, security, duplicates, context cost, drift). The visual metaphor is a **clinical command center**: precise, calm, trustworthy — like a vital-sign monitor for your agent configuration.

This document follows the [awesome-design-md](https://github.com/VoltAgent/awesome-design-md) 9-chapter structure. It is the single source of truth for the `web/src/styles.css` token layer and the appended "Design Refresh" override block. All components consume these CSS variables; changing a token here cascades across the entire product.

---

## 1. Visual Theme & Atmosphere

- **Philosophy** — "The doctor for your AI skills." The UI should feel like a medical instrument: neutral canvas, a single confident clinical-green accent that reads as *health / go / safe*, and red/amber/blue reserved strictly for alerts. Information density is high (it is a diagnostics tool) but never chaotic.
- **Visual tone** — Clinical, precise, calm, professional. Restrained color, generous structure, quiet motion.
- **Core visual keywords** — `clinical`, `precise`, `trustworthy`, `calm`, `instrument-grade`.
- **Light & material** — Flat surfaces with a refined multi-layer shadow scale; hairline borders; one subtle gradient on the brand mark and primary action only. No skeuomorphism. Dark mode is a deep "forest-ink" surface, not pure black.

---

## 2. Color Palette & Roles

All values are exact. Use the CSS variables, never hard-coded hex, in components.

### Light theme
| Role | Token | HEX | Use |
|------|-------|-----|-----|
| Background | `--bg` | `#f3f6f4` | App canvas (faint green-tinted neutral) |
| Surface | `--surface` | `#ffffff` | Cards, panels, inputs, drawers |
| Surface 2 | `--surface-2` | `#eef2ef` | Sub-panels, hover fills, tags |
| Surface 3 | `--surface-3` | `#e5ebe6` | Deepest inset panels |
| Text | `--text` | `#16201a` | Primary text (deep forest ink) |
| Muted | `--muted` | `#5b6860` | Secondary text, labels |
| Faint | `--faint` | `#8a958d` | Tertiary text, hints |
| Border | `--border` | `#dde4dd` | Default hairline borders |
| Border strong | `--border-strong` | `#c6d0c6` | Emphasized borders, focus edges |
| Accent | `--accent` | `#15925f` | Primary action, active nav, links |
| Accent hover | `--accent-hover` | `#117a4e` | Hover/press of accent |
| Accent soft | `--accent-soft` | `#e2f4ec` | Tinted fills, selected chips |
| Accent text | `--accent-text` | `#0c663f` | Text on accent-soft |
| Danger | `--danger` | `#d22f2f` | Errors, destructive actions |
| Danger soft | `--danger-soft` | `#fdeaea` | Danger pill background |
| Danger text | `--danger-text` | `#a31818` | Text on danger-soft |
| Warning | `--warning` | `#b97709` | Medium severity |
| Warning soft | `--warning-soft` | `#fdf3df` | Warning pill background |
| Warning text | `--warning-text` | `#8a5700` | Text on warning-soft |
| Info | `--info` | `#2f7da3` | Low severity, informational |
| Info soft | `--info-soft` | `#e6f1f6` | Info pill background |
| Info text | `--info-text` | `#1f5e7d` | Text on info-soft |
| Success | `--success` | `#15925f` | Positive status (alias of accent) |
| Success soft | `--success-soft` | `#e2f4ec` | Success pill background |
| Success text | `--success-text` | `#0c663f` | Text on success-soft |
| Sidebar | `--sidebar` | `#eef2ef` | Sidebar panel base |
| Code | `--code` | `#eef1ec` | Inline code / path chip background |

### Dark theme (`:root[data-theme="dark"]`)
| Role | Token | HEX |
|------|-------|-----|
| Background | `--bg` | `#0e1512` |
| Surface | `--surface` | `#161d19` |
| Surface 2 | `--surface-2` | `#1d261f` |
| Surface 3 | `--surface-3` | `#253028` |
| Text | `--text` | `#e7efe9` |
| Muted | `--muted` | `#9fab9f` |
| Faint | `--faint` | `#7c887c` |
| Border | `--border` | `#283129` |
| Border strong | `--border-strong` | `#374237` |
| Accent | `--accent` | `#2fbf86` |
| Accent hover | `--accent-hover` | `#3ccf93` |
| Accent soft | `--accent-soft` | `#173328` |
| Accent text | `--accent-text` | `#83e0b6` |
| Danger | `--danger` | `#ff7a6e` |
| Danger soft | `--danger-soft` | `#3a201d` |
| Danger text | `--danger-text` | `#ff9d94` |
| Warning | `--warning` | `#e7b34a` |
| Warning soft | `--warning-soft` | `#3a2f12` |
| Warning text | `--warning-text` | `#f0c669` |
| Info | `--info` | `#6fb6d6` |
| Info soft | `--info-soft` | `#16303a` |
| Info text | `--info-text` | `#8fcdec` |
| Sidebar | `--sidebar` | `#121a16` |
| Code | `--code` | `#1f2922` |

**Shadow color** (used inside `rgba()`): light `20,40,30`; dark `0,0,0`.

---

## 3. Typography Rules

- **Font family** — `'Inter', -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Microsoft YaHei", system-ui, sans-serif`. Mono: `"SFMono-Regular", "JetBrains Mono", Consolas, "Liberation Mono", monospace`.
- **Design philosophy** — One neutral grotesk for everything; weight and size carry hierarchy, not color. Negative letter-spacing on large headings for a tighter, instrument-like feel. Numbers use `tabular-nums` so stat values align in columns. Body is calm; only the big stat number gets the accent color (the "vital sign").

| Scale | Size | Weight | Line height | Letter spacing | Notes |
|-------|------|--------|-------------|----------------|-------|
| Display | 30px | 700 | 1.1 | -0.02em | Stat numbers (`.stat-card strong`) |
| H1 | 27px | 700 | 1.2 | -0.02em | Page titles (`.page-heading h1`) |
| H2 | 22px | 650 | 1.3 | -0.01em | Drawer/dialog titles |
| H3 | 16px | 600 | 1.4 | 0 | Section headings |
| H4 | 14px | 600 | 1.4 | 0 | Group labels |
| Body | 13px | 400 | 1.55 | 0 | Default UI text |
| Small | 12px | 500 | 1.4 | 0.01em | Labels, metadata |
| Eyebrow | 12px | 600 | 1.3 | 0.04em | Uppercase section eyebrows |
| Nano | 11px | 700 | 1.2 | 0.03em | Pills, tags (often uppercase) |
| Code | 0.9em | 400 | 1.5 | 0 | Inline `code` |

---

## 4. Component Stylings

All components read from tokens. The "Design Refresh" block refines these surfaces; here are the canonical target values.

### Buttons
```css
.button {
  border-radius: var(--radius-sm);            /* 9px */
  padding: 9px 14px; font-size: 13px; font-weight: 600;
  border: 1px solid var(--border-strong); background: var(--surface); color: var(--text);
  transition: background .18s var(--ease), box-shadow .18s var(--ease), transform .12s var(--ease);
}
.button.primary { background: linear-gradient(180deg, var(--accent), var(--accent-hover)); color: #fff; border-color: transparent; box-shadow: 0 6px 16px rgba(21,146,95,.28); }
.button.secondary { background: var(--surface); border-color: var(--border); }
.button.secondary:hover { background: var(--surface-2); }
.button.danger { background: var(--danger); color: #fff; }
.button.danger:hover { filter: brightness(.95); }
.button:active { transform: translateY(1px); }
.button.full { width: 100%; }
.button.compact { padding: 7px 11px; font-size: 12px; }

.icon-button {
  width: 36px; height: 36px; border-radius: var(--radius-sm);
  border: 1px solid var(--border); background: var(--surface); color: var(--muted);
}
.icon-button:hover { background: var(--surface-2); color: var(--text); }
```

### Cards
```css
.stat-card, .issue-card {
  background: var(--surface); border: 1px solid var(--border);
  border-radius: var(--radius-lg);            /* 16px */
  box-shadow: var(--shadow-xs);
  transition: box-shadow .22s var(--ease), transform .22s var(--ease), border-color .22s var(--ease);
}
.stat-card { padding: 18px 20px; }
.issue-card { padding: 14px 16px; }
.stat-card:hover, .issue-card:hover { box-shadow: var(--shadow-sm); transform: translateY(-2px); border-color: var(--border-strong); }
.stat-card strong { font-size: 30px; font-weight: 700; color: var(--accent-text); font-variant-numeric: tabular-nums; }
```

### Inputs / Selects
```css
input, select, textarea { border-radius: var(--radius-sm); }
select, input[type="text"], input[type="number"] {
  border: 1px solid var(--border); background: var(--surface); color: var(--text);
}
select:focus, input:focus, textarea:focus { border-color: var(--accent); box-shadow: var(--ring); outline: none; }
```

### Navigation (sidebar)
```css
.nav-item { border-radius: var(--radius); padding: 11px 12px; color: var(--muted); }
.nav-item:hover { background: var(--surface-2); color: var(--text); }
.nav-item.active {
  background: linear-gradient(180deg, var(--accent), var(--accent-hover));
  color: #fff; box-shadow: 0 8px 20px rgba(21,146,95,.30);
}
.brand-mark {
  background: linear-gradient(135deg, var(--accent), #0e7a4f);
  color: #fff; box-shadow: 0 6px 16px rgba(21,146,95,.35);
}
```

### Badges / Pills
```css
.severity { border-radius: var(--radius-pill); padding: 3px 9px; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: .03em; }
.severity.high { background: var(--danger-soft); color: var(--danger-text); }
.severity.med { background: var(--warning-soft); color: var(--warning-text); }
.severity.low { background: var(--info-soft); color: var(--info-text); }
.severity.info { background: var(--accent-soft); color: var(--accent-text); }
.tag-list span { background: var(--surface-2); border: 1px solid var(--border); border-radius: var(--radius-pill); padding: 3px 10px; font-size: 11px; color: var(--muted); }
```

### Modals / Drawers / Dialogs
```css
.onboarding-card, .compare-dialog { border-radius: var(--radius-xl); box-shadow: var(--shadow-xl); }
.drawer { border-radius: var(--radius-xl) 0 0 var(--radius-xl); box-shadow: var(--shadow-xl); }
.modal-backdrop { background: color-mix(in srgb, var(--bg) 80%, transparent); backdrop-filter: blur(14px); }
```

### Inline notices
```css
.inline-notice { border-radius: var(--radius); box-shadow: var(--shadow-xs); border: 1px solid transparent; }
.inline-notice.danger { background: var(--danger-soft); color: var(--danger-text); border-color: color-mix(in srgb, var(--danger) 22%, transparent); }
.inline-notice.warning { background: var(--warning-soft); color: var(--warning-text); border-color: color-mix(in srgb, var(--warning) 22%, transparent); }
.inline-notice.info { background: var(--info-soft); color: var(--info-text); border-color: color-mix(in srgb, var(--info) 22%, transparent); }
```

---

## 5. Layout Principles

- **Spacing system** — 4px base. Scale: `4 / 8 / 12 / 16 / 20 / 24 / 32 / 40 / 48 / 64` px → `--space-1 … --space-16`. Use the scale, not ad-hoc values.
- **Grid** — App shell is a fixed sidebar (`248px`) + fluid main area (`minmax(0,1fr)`). Content uses responsive auto grids (e.g. stat grid `repeat(auto-fit, minmax(180px,1fr))`, overview grids collapse to 1 column under `1050px`).
- **Container** — Main content padding: `clamp(24px, 4vw, 56px)` horizontal; vertical section rhythm `24–32px`.
- **Section spacing** — `24px` between major blocks; `16px` between cards in a grid.
- **Whitespace philosophy** — Diagnostics is dense, but each card earns its padding (`14–20px`). Hairline borders separate regions; shadows are reserved for elevation on hover/overlay, never decoration.

---

## 6. Depth & Elevation

- **Shadow scale** (light):
```css
--shadow-xs: 0 1px 2px rgba(20,40,30,.06);
--shadow-sm: 0 2px 8px rgba(20,40,30,.07);
--shadow-md: 0 8px 24px rgba(20,40,30,.09);
--shadow-lg: 0 16px 48px rgba(20,40,30,.10);   /* default --shadow */
--shadow-xl: 0 28px 70px rgba(20,40,30,.14);
```
Dark theme uses the same geometry with `rgba(0,0,0,…)` up to `.6`.
- **Surface layers** — `bg → surface → surface-2 → surface-3 → overlay (drawer/modal)`. Each step is one border + one shadow lighter/darker.
- **Z-index scale** — `sidebar 5` · `topbar 4` · `nav-count auto` · `onboarding/modal/drawer 60` · `help-tip popover 5`.
- **Backdrop** — Topbar and modal backdrops use `backdrop-filter: blur(14–16px)` over a translucent `--bg`.

---

## 7. Do's and Don'ts

**Do's**
1. Drive every color, radius, shadow, and space from a CSS variable — never hard-code hex in component JSX.
2. Use *one* accent (clinical green). Reserve red/amber/blue strictly for severity semantics.
3. Keep stat numbers in `tabular-nums` and the accent color so dashboards align and feel "instrument-like".
4. Prefer hairline borders + one elevation on hover; do not stack heavy shadows on resting cards.
5. Honor `prefers-reduced-motion` — the global rule already neutralizes animations.
6. Keep focus-visible rings (`--ring`) on every interactive element for accessibility.
7. Test both `light` and `dark` (toggle in the topbar) before shipping a component.

**Don'ts**
1. Don't introduce a second brand hue (no purple/blue branding) — it dilutes the clinical metaphor.
2. Don't use pure black backgrounds in dark mode; use the deep forest-ink `--bg`.
3. Don't set `display/grid/position/height/padding` on `.sidebar`, `.topbar`, `.nav-item`, `.button` inside the global refresh block — those are owned by the responsive media queries (≤760px, ≤1050px). Scope overrides to `@media (min-width:761px)`.
4. Don't animate layout properties (width/height/transform on scroll containers) — only opacity/transform on entrances.
5. Don't put body text in the accent color; accent is for actions, active states, and the hero stat only.
6. Don't break the 4px spacing grid with odd paddings like `13px`/`17px`.

---

## 8. Responsive Behavior

- **Breakpoints** — `mobile ≤760px` · `tablet 761–1050px` · `desktop ≥1051px` · (wide uses fluid `clamp()` maxes).
- **Touch targets** — Minimum `36px` (icon buttons); nav items and taps ≥ `40px` on mobile.
- **Collapse strategy**
  - `≤1050px`: sidebar shrinks to an icon rail (`84px`), labels hidden, overview/manage grids → 1 column, stat grid → 2 columns.
  - `≤760px`: sidebar becomes a fixed bottom tab bar (6 items); topbar stacks vertically; agent tabs scroll horizontally; tables collapse to card rows (hide secondary columns); drawers go full-width.
- **Font scaling** — Type uses fixed px (not vw) so density stays predictable; only container padding uses `clamp()`. Headings keep `-0.02em` tracking at all sizes.

---

## 9. Agent Prompt Guide

### Quick Reference
- Product: AI-agent skill diagnostic dashboard. Metaphor: clinical command center.
- Single accent: clinical emerald (`--accent`). Severity colors only for alerts.
- All visuals are CSS-variable driven in `web/src/styles.css`. Edit tokens there; never hard-code.
- Shell layout (sidebar/topbar/nav) is owned by responsive media queries — scope any visual override of it to `@media (min-width:761px)`.

### Component Prompts (copy-paste for AI agents)
1. "Add a new settings card using `.stat-card` styling: white surface, 16px radius, hairline border, hover lift, with a 30px tabular-num accent value."
2. "Create a danger confirmation button: class `button danger full`, with a `filter: brightness(.95)` hover and a confirm-before-delete flow."
3. "Render a severity pill for issue severity X using `.severity.X` (high/med/low/info) — uppercase, pill radius, soft background."
4. "Build a drawer panel titled 'Resource detail' using `.drawer`, rounded left only (`--radius-xl`), `--shadow-xl`, closing on Escape and backdrop click."
5. "Style an inline alert with `.inline-notice.warning`, soft amber background, 12px radius, hairline border tinted with the warning color."
6. "Add a third agent tab to the `.agent-bar`; active state uses `--accent-soft` fill + inset accent ring."

### Iteration Guide
1. Change a color once in `:root` / `:root[data-theme="dark"]`; verify it cascades everywhere before adding local overrides.
2. When a component looks off, check whether it is missing a token (e.g. forgot `border-radius: var(--radius)`) before writing new CSS.
3. Keep the refresh override block at the *end* of `styles.css` so it wins the cascade; do not interleave with base rules.
4. For dark-mode parity, always define both light and dark values for any new variable.
5. Use `color-mix(in srgb, var(--accent) N%, transparent)` for tints instead of new hex variables.
6. Respect the 4px spacing scale; if you need 5px, you probably mean `var(--space-1)` + 1px border.
7. Hover states: elevate shadow + `translateY(-2px)`, never change layout.
8. New motion must use `--ease` / `--ease-out` and be killed by `prefers-reduced-motion`.
9. Before committing UI, run `npm run build` and `npm run typecheck:ui`; screenshot light + dark + mobile.
10. If a rule must override a responsive property, wrap it in `@media (min-width:761px)` to protect the ≤760px / ≤1050px layouts.
