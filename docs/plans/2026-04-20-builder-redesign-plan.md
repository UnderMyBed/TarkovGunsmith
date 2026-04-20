# Frontend Pass PR 3 — Builder Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development.

**Goal:** Restyle `/builder` in the Field Ledger aesthetic — the flagship route of the redesign. Keep all behavior; change only visual surface.

**Architecture:** Rewrite `BuildHeader` to use `StatRow` + `Stamp` + Bungee weapon name. Restyle `SlotTree` rows with tick markers, mono uppercase slot names, and `Pill` for availability. Leave `ProfileEditor`, `OrphanedBanner`, `PresetPicker` component behavior intact; touch their surface styles only where needed. Touch `builder.tsx` / `builder.$id.tsx` only to wire the restyled header and rearrange any whitespace.

---

## Reference

- **Umbrella spec:** `docs/superpowers/specs/2026-04-20-frontend-design-pass-design.md`.
- **Mood board:** `docs/design/mood-board.html` — especially §01 (Builder panel) and the hero right column (stat grid).
- **PR 1 shipped:** `Pill`, `Stamp`, `StatRow`, `SectionTitle`, updated `Card`/`Button`/`Input`, Field Ledger tokens + fonts.
- **PR 2 shipped:** new `__root.tsx` nav; `index.tsx` landing.
- **Existing components:** `apps/web/src/features/builder/build-header.tsx` (name/desc inputs + Delta stats), `apps/web/src/features/builder/slot-tree.tsx` (`<details>`-based collapsibles, availability-aware).

## Scope decisions

1. **Do NOT change component APIs.** `BuildHeader` keeps the same prop shape; `SlotTree` keeps the same prop shape. Only internal JSX + class names change. This limits blast radius and keeps `builder.tsx` untouched.
2. **Use `StatRow` from `@tarkov/ui`** for the 4 stat rows in `BuildHeader`. Old `Delta` helper removed; StatRow handles stock/delta/current/bar.
3. **Slot rows:** drop the card-with-details look; use per-row div with dashed bottom border, ▸/▾ tick, mono uppercase slot label, item name in paper, availability `Pill` on the right. Keep `<details>` for native collapsibility so a11y + keyboard nav stays; restyle `summary` and the expanded list.
4. **Weapon name rendered in Bungee.** When a weapon is selected, show its short name in display font above the stat grid. When no weapon, show a muted "NO WEAPON SELECTED" label.
5. **`PresetPicker` / `OrphanedBanner` / `ProfileEditor`** — left alone at component level; they inherit new token colors + primitives automatically. If their surfaces look rough after the re-skin, that's a future polish PR.
6. **No new primitives.** If something's missing, it's out of scope.

## File map

```
apps/web/src/features/builder/
├── build-header.tsx                   REWRITTEN — Bungee + StatRow + Stamp
└── slot-tree.tsx                      REWRITTEN — tick rows + pills

# Unchanged (inherit new styles via tokens):
├── orphaned-banner.tsx
├── preset-picker.tsx
└── profile-editor.tsx

apps/web/src/routes/
├── builder.tsx                        LIGHT TOUCH — small layout tweaks only if needed
└── builder.$id.tsx                    unchanged
```

---

## Task 0: Worktree + baseline

```bash
cd /mnt/c/Users/Matt/Source/TarkovGunsmith
git fetch origin
git worktree add .worktrees/builder-redesign -b feat/builder-redesign origin/main
cd .worktrees/builder-redesign
pnpm install --frozen-lockfile
pnpm --filter "./packages/*" build
pnpm --filter @tarkov/web typecheck && pnpm --filter @tarkov/web lint && pnpm --filter @tarkov/web test
```

Expected: all green.

---

## Task 1: Rewrite `BuildHeader`

**Files:**

- Rewrite: `apps/web/src/features/builder/build-header.tsx`

- [ ] **Step 1: Replace the file.**

