# Builder-focus nav + WIP banners — design

**Status:** approved 2026-04-21
**Scope:** one small PR. No schema changes. No route moves.

## 1. Goal

Shift emphasis on the top nav to the flagship `/builder`, and mark the other 7 routes as work-in-progress. The other routes remain fully functional and reachable — just tucked under two nav dropdowns (`Calc ▾`, `Data ▾`) instead of filling the top bar.

Also remove the two tool-card grids from the landing page — they reach the same routes the dropdowns now cover, and the landing space is reserved for something else later.

## 2. Scope

In scope:

- Replace the flat 8-item top nav in `apps/web/src/routes/__root.tsx` with: `Builder` (flat `<Link>`) + `Calc ▾` (dropdown) + `Data ▾` (dropdown).
- New primitive `apps/web/src/features/nav/nav-dropdown.tsx` — click-to-open popover with `useState` + outside-click + Escape handlers. No Radix dep.
- New primitive `apps/web/src/features/nav/wip-banner.tsx` — persistent status banner placed at the top of each WIP route's content.
- Apply `<WipBanner />` to 7 routes: `/calc`, `/matrix`, `/sim`, `/adc`, `/aec`, `/data`, `/charts`.
- Delete the tool-card grids from `apps/web/src/routes/index.tsx`: remove `BALLISTICS_CARDS` + `DATA_CARDS` const arrays, the two `<SectionTitle>` headers, the two `<section>` grids, and unused helpers (`ToolCardView`, `ToolCard` type) if they become unreachable after the removal.
- Playwright: two new smoke assertions (dropdown open + navigate, WIP banner visible on one route).

Non-goals:

- Reworking route trees or changing any URL. `/calc` etc. still work, they just don't appear as top-level nav items.
- Filling the space freed on the landing — that's a separate follow-up.
- Hover-triggered dropdowns (hostile to touch + keyboard users).
- A mobile hamburger menu. The existing `flex-wrap` on the header stacks cleanly on narrow viewports; dropdowns inherit that behavior.
- Dismissible / cookie-gated WIP banners. The banner is a status marker; re-visiting the route shows it again by design.
- Unit tests on the two new primitives. NavDropdown is `useState` + outside-click + `<Link>` children; WipBanner is presentational. Playwright covers both.
- Analytics on dropdown open.

## 3. Nav dropdown UX

**Trigger** — a `<button>` styled like today's nav links (Azeret Mono 11px, letter-spacing 0.18em, uppercase, `var(--color-muted-foreground)` default, amber on hover / when the open menu contains the active route). Adds a `▾` caret that rotates 180° on open.

**Open state** — absolute-positioned panel directly below the trigger:

- Background `var(--color-card)`, 1px border `var(--color-border)`, 3px amber top border (matches the WipBanner / OG sync-banner vibe).
- Stacked vertical link list, 4–6 items, 4–6px vertical padding per item.
- Active-route link inside the menu uses the same amber treatment as the flat nav's `activeProps`.

**Close triggers** — Escape key, click outside the menu (document-level listener), click on any link inside (navigation implies dismiss), or click on the trigger itself while open (standard toggle).

**A11y** —

- Trigger: `aria-expanded={open}`, `aria-haspopup="menu"`.
- Menu: `role="menu"`; each `<Link>` wrapped in an element with `role="menuitem"` or the equivalent ARIA attributes.
- Focus: clicking the trigger opens without moving focus; first `Tab` after open lands on the first menuitem; Escape returns focus to the trigger.
- No arrow-key roving focus. Tab order is sufficient for 3–4 items.

**Mobile** — current `flex-wrap` header behavior unchanged. If two triggers wrap to their own row on narrow screens, their open panels still position relative to the trigger. No media queries needed.

## 4. Nav content

After the rewrite, `NAV_ITEMS` in `__root.tsx` becomes:

```ts
const NAV_ITEMS: ReadonlyArray<NavItem> = [
  { kind: "link", to: "/builder", label: "Builder" },
  {
    kind: "dropdown",
    label: "Calc",
    items: [
      { to: "/calc", label: "Calc" },
      { to: "/sim", label: "Simulator" },
      { to: "/adc", label: "Armor Damage" },
      { to: "/aec", label: "Armor Effectiveness" },
    ],
  },
  {
    kind: "dropdown",
    label: "Data",
    items: [
      { to: "/matrix", label: "Ammo × Armor Matrix" },
      { to: "/data", label: "Datasheets" },
      { to: "/charts", label: "Charts" },
    ],
  },
];
```

