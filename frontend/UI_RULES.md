# Frontend UI Rules

- Build screens from `tokens -> primitives -> pages`, never directly from one-off spacing and raw colors.
- Page layout uses `Page` as the root primitive. Header, body flow, and top spacing come from the shell contract.
- Use `PageHeader` for page intros. `eyebrow` is optional and should add hierarchy, not filler.
- Use `Stack` for vertical rhythm and `Inline` for horizontal action groups. Avoid page-local flex wrappers when a primitive fits.
- Use `Card` for surfaced sections and `StatusPill` for short state labels.
- Button variants: `primary`, `primary-neutral`, `secondary`, `secondary-neutral`, `ghost`, `danger`.
- `neutral` always means lower visual emphasis, not a different semantic meaning.
- Interactive states stay consistent across primitives: `default`, `hover`, `focus-visible`, `disabled`, plus semantic tones when needed.
- Layout anchors are independent. Sidebar, utility bar, and page content must not derive their position from each other implicitly.