```tsx
import type { WeaponSpec } from "@tarkov/ballistics";
import { Card, CardContent, CardHeader, Stamp, StatRow } from "@tarkov/ui";

export interface BuildHeaderProps {
  name: string;
  description: string;
  onNameChange: (next: string) => void;
  onDescriptionChange: (next: string) => void;
  /** Weapon short name, or null if no weapon selected. */
  weaponName?: string | null;
  /** Current build spec (weapon + current mods). */
  currentSpec: WeaponSpec | null;
  /** Stock-weapon spec (no mods). Used to compute deltas. */
  stockSpec: WeaponSpec | null;
  /** Mod count, for the meta line. */
  modCount?: number;
  /** Truthy when the build has been saved and has a share URL. */
  sharedId?: string | null;
}

export function BuildHeader({
  name,
  description,
  onNameChange,
  onDescriptionChange,
  weaponName,
  currentSpec,
  stockSpec,
  modCount,
  sharedId,
}: BuildHeaderProps) {
  return (
    <Card variant="bracket">
      <CardHeader className="flex flex-row items-start justify-between gap-4">
        <div className="flex flex-col gap-2 flex-1 min-w-0">
          <div className="font-display text-xl sm:text-2xl leading-none tracking-wide uppercase text-[var(--color-foreground)]">
            {weaponName ?? "NO WEAPON SELECTED"}
          </div>
          <div className="font-mono text-[10px] tracking-[0.2em] uppercase text-[var(--color-paper-dim)]">
            {typeof modCount === "number"
              ? `${modCount} MOD${modCount === 1 ? "" : "S"}`
              : "— MODS"}
            {sharedId ? ` · BUILD · ${sharedId.slice(0, 8)}` : ""}
          </div>
        </div>
        {sharedId && <Stamp tone="amber">SHARED</Stamp>}
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <input
          type="text"
          value={name}
          maxLength={60}
          onChange={(e) => onNameChange(e.target.value)}
          placeholder="Build name (optional)"
          className="bg-transparent font-sans text-lg font-bold tracking-tight text-[var(--color-foreground)] outline-none placeholder:text-[var(--color-paper-dim)] focus:outline-none border-b border-transparent focus:border-[var(--color-primary)] pb-1 transition-colors"
        />
        <textarea
          value={description}
          maxLength={280}
          onChange={(e) => onDescriptionChange(e.target.value)}
          placeholder="Description (optional)"
          rows={2}
          className="resize-none bg-transparent text-sm text-[var(--color-muted-foreground)] outline-none placeholder:text-[var(--color-paper-dim)] focus:outline-none"
        />

        {currentSpec && stockSpec && (
          <div className="flex flex-col gap-2 border-t border-dashed border-[var(--color-border)] pt-4">
            <StatRow
              label="ERGONOMICS"
              stock={stockSpec.ergonomics}
              delta={formatDelta(currentSpec.ergonomics - stockSpec.ergonomics, false)}
              deltaDirection={deltaDirection(currentSpec.ergonomics - stockSpec.ergonomics, false)}
              value={currentSpec.ergonomics}
              percent={clampPercent(currentSpec.ergonomics)}
              barTone="primary"
            />
            <StatRow
              label="RECOIL V"
              stock={stockSpec.verticalRecoil}
              delta={formatPercent(currentSpec.verticalRecoil, stockSpec.verticalRecoil)}
              deltaDirection={deltaDirection(
                currentSpec.verticalRecoil - stockSpec.verticalRecoil,
                true,
              )}
              value={currentSpec.verticalRecoil}
              percent={clampInverse(currentSpec.verticalRecoil, stockSpec.verticalRecoil)}
              barTone="olive"
            />
            <StatRow
              label="RECOIL H"
              stock={stockSpec.horizontalRecoil}
              delta={formatPercent(currentSpec.horizontalRecoil, stockSpec.horizontalRecoil)}
              deltaDirection={deltaDirection(
                currentSpec.horizontalRecoil - stockSpec.horizontalRecoil,
                true,
              )}
              value={currentSpec.horizontalRecoil}
              percent={clampInverse(currentSpec.horizontalRecoil, stockSpec.horizontalRecoil)}
              barTone="olive"
            />
            <StatRow
              label="WEIGHT"
              stock={stockSpec.weight.toFixed(2)}
              delta={formatDelta(currentSpec.weight - stockSpec.weight, true)}
              deltaDirection={deltaDirection(currentSpec.weight - stockSpec.weight, true)}
              value={currentSpec.weight.toFixed(2)}
              percent={clampPercent(currentSpec.weight * 20)}
              barTone={currentSpec.weight > stockSpec.weight ? "destructive" : "primary"}
            />
            <StatRow
              label="ACCURACY"
              stock={stockSpec.accuracy.toFixed(1)}
              delta={formatDelta(currentSpec.accuracy - stockSpec.accuracy, true)}
              deltaDirection={deltaDirection(currentSpec.accuracy - stockSpec.accuracy, true)}
              value={currentSpec.accuracy.toFixed(1)}
              percent={100 - clampPercent(currentSpec.accuracy * 20)}
              barTone="primary"
            />
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function formatDelta(delta: number, allowDecimals: boolean): string {
  if (Math.abs(delta) < 0.005) return "";
  const rounded = allowDecimals ? delta.toFixed(2) : String(Math.round(delta));
  return delta > 0 ? `+${rounded}` : rounded;
}

function formatPercent(current: number, stock: number): string {
  if (stock === 0) return "";
  const pct = ((current - stock) / stock) * 100;
  if (Math.abs(pct) < 0.5) return "";
  const sign = pct > 0 ? "+" : "−";
  return `${sign}${Math.abs(pct).toFixed(0)}%`;
}

function deltaDirection(delta: number, higherIsWorse: boolean): "up" | "down" | "neutral" {
  if (Math.abs(delta) < 0.005) return "neutral";
  const improved = higherIsWorse ? delta < 0 : delta > 0;
  return improved ? "up" : "down";
}

function clampPercent(v: number): number {
  return Math.max(0, Math.min(100, v));
}

function clampInverse(current: number, stock: number): number {
  if (stock === 0) return 0;
  // current lower than stock → higher bar (good for "less recoil")
  const pct = 100 - (current / stock) * 100;
  return Math.max(0, Math.min(100, pct + 50));
}
```

