# M3.5 Arc 4 — Real Weapon Silhouettes

**Status:** design approved 2026-04-22. Writing-plans is next.

**Context:** Final arc of M3.5 "Depth & Polish." Arcs 0, 1, 2 shipped. Arc 4 adds a monochrome weapon silhouette to the `BuildHeader` (covering `/builder` + `/builder/$id`) and to `CompareSide` (covering `/builder/compare` + `/builder/compare/$pairId`). Treatment is CSS-filter only — no new assets, no new GraphQL fields. The `/sim` placement originally mentioned in the Arc 0 roadmap is dropped: `/sim` takes ammo + armor but has no weapon in its UI model (reality check during this spec's brainstorm).

## Goal

Give the Builder routes a visual anchor — users looking at an M4A1 build should see an M4A1-shaped backdrop, not just a text header. Monochrome filter keeps the aesthetic inside the Field Ledger palette without introducing a photographic color clash.

## Non-goals

- Silhouettes on `/adc`, `/aec`, `/matrix`, `/calc`, `/data`, `/charts` — none of those routes display a weapon.
- Silhouettes on `/sim` — the route doesn't carry a weapon; adding one would be an M2 follow-up (weapon-aware Simulator).
- Self-hosted SVG silhouettes (option C from the scope question). Days of manual art work for ~50 weapons.
- Raw color photos (option A). Clashes with the amber/paper/warm-black palette.
- Animated / interactive / parallax silhouettes.
- Loading skeleton for the weapon image. Silhouette is decorative; it fades in without a placeholder, and on CDN 404 it hides itself (layout unaffected).
- Dark-theme / light-theme variation (light theme still deferred project-wide).

## Design

### 1. `WeaponSilhouette` primitive (`@tarkov/ui`)

**API:**

```tsx
<WeaponSilhouette
  itemId={weapon.id}
  alt={weapon.name}
  className="h-full w-full object-contain object-right"
/>
```

**Behavior:**

- Renders `<img src={iconUrl(itemId, "base-image")} alt={alt} loading="lazy" />`.
- Wraps the `<img>` in a container that applies the Field Ledger monochrome filter:
  ```css
  filter: grayscale(1) brightness(0.95) contrast(1.15);
  opacity: 0.55;
  mix-blend-mode: multiply;
  ```
  The `mix-blend-mode: multiply` over the warm-paper background produces a darker-than-bg amber-tinged silhouette — reads as a backdrop, not a hero.
- On `<img onError>`, container sets `data-silhouette-broken` + `hidden` class — the consumer's layout stays intact; nothing else depends on the image.
- `object-fit: contain` by default so the image never distorts. Consumer passes `className` for sizing + positioning.
- `loading="lazy"` so off-screen silhouettes (e.g. a weapon on `/builder/compare` that isn't yet visible) don't preload.

**API surface:**

```ts
export interface WeaponSilhouetteProps extends ImgHTMLAttributes<HTMLImageElement> {
  itemId: string;
}
```

Extends `ImgHTMLAttributes` so callers can pass `className`, `style`, `alt`, and any standard `<img>` attributes. `src` is not accepted — it's derived from `itemId` + `iconUrl(…, "base-image")`.

### 2. `/builder` placement — backdrop behind `BuildHeader`

In `apps/web/src/features/builder/build-header.tsx`, wrap the existing bracket-card contents in a `relative` container; add an absolutely-positioned `<WeaponSilhouette>` behind the stat grid.

```tsx
<Card variant="bracket" className="relative overflow-hidden">
  <div className="hidden md:block absolute right-0 top-0 bottom-0 w-1/2 pointer-events-none">
    <WeaponSilhouette
      itemId={weaponId}
      alt={weaponName}
      className="h-full w-full object-contain object-right"
    />
  </div>
  <div className="relative z-10">{/* existing title + StatRow grid — unchanged */}</div>
</Card>
```

- **Right-aligned, half-width** on `md:` and up; hidden on narrow screens so mobile layouts don't crowd. The existing header grid takes the full width on mobile; the silhouette adds nothing there.
- **`pointer-events-none`** so the silhouette never intercepts clicks meant for the header buttons.
- **`relative z-10`** on the content wrapper ensures the header text stays crisp on top.
- **`overflow-hidden`** on the Card prevents the silhouette from poking past the bracket corners.

### 3. `/builder/compare` placement — `CompareSide`

`apps/web/src/features/builder/compare/compare-side.tsx` — each side renders its own `<Card variant="bracket">` header analogue. Apply the same treatment as `BuildHeader`: `relative overflow-hidden` wrapper, absolutely-positioned half-width silhouette on `md:` and up.

When both sides render a silhouette, the compare workspace carries two backdrops — one per side. Visual effect works because the compare layout is already side-by-side with sizable per-side columns.

### 4. Fallback behavior

- **CDN 404 / network failure:** `<img onError>` hides the container. No substitute image, no loading spinner. The existing Card layout continues to render normally.
- **Empty `itemId`:** the primitive throws via the existing `iconUrl()` guard (`if (!itemId) throw new Error("iconUrl: itemId is required")`). Consumers that might pass an empty id guard beforehand.

### 5. Testing

**Unit (`@tarkov/ui`):**

- `packages/ui/src/components/weapon-silhouette.test.tsx` — render `<WeaponSilhouette itemId="abc123" alt="Test Weapon" />` and assert:
  1. The rendered `<img>` has the expected `src` (`https://assets.tarkov.dev/abc123-base-image.webp`).
  2. `alt` passes through.
  3. `itemId` not accepted as a prop when required.

  (Note: @tarkov/ui has no RTL today. The existing `tarkov-icon.test.ts` is a pure-logic test of `iconUrl(...)`; add a similar pure-logic test here that calls through to `iconUrl(..., "base-image")`. Skip any DOM-rendering assertion.)

**E2E (`apps/web/e2e/smoke.spec.ts`):**

- Extend the existing builder smoke: after picking a weapon, assert an `<img>` with a `src` containing `-base-image.webp` is present and not `display: none`.

No visual-regression tests.

## Architecture

```
Tarkov Gunsmith Arc 4
    │
    └─ packages/ui/src/components
        └─ weapon-silhouette.tsx           ← NEW (thin wrapper over iconUrl + CSS filter)

    apps/web/src/features/builder
    ├─ build-header.tsx                    ← wrap content in relative/z-10, add absolute silhouette
    └─ compare/compare-side.tsx             ← same treatment
```

Zero GraphQL changes. Zero new deps. Zero changes to `itemAvailability()` or the build schema.

## File map

**New files (2):**

| Path                                                   | Purpose                      |
| ------------------------------------------------------ | ---------------------------- |
| `packages/ui/src/components/weapon-silhouette.tsx`     | `WeaponSilhouette` primitive |
| `packages/ui/src/components/weapon-silhouette.test.ts` | Pure-logic URL assertion     |

**Modified files (4):**

| Path                                                     | Change                                                 |
| -------------------------------------------------------- | ------------------------------------------------------ |
| `packages/ui/src/index.ts`                               | Re-export `WeaponSilhouette` + `WeaponSilhouetteProps` |
| `apps/web/src/features/builder/build-header.tsx`         | Absolute-positioned silhouette behind header content   |
| `apps/web/src/features/builder/compare/compare-side.tsx` | Same treatment per side                                |
| `apps/web/e2e/smoke.spec.ts`                             | Assert silhouette `<img>` renders in the builder smoke |

## Rollout

One PR on `feat/m3.5-arc-4-weapon-silhouettes`. Three commits:

1. `feat(ui): WeaponSilhouette primitive`
2. `feat(builder): weapon silhouette backdrop in BuildHeader`
3. `feat(builder): weapon silhouette backdrop in CompareSide` (combined with the e2e smoke update)

Squash-merge. `feat(ui):` + `feat(builder):` drive a minor bump under release-please.

## Risks & open questions

- **CDN asset variability.** Not every item id guarantees a `-base-image.webp`. Smoke test picks a weapon known to exist; manual verification across a handful of weapons during plan execution confirms the fallback path kicks in cleanly when an asset is missing.
- **`mix-blend-mode: multiply` readability.** On the darker `<Card variant="bracket">` background the multiply-blend may wash the silhouette out. If it does, fall back to a no-blend `filter: grayscale(1) brightness(0.55) opacity(0.65)` approach. Plan's visual verification step catches this before commit.
- **Mobile crowding.** Silhouette is hidden below `md:` (768px Tailwind default). If the Builder header reflows badly on ~768–900px widths with the silhouette in place, tighten the breakpoint to `lg:`.
- **Compare workspace dual silhouettes.** Two big silhouettes side-by-side might be too much visual noise. Manual smoke of `/builder/compare` seeded with two builds validates the feel.

## Follow-ups outside this arc

- Silhouettes on `/sim` if the Simulator gains a weapon model (M2 follow-up).
- Full OG-card-style silhouette rendering for the share-card PNGs (tiny extension once this primitive exists — just import from `@tarkov/ui` in `packages/og`).
- A `mobile-width silhouette strip` (short + wide landscape crop at the top of the Builder card on narrow screens). Deferred unless users ask for it.
- Light-theme variant of the filter (different opacity/blend for a paper-white bg). Pairs with the deferred light theme.