Groupings mirror the existing landing grids:

- **Calc**: `/calc`, `/sim`, `/adc`, `/aec` — the four ballistics calculators.
- **Data**: `/matrix`, `/data`, `/charts` — reference + browsing surfaces.

Matrix stays under Data (its home on the current landing), not Calc, so the nav groupings match the user's already-shipped editorial intent.

Inside dropdown items we use the long, descriptive labels (`Simulator`, `Armor Damage`, `Datasheets`, etc.) — the acronyms work at the top-nav level where space is tight, but the dropdown gives us room.

## 5. WIP banner

**Component:**

```tsx
// apps/web/src/features/nav/wip-banner.tsx
import type { ReactElement } from "react";
import { Link } from "@tanstack/react-router";

export function WipBanner(): ReactElement {
  return (
    <div className="mb-6 flex items-baseline gap-3 border border-[var(--color-border)] border-l-[3px] border-l-[var(--color-primary)] bg-[var(--color-card)] px-4 py-2.5">
      <span className="font-mono text-[11px] uppercase tracking-[0.15em] text-[var(--color-primary)]">
        ▲ WIP
      </span>
      <span className="text-sm text-[var(--color-muted-foreground)]">
        Subject to change or removal. Focus is on the{" "}
        <Link
          to="/builder"
          className="text-[var(--color-foreground)] underline decoration-[var(--color-primary)] underline-offset-2"
        >
          Builder
        </Link>
        .
      </span>
    </div>
  );
}
```

**Placement** — first child of each affected route's root element:

- `apps/web/src/routes/calc.tsx`
- `apps/web/src/routes/matrix.tsx`
- `apps/web/src/routes/sim.tsx`
- `apps/web/src/routes/adc.tsx`
- `apps/web/src/routes/aec.tsx`
- `apps/web/src/routes/data.tsx`
- `apps/web/src/routes/charts.tsx`

One import + one JSX line per file.

**Not dismissible.** Status marker, not prompt. Re-visits show it again intentionally.

## 6. Landing page cleanup

`apps/web/src/routes/index.tsx` loses:

- The `BALLISTICS_CARDS` + `DATA_CARDS` const arrays (~10 entries, ~40 lines).
- The two `<SectionTitle>` headers: `BALLISTICS TOOLS` and `REFERENCE + DATA`.
- The two `<section className="grid ...">` blocks that render them.
- `ToolCardView` component + `ToolCard` type if no longer referenced (verify at implementation time; they were only used here).

Keeps:

- The hero section with its sample M4A1 build + stats.
- All page-level plumbing (route registration, layout wrapper, imports that are still used by the hero).

The space below the hero becomes empty — deliberate. A future PR will fill it.

## 7. Testing

Extend `apps/web/e2e/smoke.spec.ts`:

1. **Dropdown smoke.** Visit `/`, click the `Calc` nav trigger, assert a menu appears with a `Simulator` link, click it, assert the URL becomes `/sim`.
2. **WIP banner visible.** Visit `/calc`, assert `getByText(/Subject to change or removal/)` is visible. One representative route — the other 6 are mechanically identical adds.

No unit tests. NavDropdown has no extractable logic; WipBanner is presentational. Playwright covers both.

Update the existing `ROUTES` smoke check only if it clicks nav links to navigate. Today it uses `page.goto()` directly, so no updates needed.

## 8. Rollout

One PR — `feat/m3-builder-focus-nav` off `origin/main`. Commit groups:

1. `feat(web): NavDropdown primitive + Calc / Data dropdowns in top nav`
2. `feat(web): WipBanner primitive + add to 7 WIP routes`
3. `feat(web): remove tool-card grids from landing — Builder focus`
4. `test(web): Playwright smoke — dropdown open + WIP banner visible`

Merge → release-please opens v1.11.0 → user promotes when ready.

## 9. References

- Current nav: `apps/web/src/routes/__root.tsx` (lines 7–16 for `NAV_ITEMS`).
- Current landing grids: `apps/web/src/routes/index.tsx` (lines ~24–68 for the card arrays, ~150–166 for the rendered sections).
- Field Ledger tokens (WipBanner colors): `packages/ui/src/styles/index.css`.
- Precedent for the amber-left-border pattern: `apps/web/src/features/builder/tarkovtracker-sync-banner.tsx` (Shell helper in the OG session).