Note the props expand (`weaponName`, `modCount`, `sharedId` all optional). Routes calling BuildHeader don't break because new props are optional.

- [ ] **Step 2: Verify typecheck.**

```bash
pnpm --filter @tarkov/web typecheck
```

If the route's call site doesn't provide the new optional props, it still compiles. Expected.

- [ ] **Step 3: Commit.**

```bash
git add apps/web/src/features/builder/build-header.tsx
git commit -m "feat(builder): Field Ledger BuildHeader — Bungee name + StatRow grid + Stamp"
```

---

## Task 2: Wire new `BuildHeader` props in `builder.tsx`

**Files:**

- Modify: `apps/web/src/routes/builder.tsx`

The `BuildHeader` now takes optional `weaponName`, `modCount`, `sharedId`. Wire them from existing state so the header renders the full treatment.

- [ ] **Step 1: Find the `<BuildHeader ...>` call in `builder.tsx`** and add the new props. Don't change anything else. The call likely looks like:

```tsx
<BuildHeader
  name={buildName}
  description={buildDescription}
  onNameChange={setBuildName}
  onDescriptionChange={setBuildDescription}
  currentSpec={currentSpec}
  stockSpec={stockSpec}
/>
```

Change to:

```tsx
<BuildHeader
  name={buildName}
  description={buildDescription}
  onNameChange={setBuildName}
  onDescriptionChange={setBuildDescription}
  currentSpec={currentSpec}
  stockSpec={stockSpec}
  weaponName={selectedWeapon?.shortName ?? selectedWeapon?.name ?? null}
  modCount={Object.keys(attachments).length}
  sharedId={shareUrl?.split("/").pop() ?? null}
/>
```

Adapt variable names to what's actually defined in the file (e.g., if the selected weapon variable is `weapon` not `selectedWeapon`, use that). If `shareUrl` doesn't exist, pass `null`. Do not invent new state.

- [ ] **Step 2: Typecheck.**

```bash
pnpm --filter @tarkov/web typecheck
```

- [ ] **Step 3: Commit.**

```bash
git add apps/web/src/routes/builder.tsx
git commit -m "feat(builder): pass weaponName + modCount + sharedId to BuildHeader"
```

---

## Task 3: Restyle `SlotTree`

**Files:**

- Rewrite: `apps/web/src/features/builder/slot-tree.tsx`

Keep the component signature + behavior. Restyle the markup with Field Ledger visual grammar.

- [ ] **Step 1: Read the current file end-to-end so you understand what behavior must be preserved** (expand/collapse, availability dim, requirement label, item selection by click, etc.).

```bash
cat apps/web/src/features/builder/slot-tree.tsx
```

- [ ] **Step 2: Rewrite the file.** Preserve all behavior; restyle. Reference implementation:

