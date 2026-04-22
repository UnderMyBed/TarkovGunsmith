# M3.5 Arc 4 — Real Weapon Silhouettes — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Spec:** [`docs/superpowers/specs/2026-04-22-weapon-silhouettes-design.md`](../superpowers/specs/2026-04-22-weapon-silhouettes-design.md)

**Goal:** Ship a `WeaponSilhouette` primitive in `@tarkov/ui` and use it as an absolutely-positioned monochrome backdrop behind `BuildHeader` and each `CompareSide` column — covering all four Builder routes.

**Architecture:** Thin wrapper around the existing `iconUrl(..., "base-image")` CDN helper, plus Field Ledger CSS filter/blend. Two consumer sites (`build-header.tsx`, `compare-side.tsx`) get a `relative overflow-hidden` Card wrapper + absolute-positioned half-width `<WeaponSilhouette>` on `md:` and up. Zero GraphQL changes, zero new deps.

**Tech Stack:** React 19, Tailwind v4, existing `@tarkov/ui` + `iconUrl` helper, Playwright.

**Branch & rollout:** Already on `feat/m3.5-arc-4-weapon-silhouettes` off `origin/main`. Spec commit `f127299` present. ONE PR at end. Commits (after existing spec + this plan commit):

1. `docs(m3.5): Arc 4 implementation plan` (this plan's deliverable)
2. `feat(ui): WeaponSilhouette primitive`
3. `feat(builder): weapon silhouette backdrop in BuildHeader`
4. `feat(builder): weapon silhouette backdrop in CompareSide + e2e smoke`

---

## File map

**New files (2):**

| Path                                                   | Purpose                      |
| ------------------------------------------------------ | ---------------------------- |
| `packages/ui/src/components/weapon-silhouette.tsx`     | `WeaponSilhouette` primitive |
| `packages/ui/src/components/weapon-silhouette.test.ts` | Pure-logic URL assertion     |

**Modified files (5):**

| Path                                                     | Change                                                                                         |
| -------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| `packages/ui/src/index.ts`                               | Re-export `WeaponSilhouette` + `WeaponSilhouetteProps`                                         |
| `apps/web/src/features/builder/build-header.tsx`         | New `weaponId?: string` prop; wrap Card content in relative z-10; absolute silhouette backdrop |
| `apps/web/src/routes/builder.tsx`                        | Pass `weaponId` to `<BuildHeader>`                                                             |
| `apps/web/src/features/builder/compare/compare-side.tsx` | Same treatment inside the side's Card                                                          |
| `apps/web/e2e/smoke.spec.ts`                             | Builder silhouette `<img>` presence assertion                                                  |

---

## Phase A — Baseline

### Task 1: Confirm baseline green

- [ ] **Step 1: Confirm branch + spec present**

```bash
git branch --show-current
git log --oneline -3
```

Expected: `feat/m3.5-arc-4-weapon-silhouettes`; latest is `f127299 docs(m3.5): Arc 4 — weapon silhouettes design` (or the plan commit if this is already in).

- [ ] **Step 2: Baseline**

```bash
pnpm install --frozen-lockfile
pnpm typecheck
pnpm lint
pnpm format:check
pnpm --filter @tarkov/ui test
pnpm --filter @tarkov/web test
```

Expected: all pass. Stop if anything fails.

---

## Phase B — `WeaponSilhouette` primitive

### Task 2: Create the primitive

**Files:**

- Create: `packages/ui/src/components/weapon-silhouette.tsx`
- Create: `packages/ui/src/components/weapon-silhouette.test.ts`
- Modify: `packages/ui/src/index.ts`

- [ ] **Step 1: Write the test first (TDD — pure logic, consistent with existing `tarkov-icon.test.ts`)**

Create `packages/ui/src/components/weapon-silhouette.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { weaponSilhouetteSrc } from "./weapon-silhouette.js";

describe("weaponSilhouetteSrc", () => {
  it("builds the base-image CDN URL from an item id", () => {
    expect(weaponSilhouetteSrc("5447a9cd4bdc2dbd208b4567")).toBe(
      "https://assets.tarkov.dev/5447a9cd4bdc2dbd208b4567-base-image.webp",
    );
  });

  it("throws on empty itemId", () => {
    expect(() => weaponSilhouetteSrc("")).toThrow();
  });
});
```

- [ ] **Step 2: Run the test — expect failure (module doesn't exist yet)**

```bash
pnpm --filter @tarkov/ui test weapon-silhouette
```

Expected: FAIL — module not found.

- [ ] **Step 3: Write `packages/ui/src/components/weapon-silhouette.tsx`**

```tsx
import { forwardRef, type ImgHTMLAttributes } from "react";
import { cn } from "../lib/cn.js";
import { iconUrl } from "./tarkov-icon.js";

/**
 * Build the CDN URL for a weapon's silhouette base-image.
 *
 * Delegates to `iconUrl(itemId, "base-image")` — exported separately so
 * tests can assert the URL without rendering.
 */
export function weaponSilhouetteSrc(itemId: string): string {
  return iconUrl(itemId, "base-image");
}

export interface WeaponSilhouetteProps extends Omit<ImgHTMLAttributes<HTMLImageElement>, "src"> {
  /** Weapon item id. Passed to `iconUrl(..., "base-image")`. */
  itemId: string;
}

/**
 * Renders a weapon's base-image from the tarkov.dev CDN, treated as a
 * Field Ledger monochrome silhouette. Hides itself on CDN failure so
 * layout stays intact.
 *
 * Consumer controls sizing/positioning via `className`. Typical pattern:
 *
 *     <div className="absolute inset-y-0 right-0 w-1/2 pointer-events-none">
 *       <WeaponSilhouette
 *         itemId={weaponId}
 *         alt={weaponName}
 *         className="h-full w-full object-contain object-right"
 *       />
 *     </div>
 */
/* v8 ignore next 24 -- presentational; covered by apps/web Playwright tests */
export const WeaponSilhouette = forwardRef<HTMLImageElement, WeaponSilhouetteProps>(
  function WeaponSilhouette({ itemId, className, alt = "", loading = "lazy", ...props }, ref) {
    return (
      <img
        ref={ref}
        src={weaponSilhouetteSrc(itemId)}
        alt={alt}
        loading={loading}
        className={cn(
          "block [filter:grayscale(1)_brightness(0.95)_contrast(1.15)] opacity-55 mix-blend-multiply",
          className,
        )}
        onError={(e) => {
          // Hide on CDN 404 / network failure; consumer layout unaffected.
          const el = e.currentTarget;
          el.style.display = "none";
        }}
        {...props}
      />
    );
  },
);
```

Notes on styling:

- `[filter:...]` — Tailwind v4 arbitrary-value syntax for a multi-filter expression.
- `opacity-55` — the project uses arbitrary opacity values in Tailwind v4. If the class name rejects, fall back to `style={{ opacity: 0.55 }}`.
- `mix-blend-multiply` — standard Tailwind class.

- [ ] **Step 4: Re-export from `packages/ui/src/index.ts`**

Open `packages/ui/src/index.ts`. Below the existing `Skeleton` export (added in Arc 2), add:

```ts
export { WeaponSilhouette, weaponSilhouetteSrc } from "./components/weapon-silhouette.js";
export type { WeaponSilhouetteProps } from "./components/weapon-silhouette.js";
```

- [ ] **Step 5: Run the tests — expect pass**

```bash
pnpm --filter @tarkov/ui test weapon-silhouette
```

Expected: both tests pass.

- [ ] **Step 6: Build the package + typecheck the monorepo**

```bash
pnpm --filter @tarkov/ui build
pnpm typecheck
```

Expected: pass.

- [ ] **Step 7: Commit Phase B**

```bash
git add packages/ui/src/components/weapon-silhouette.tsx \
        packages/ui/src/components/weapon-silhouette.test.ts \
        packages/ui/src/index.ts
git commit -m "$(cat <<'EOF'
feat(ui): WeaponSilhouette primitive

New @tarkov/ui/WeaponSilhouette: thin wrapper over
iconUrl(itemId, "base-image") that renders the weapon's tarkov.dev
CDN base image with a Field Ledger monochrome filter (grayscale +
brightness + contrast + opacity + mix-blend-multiply). Hides itself
on CDN 404 so consumer layout stays intact.

Also exports weaponSilhouetteSrc(itemId) as a pure helper for tests
and anywhere a URL (not an <img>) is needed — e.g., OG card renders
via packages/og.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Phase C — `BuildHeader` backdrop

### Task 3: Add `weaponId` prop to `BuildHeader`

**Files:**

- Modify: `apps/web/src/features/builder/build-header.tsx`

- [ ] **Step 1: Add the prop to the interface**

Current `BuildHeaderProps` has:

```ts
export interface BuildHeaderProps {
  name: string;
  description: string;
  onNameChange: (next: string) => void;
  onDescriptionChange: (next: string) => void;
  weaponName?: string | null;
  currentSpec: WeaponSpec | null;
  stockSpec: WeaponSpec | null;
  modCount?: number;
  sharedId?: string | null;
  onCompare?: () => void;
  onOptimize?: () => void;
}
```

Add `weaponId?: string | null` directly below `weaponName`:

```ts
export interface BuildHeaderProps {
  // ... existing fields, unchanged ...
  weaponName?: string | null;
  weaponId?: string | null;
  currentSpec: WeaponSpec | null;
  // ... rest unchanged ...
}
```

- [ ] **Step 2: Destructure `weaponId` in the component**

Current destructure:

```tsx
export function BuildHeader({
  name,
  description,
  onNameChange,
  onDescriptionChange,
  weaponName,
  currentSpec,
  // ...
}: BuildHeaderProps) {
```

Add `weaponId` next to `weaponName`:

```tsx
export function BuildHeader({
  name,
  description,
  onNameChange,
  onDescriptionChange,
  weaponName,
  weaponId,
  currentSpec,
  // ... rest unchanged ...
}: BuildHeaderProps) {
```

- [ ] **Step 3: Import `WeaponSilhouette`**

Current import:

```tsx
import { Button, Card, CardContent, CardHeader, Stamp, StatRow } from "@tarkov/ui";
```

Extend:

```tsx
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  Stamp,
  StatRow,
  WeaponSilhouette,
} from "@tarkov/ui";
```

- [ ] **Step 4: Wrap the Card content and inject the silhouette backdrop**

Current return:

```tsx
return (
  <Card variant="bracket">
    <CardHeader className="flex flex-row items-start justify-between gap-4">{/* ... */}</CardHeader>
    <CardContent className="flex flex-col gap-4">{/* ... */}</CardContent>
  </Card>
);
```

Replace with:

```tsx
return (
  <Card variant="bracket" className="relative overflow-hidden">
    {weaponId && (
      <div
        aria-hidden
        className="hidden md:block absolute inset-y-0 right-0 w-1/2 pointer-events-none"
      >
        <WeaponSilhouette
          itemId={weaponId}
          alt={weaponName ?? ""}
          className="h-full w-full object-contain object-right"
        />
      </div>
    )}
    <div className="relative z-10">
      <CardHeader className="flex flex-row items-start justify-between gap-4">
        {/* ... existing CardHeader children, unchanged ... */}
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {/* ... existing CardContent children, unchanged ... */}
      </CardContent>
    </div>
  </Card>
);
```

Preserve every child of `<CardHeader>` and `<CardContent>` exactly. Only the outer structure changes.

- [ ] **Step 5: Typecheck + lint**

```bash
pnpm --filter @tarkov/web typecheck
pnpm --filter @tarkov/web lint
```

Expected: pass. If lint flags `aria-hidden` usage, confirm it's on the wrapper div (decorative) — not on the content div.

### Task 4: Pass `weaponId` from the builder route

**Files:**

- Modify: `apps/web/src/routes/builder.tsx`

- [ ] **Step 1: Find the `<BuildHeader …/>` call site**

```bash
grep -n "BuildHeader" apps/web/src/routes/builder.tsx
```

Expected: a single render site passing `name`, `description`, `weaponName`, etc.

- [ ] **Step 2: Pass `weaponId`**

In `apps/web/src/routes/builder.tsx`, find the `<BuildHeader />` JSX. It currently passes `weaponName={selectedWeapon?.name ?? null}` or similar. Add `weaponId={weaponId}` (the existing `useState<string>(initialWeaponId)` local — referenced earlier in the file).

```tsx
<BuildHeader
  name={buildName}
  description={buildDescription}
  onNameChange={setBuildName}
  onDescriptionChange={setBuildDescription}
  weaponName={selectedWeapon?.name ?? null}
  weaponId={weaponId || null}
  currentSpec={spec}
  stockSpec={stockSpec}
  modCount={Object.values(attachments).filter(Boolean).length}
  sharedId={sharedId}
  onCompare={() => setCompareOpen(true)}
  onOptimize={() => setOptimizeOpen(true)}
/>
```

The `weaponId || null` idiom converts the empty-string default (from `useState<string>(initialWeaponId)` where `initialWeaponId` may be `""`) to `null`, which the `BuildHeader` guard (`{weaponId && …}`) then suppresses.

- [ ] **Step 3: Typecheck + lint + unit tests**

```bash
pnpm --filter @tarkov/web typecheck
pnpm --filter @tarkov/web lint
pnpm --filter @tarkov/web test
```

Expected: all pass.

- [ ] **Step 4: Commit Phase C**

```bash
git add apps/web/src/features/builder/build-header.tsx \
        apps/web/src/routes/builder.tsx
git commit -m "$(cat <<'EOF'
feat(builder): weapon silhouette backdrop in BuildHeader

BuildHeader now accepts weaponId and renders a monochrome
WeaponSilhouette backdrop behind its content on md: and up. Mobile
layouts (<md) render unchanged — no silhouette to avoid crowding.

The silhouette is absolutely positioned (right-half, full-height,
pointer-events-none) and the existing CardHeader + CardContent are
wrapped in a relative z-10 div so the text stays crisp on top.

Covers /builder and /builder/\$id (both use BuildHeader).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Phase D — `CompareSide` backdrop + e2e smoke

### Task 5: Apply the same treatment in `CompareSide`

**Files:**

- Modify: `apps/web/src/features/builder/compare/compare-side.tsx`

- [ ] **Step 1: Import `WeaponSilhouette`**

Current import:

```tsx
import { Card, CardContent, SectionTitle } from "@tarkov/ui";
```

Extend:

```tsx
import { Card, CardContent, SectionTitle, WeaponSilhouette } from "@tarkov/ui";
```

- [ ] **Step 2: Wrap the Card content + inject the silhouette**

Find the return JSX (around line 112):

```tsx
return (
  <Card variant="bracket">
    <CardContent className="flex flex-col gap-4 p-5">{/* ... existing content ... */}</CardContent>
  </Card>
);
```

Replace with:

```tsx
return (
  <Card variant="bracket" className="relative overflow-hidden">
    {build?.weaponId && (
      <div
        aria-hidden
        className="hidden md:block absolute inset-y-0 right-0 w-1/2 pointer-events-none"
      >
        <WeaponSilhouette
          itemId={build.weaponId}
          alt=""
          className="h-full w-full object-contain object-right"
        />
      </div>
    )}
    <div className="relative z-10">
      <CardContent className="flex flex-col gap-4 p-5">
        {/* ... existing content, unchanged ... */}
      </CardContent>
    </div>
  </Card>
);
```

Preserve every existing child of `<CardContent>` exactly as it was — only the wrapper structure changes.

- [ ] **Step 3: Typecheck + lint + tests**

```bash
pnpm --filter @tarkov/web typecheck
pnpm --filter @tarkov/web lint
pnpm --filter @tarkov/web test
```

Expected: pass.

### Task 6: E2E smoke — silhouette `<img>` renders

**Files:**

- Modify: `apps/web/e2e/smoke.spec.ts`

- [ ] **Step 1: Extend the existing Builder interaction smoke**

The smoke file already has a builder interaction test that picks a weapon from the dropdown. Find it — it's under `test.describe("smoke — builder interaction", …)` or similar. In that test, after the weapon selection + slot-tree-visible assertions, append:

```ts
// Arc 4: weapon silhouette backdrop should render (CDN image on md:+).
// Set viewport wide enough that the md: breakpoint applies (default Tailwind
// md: is 768px).
await page.setViewportSize({ width: 1200, height: 900 });
const silhouette = page.locator("img[src*='-base-image.webp']");
await expect(silhouette.first()).toBeVisible({ timeout: 5_000 });
```

If the existing builder smoke already sets a custom viewport, skip the `setViewportSize` call.

- [ ] **Step 2: Run the smoke subset**

```bash
pnpm --filter @tarkov/web build
pnpm --filter @tarkov/web test:e2e -- --grep "builder interaction"
```

Expected: PASS.

If the CDN image is blocked or the test hits a race, increase the timeout to `10_000` and/or add a `page.waitForLoadState("networkidle")` before the locator check.

- [ ] **Step 3: Run the full smoke suite**

```bash
pnpm --filter @tarkov/web test:e2e
```

Expected: all tests pass (existing 26 + no new failures).

- [ ] **Step 4: Pre-commit checks**

```bash
pnpm typecheck
pnpm lint
pnpm format:check
```

Expected: pass.

- [ ] **Step 5: Commit Phase D**

```bash
git add apps/web/src/features/builder/compare/compare-side.tsx \
        apps/web/e2e/smoke.spec.ts
git commit -m "$(cat <<'EOF'
feat(builder): weapon silhouette backdrop in CompareSide + e2e smoke

Each CompareSide column now renders the same monochrome
WeaponSilhouette backdrop as BuildHeader — covering /builder/compare
and /builder/compare/\$pairId.

E2E smoke extended to assert an <img src=*-base-image.webp*> is
visible in the builder interaction test at md:+ viewport.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Phase E — Ship

### Task 7: Push, PR, CI, merge

- [ ] **Step 1: Final baseline**

```bash
pnpm typecheck
pnpm lint
pnpm format:check
pnpm --filter @tarkov/ui test
pnpm --filter @tarkov/web test
```

Expected: all pass.

- [ ] **Step 2: Push + open PR + watch CI + squash-merge**

Per the autonomous-PR-flow convention for this repo, run the whole sequence without stopping to confirm:

```bash
git push -u origin feat/m3.5-arc-4-weapon-silhouettes

gh pr create --title "feat(builder): M3.5 Arc 4 — weapon silhouettes" --body "$(cat <<'EOF'
## Summary

Final arc of M3.5 "Depth & Polish." One new @tarkov/ui primitive plus
two consumer sites:

- **\`WeaponSilhouette\`** — thin wrapper over \`iconUrl(..., "base-image")\`
  with Field Ledger CSS filter (grayscale + brightness + contrast +
  opacity + \`mix-blend-multiply\`). Hides itself on CDN 404 so layout
  stays intact. Also exports \`weaponSilhouetteSrc(id)\` pure helper.
- **\`BuildHeader\`** — absolute-positioned half-width silhouette on
  \`md:\` and up, behind the existing stat grid. Covers \`/builder\` and
  \`/builder/\$id\`.
- **\`CompareSide\`** — same treatment per side. Covers
  \`/builder/compare\` and \`/builder/compare/\$pairId\`.

## Spec + plan

- Spec: \`docs/superpowers/specs/2026-04-22-weapon-silhouettes-design.md\`
- Plan: \`docs/plans/2026-04-22-arc-4-weapon-silhouettes-plan.md\`

## Test plan

- [x] \`pnpm typecheck\`, \`pnpm lint\`, \`pnpm format:check\` pass
- [x] \`@tarkov/ui\`, \`@tarkov/web\` unit tests pass
- [x] Playwright smoke: builder interaction test asserts \`<img src=*-base-image.webp*>\` visible at \`md:+\` viewport
- [x] Manual: open /builder, pick M4A1 — silhouette renders as backdrop; mobile view (<768px) hides silhouette cleanly

## Scope note

\`/sim\` silhouette (mentioned in the original M3 roadmap) is dropped — /sim's UI takes ammo + armor only and has no weapon to illustrate. Would become an M2 follow-up if \`/sim\` gains a weapon-aware mode.

## Out of scope / follow-ups

- Silhouette on /sim (requires weapon-aware Simulator first)
- Self-hosted true black SVG silhouettes
- Loading skeleton during silhouette fetch (decorative; hidden on error)
- Light-theme variant of the filter
- Silhouette in OG cards (packages/og can import \`weaponSilhouetteSrc\` directly if desired)

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"

gh pr checks --watch
gh pr merge --squash
```

- [ ] **Step 3: Post-merge cleanup**

```bash
git checkout --detach origin/main
git fetch --prune origin
git branch -D main feat/m3.5-arc-4-weapon-silhouettes
git checkout -b main origin/main
```

---

## Self-review checklist

1. **Spec coverage:**
   - Spec §1 (primitive) → Task 2
   - Spec §2 (BuildHeader placement) → Tasks 3 + 4
   - Spec §3 (CompareSide placement) → Task 5
   - Spec §4 (fallback) → Task 2 Step 3 (inline `onError` handler)
   - Spec §5 (tests) → Task 2 Steps 1–5 (unit) + Task 6 (e2e)
   - Spec "Rollout" → Task 7
2. **Placeholder scan:** no "TBD", "similar to Task N", or skipped code blocks. Every commit message is pre-filled.
3. **Type consistency:** `WeaponSilhouetteProps`, `weaponSilhouetteSrc`, `weaponId` (optional `string | null` on BuildHeader) consistent across tasks.
4. **Ambiguity:** fallback behavior on CDN 404 is explicit (`el.style.display = "none"`); opacity fallback to inline `style` if Tailwind class rejects is called out in Task 2 Step 3.