```tsx
import type { SlotNode, WeaponTree, ItemAvailability } from "@tarkov/data";
import { Pill } from "@tarkov/ui";

export interface SlotTreeProps {
  tree: WeaponTree;
  attachments: Readonly<Record<string, string>>;
  onAttach: (path: string, itemId: string | null) => void;
  getAvailability?: (itemId: string) => ItemAvailability | null;
  showAll?: boolean;
}

export function SlotTree({ tree, attachments, onAttach, getAvailability, showAll }: SlotTreeProps) {
  if (tree.slots.length === 0) {
    return (
      <p className="font-mono text-xs tracking-[0.15em] uppercase text-[var(--color-muted-foreground)]">
        This weapon has no mod slots.
      </p>
    );
  }
  return (
    <ul className="flex flex-col">
      {tree.slots.map((slot) => (
        <SlotRow
          key={slot.path}
          slot={slot}
          attachments={attachments}
          onAttach={onAttach}
          getAvailability={getAvailability}
          showAll={showAll}
          depth={0}
        />
      ))}
    </ul>
  );
}

function SlotRow({
  slot,
  attachments,
  onAttach,
  getAvailability,
  showAll,
  depth,
}: {
  slot: SlotNode;
  attachments: Readonly<Record<string, string>>;
  onAttach: (path: string, itemId: string | null) => void;
  getAvailability?: (itemId: string) => ItemAvailability | null;
  showAll?: boolean;
  depth: number;
}) {
  const selectedId = attachments[slot.path] ?? null;
  const selectedItem = selectedId ? slot.allowedItems.find((i) => i.id === selectedId) : null;
  const selectedAvailability =
    selectedItem && getAvailability ? getAvailability(selectedItem.id) : null;

  const indentPx = depth * 20;

  return (
    <li>
      <details className="group border-b border-dashed border-[var(--color-border)]">
        <summary
          className="flex cursor-pointer items-center gap-3 py-2 pr-3 hover:bg-[var(--color-muted)] transition-colors"
          style={{ paddingLeft: `${12 + indentPx}px` }}
        >
          <span
            aria-hidden
            className="font-mono text-[var(--color-primary)] text-xs group-open:rotate-90 transition-transform inline-block w-[10px]"
          >
            ▸
          </span>
          <span className="font-mono text-[11px] tracking-[0.15em] uppercase text-[var(--color-muted-foreground)] min-w-[140px]">
            {slot.name}
          </span>
          <span className="flex-1 text-sm truncate">
            {selectedItem ? (
              <span className="text-[var(--color-foreground)]">{selectedItem.name}</span>
            ) : (
              <span className="italic text-[var(--color-paper-dim)]">
                — empty —
                {slot.required && (
                  <span className="not-italic ml-2 font-mono text-[10px] tracking-[0.18em] uppercase text-[var(--color-destructive)]">
                    REQUIRED
                  </span>
                )}
              </span>
            )}
          </span>
          {selectedItem && <AvailabilityPill availability={selectedAvailability} />}
          <span className="font-mono text-[10px] tracking-[0.15em] uppercase text-[var(--color-paper-dim)] whitespace-nowrap">
            {slot.allowedItems.length} opt{slot.allowedItems.length === 1 ? "" : "s"}
          </span>
        </summary>
        <div
          className="border-t border-dashed border-[var(--color-border)] py-2"
          style={{ paddingLeft: `${24 + indentPx}px` }}
        >
          {slot.allowedItems.length === 0 ? (
            <p className="p-2 font-mono text-[10px] tracking-[0.15em] uppercase text-[var(--color-paper-dim)]">
              No explicit allowed items — category-based slot (deferred).
            </p>
          ) : (
            <ul className="flex flex-col">
              <li>
                <button
                  type="button"
                  onClick={() => onAttach(slot.path, null)}
                  className={`w-full px-3 py-1.5 text-left text-sm border-l-2 ${
                    !selectedId
                      ? "border-[var(--color-primary)] bg-[var(--color-muted)] text-[var(--color-primary)]"
                      : "border-transparent hover:bg-[var(--color-muted)]"
                  }`}
                >
                  <span className="font-mono text-[10px] tracking-[0.2em] uppercase">— none —</span>
                </button>
              </li>
              {slot.allowedItems.map((item) => {
                const availability = getAvailability?.(item.id) ?? null;
                const dim = !showAll && availability?.available === false;
                const requirementLabel =
                  availability && !availability.available ? formatRequirement(availability) : null;
                const isSelected = selectedId === item.id;
                return (
                  <li key={item.id}>
                    <button
                      type="button"
                      onClick={() => onAttach(slot.path, item.id)}
                      className={`flex w-full items-center justify-between gap-2 px-3 py-1.5 text-left text-sm border-l-2 ${
                        isSelected
                          ? "border-[var(--color-primary)] bg-[var(--color-muted)]"
                          : "border-transparent hover:bg-[var(--color-muted)]"
                      } ${dim ? "opacity-40" : ""}`}
                    >
                      <span className="truncate">{item.name}</span>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        {requirementLabel && (
                          <span className="font-mono text-[10px] tracking-[0.15em] uppercase text-[var(--color-paper-dim)]">
                            {requirementLabel}
                          </span>
                        )}
                        <AvailabilityPill availability={availability} />
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
          {slot.childSlots && slot.childSlots.length > 0 && (
            <ul className="flex flex-col mt-2 border-t border-dashed border-[var(--color-border)]">
              {slot.childSlots.map((child) => (
                <SlotRow
                  key={child.path}
                  slot={child}
                  attachments={attachments}
                  onAttach={onAttach}
                  getAvailability={getAvailability}
                  showAll={showAll}
                  depth={depth + 1}
                />
              ))}
            </ul>
          )}
        </div>
      </details>
    </li>
  );
}

function AvailabilityPill({ availability }: { availability: ItemAvailability | null }) {
  if (!availability) return null;
  if (availability.available) {
    return <Pill tone="reliable">{availabilityShortLabel(availability) ?? "OK"}</Pill>;
  }
  return <Pill tone="marginal">LOCKED</Pill>;
}

function availabilityShortLabel(a: ItemAvailability): string | null {
  // Prefer compact labels like "LL2" / "FLEA" / "STOCK".
  if (a.via === "stock") return "STOCK";
  if (a.via === "flea") return "FLEA";
  if (a.via === "trader" && a.loyaltyLevel) return `LL${a.loyaltyLevel}`;
  return null;
}

function formatRequirement(a: ItemAvailability): string {
  if (a.via === "trader" && a.loyaltyLevel) return `NEED LL${a.loyaltyLevel}`;
  if (a.via === "flea") return "FLEA LOCKED";
  return "LOCKED";
}
```

**Important:** the existing `SlotNode` / `ItemAvailability` types have their own shape. The snippets above reference `slot.childSlots`, `slot.required`, `availability.via`, `availability.loyaltyLevel`, `availability.available`. If any of those field names differ in the real types, adapt at the call site — do NOT change the types themselves. Use `cat node_modules/@tarkov/data/dist/...` or re-read `packages/tarkov-data/src/queries/weaponTree.ts` to verify.

- [ ] **Step 3: Verify.**

```bash
pnpm --filter @tarkov/web typecheck && pnpm --filter @tarkov/web lint
```

- [ ] **Step 4: Commit.**

```bash
git add apps/web/src/features/builder/slot-tree.tsx
git commit -m "feat(builder): Field Ledger SlotTree — tick rows, mono slot names, availability pills"
```

---

## Task 4: Full verification + push + PR

- [ ] **Step 1: CI parity.**

```bash
pnpm typecheck && pnpm lint && pnpm format:check && pnpm test && pnpm -r build
```

- [ ] **Step 2: Visual smoke check (if browser available).**

```bash
pnpm --filter @tarkov/web dev
```

Load `/builder`:

- Pick a weapon; the name appears in Bungee uppercase at the top of the build header card (corner-bracketed).
- Stat grid below the name/description inputs shows 5 `StatRow`s with stock→delta→current→bar.
- Expand a slot — the `▸` rotates to `▾`, slot name shown in mono caps, available items show with availability pills; selected item is highlighted with amber left border.
- Locked items (below your LL) are dimmed unless "show all" is toggled.

If running headless, flag in the PR body.

- [ ] **Step 3: Push + PR.**

```bash
git push -u origin feat/builder-redesign
gh pr create --title "feat(ui): /builder redesign — Field Ledger flagship (M3 PR 3)" --body "$(cat <<'EOF'
## Summary

Third PR of the M3 Frontend Design Pass. Rebuilds the look of `/builder` — the flagship route — in the Field Ledger aesthetic. Behavior preserved; styling rewritten.

- **`BuildHeader`**: corner-bracketed Card, Bungee weapon name in uppercase, meta line with mod count + short build ID, amber SHARED stamp when the build has a share URL, then 5 `StatRow`s with stock strike / delta / current / bar for ergo, recoil V, recoil H, weight, accuracy.
- **`SlotTree`**: tick-marker `▸`/`▾` rows, mono-caps slot labels, dashed dividers, amber left-border on selected items, `Pill`-based availability (LL2/LL3/FLEA/STOCK/LOCKED). Native `<details>` kept for a11y.
- **`builder.tsx`**: wires `weaponName` + `modCount` + `sharedId` props into the new BuildHeader. No other route changes.
- Plan: `docs/plans/2026-04-20-builder-redesign-plan.md`.

## Test plan

- [x] `pnpm typecheck && pnpm lint && pnpm format:check && pnpm test && pnpm -r build` — all exit 0.
- [x] Test count unchanged (no logic changes).
- [ ] Visual walkthrough deferred to post-merge.
- [ ] CI green on this PR.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- [ ] **Step 4: Merge + cleanup.**

```bash
gh pr checks --watch
gh pr merge --squash --auto
cd /mnt/c/Users/Matt/Source/TarkovGunsmith
git worktree remove .worktrees/builder-redesign
git branch -D feat/builder-redesign
git fetch origin --prune
```
