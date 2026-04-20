# Frontend Pass PR 4 — Ballistics Routes Sweep Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development.

**Goal:** Apply the Field Ledger aesthetic consistently across `/calc`, `/sim`, `/adc`, `/aec`. No math changes — visual only.

**Architecture:** Each route's primary Card gains `variant="bracket"`; route headers become Bungee-display section titles; any hand-rolled "classification" pills switch to the `Pill` component; inline table / timeline rows adopt tick dividers (dashed borders) + mono labels; big numeric callouts use Bungee or the mono token.

---

## Reference

- **Umbrella spec:** `docs/superpowers/specs/2026-04-20-frontend-design-pass-design.md`.
- **Mood board:** `docs/design/mood-board.html` — especially §05 (Ledger / Data) and §06 (Shot Timeline).
- **PR 1/2/3 shipped.** This PR builds on `Pill`, `Stamp`, `StatRow`, `SectionTitle`, `Card variant="bracket"`, tokens + fonts.

## Scope decisions

1. **No structural refactors.** Routes keep the same component composition. Only styling class names + primitive imports change.
2. **No new primitives.** Use what PR 1 shipped.
3. **Route headers get a new treatment**: the existing `<section><h1>...</h1><p>...</p></section>` becomes a two-line header — Bungee all-caps title + mono-caps meta lead. Helper is inlined, not extracted (routes stay self-contained).
4. **Result-card backgrounds**: primary "result" / "timeline" panels get `variant="bracket"`. Input panels stay `variant="plain"` (default).
5. **Classification / pen / block pills**: every hand-rolled `<span>` with reliable / marginal / ineffective / PEN / blocked text is replaced with the `<Pill tone="...">` primitive.
6. **Mono tabular numerics** already in routes (from M2 shipping). Reaffirm `tabular-nums` + `font-mono` consistently.

## File map

```
apps/web/src/routes/
├── calc.tsx                        MODIFIED — header + panels restyle
├── sim.tsx                         MODIFIED — header, body-silhouette / shot-queue passthroughs, results
├── adc.tsx                         MODIFIED — header + result table row classes
└── aec.tsx                         MODIFIED — header + ranking table, inline pills → Pill primitive

apps/web/src/features/sim/
├── ScenarioSummary.tsx             MODIFIED — Stat styling to use mono tokens + dashed border
└── ShotTimeline.tsx                MODIFIED — tick dividers + Pill pen / block

# unchanged:
features/sim/BodySilhouette.tsx, ShotQueue.tsx, zoneMetadata.ts
```

No other files.

---

## Task 0: Worktree + baseline

```bash
cd /mnt/c/Users/Matt/Source/TarkovGunsmith
git fetch origin
git worktree add .worktrees/ballistics-sweep -b feat/ballistics-routes-sweep origin/main
cd .worktrees/ballistics-sweep
pnpm install --frozen-lockfile
pnpm --filter "./packages/*" build
pnpm --filter @tarkov/web typecheck && pnpm --filter @tarkov/web lint && pnpm --filter @tarkov/web test
```

---

## Task 1: `/calc`

**File:** `apps/web/src/routes/calc.tsx`

- [ ] **Step 1: Replace the `<section>` page header** with a Field Ledger header.

```tsx
<section className="flex flex-col gap-3 border-b border-[var(--color-border)] pb-6">
  <div className="font-mono text-[11px] tracking-[0.22em] uppercase text-[var(--color-paper-dim)] flex gap-4 flex-wrap">
    <span>FORWARD · SINGLE SHOT</span>
    <span>/ LIVE RECOMPUTE</span>
  </div>
  <h1 className="font-display text-[clamp(32px,5vw,56px)] leading-[0.95] tracking-tight uppercase">
    Ballistic <span className="text-[var(--color-primary)]">Calculator</span>
  </h1>
  <p className="text-[var(--color-muted-foreground)] max-w-[640px]">
    Pick an ammo + armor + distance to compute the deterministic shot outcome (penetration, damage,
    armor damage, remaining durability) via <code>simulateShot</code>.
  </p>
</section>
```

- [ ] **Step 2: Make the Result Card bracket-variant.** Find the "Result" `<Card>` and add `variant="bracket"`.

```tsx
<Card variant="bracket">
  <CardHeader>
    <CardTitle>Result</CardTitle>
    ...
```

- [ ] **Step 3: Pen/Deflected badge becomes a `Pill`.** In the `Stat` for "Penetrated?" value, replace the hand-rolled `<span className={... primary ... destructive ...}>` with `<Pill tone={result.didPenetrate ? "accent" : "muted"}>{result.didPenetrate ? "PEN" : "BLOCKED"}</Pill>`.

Keep the `"Yes" / "No (deflected)"` wording intact beneath the pill if helpful, or drop it — pill alone is clearer.

- [ ] **Step 4: Import `Pill` at the top of the file.**

- [ ] **Step 5: Typecheck + lint.**

```bash
pnpm --filter @tarkov/web typecheck && pnpm --filter @tarkov/web lint
```

- [ ] **Step 6: Commit.**

```bash
git add apps/web/src/routes/calc.tsx
git commit -m "feat(ui): /calc — Field Ledger header + bracket result card + Pill pen badge"
```

---

## Task 2: `/sim`

**Files:**

- `apps/web/src/routes/sim.tsx`
- `apps/web/src/features/sim/ScenarioSummary.tsx`
- `apps/web/src/features/sim/ShotTimeline.tsx`

- [ ] **Step 1: Update `sim.tsx` header** — same pattern as `/calc`:

```tsx
<section className="flex flex-col gap-3 border-b border-[var(--color-border)] pb-6">
  <div className="font-mono text-[11px] tracking-[0.22em] uppercase text-[var(--color-paper-dim)] flex gap-4 flex-wrap">
    <span>FORWARD · SCENARIO</span>
    <span>/ MULTI-SHOT · MULTI-ZONE</span>
    <span>/ PMC DEFAULTS</span>
  </div>
  <h1 className="font-display text-[clamp(32px,5vw,56px)] leading-[0.95] tracking-tight uppercase">
    Ballistics <span className="text-[var(--color-primary)]">Simulator</span>
  </h1>
  <p className="text-[var(--color-muted-foreground)] max-w-[640px]">
    Build a shot plan against a PMC target — pick ammo, optional helmet + body armor, click zones to
    queue shots, then hit Run to simulate the engagement shot-by-shot.
  </p>
</section>
```

- [ ] **Step 2: Results Card gets `variant="bracket"`** (the 3rd Card in the grid).

- [ ] **Step 3: Rewrite `ScenarioSummary.tsx`** to use mono labels and dashed dividers. Replace the internal `Stat` helper with a version that uses the Field Ledger styling. Reference:

```tsx
import type { ScenarioResult } from "@tarkov/ballistics";
import { Stamp } from "@tarkov/ui";
import type { ReactNode } from "react";

export interface ScenarioSummaryProps {
  readonly result: ScenarioResult;
}

export function ScenarioSummary({ result }: ScenarioSummaryProps) {
  const shotsFired = result.shots.length;
  const totalDamage = result.shots.reduce((sum, s) => sum + s.damage, 0);
  const lastHelmetShot = [...result.shots].reverse().find((s) => s.armorUsed === "helmet");
  const lastBodyShot = [...result.shots].reverse().find((s) => s.armorUsed === "bodyArmor");

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-baseline justify-between border-b border-dashed border-[var(--color-border)] pb-3">
        <div>
          <div className="font-mono text-[10px] tracking-[0.2em] uppercase text-[var(--color-muted-foreground)]">
            OUTCOME
          </div>
          <div className="font-display text-xl leading-none mt-1 uppercase">
            {result.killed ? (
              <span className="text-[var(--color-destructive)]">
                Killed{result.killedAt !== null ? ` · shot ${result.killedAt + 1}` : ""}
              </span>
            ) : (
              <span className="text-[var(--color-primary)]">Alive</span>
            )}
          </div>
        </div>
        {result.killed && <Stamp tone="red">ELIMINATED</Stamp>}
      </div>
      <dl className="grid grid-cols-2 gap-3">
        <SummaryStat label="SHOTS FIRED" value={`${shotsFired}`} />
        <SummaryStat label="TOTAL FLESH DMG" value={`${totalDamage.toFixed(1)} HP`} />
        {lastBodyShot && (
          <SummaryStat
            label="BODY ARMOR · REM"
            value={`${lastBodyShot.remainingDurability.toFixed(1)}`}
          />
        )}
        {lastHelmetShot && (
          <SummaryStat
            label="HELMET · REM"
            value={`${lastHelmetShot.remainingDurability.toFixed(1)}`}
          />
        )}
      </dl>
    </div>
  );
}

function SummaryStat({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="border border-[var(--color-border)] p-3">
      <dt className="font-mono text-[10px] tracking-[0.2em] uppercase text-[var(--color-muted-foreground)]">
        {label}
      </dt>
      <dd className="mt-1 font-mono text-xl tabular-nums">{value}</dd>
    </div>
  );
}
```

- [ ] **Step 4: Rewrite `ShotTimeline.tsx`** to use `Pill` for pen/block and tick dividers between shots. Reference:

```tsx
import type { ScenarioShotResult } from "@tarkov/ballistics";
import { Pill } from "@tarkov/ui";
import { zoneLabel } from "./zoneMetadata.js";

export interface ShotTimelineProps {
  readonly shots: readonly ScenarioShotResult[];
}

export function ShotTimeline({ shots }: ShotTimelineProps) {
  if (shots.length === 0) {
    return (
      <p className="font-mono text-[10px] tracking-[0.18em] uppercase text-[var(--color-muted-foreground)]">
        No shots executed.
      </p>
    );
  }
  return (
    <ol className="flex flex-col">
      {shots.map((shot, i) => {
        const part = shot.bodyAfter[shot.zone];
        const pct = part.max > 0 ? Math.max(0, Math.min(100, (part.hp / part.max) * 100)) : 0;
        const barColor =
          part.hp === 0 ? "bg-[var(--color-destructive)]" : "bg-[var(--color-primary)]";
        return (
          <li
            key={i}
            className={`flex flex-col gap-1 py-2 border-b border-dashed border-[var(--color-border)] last:border-b-0 ${
              shot.killed ? "bg-[color:rgba(185,28,28,0.05)]" : ""
            }`}
          >
            <div className="flex items-center gap-3">
              <span
                className={`font-mono text-xs tabular-nums ${
                  shot.killed ? "text-[var(--color-destructive)]" : "text-[var(--color-paper-dim)]"
                }`}
              >
                #{String(i + 1).padStart(2, "0")}
              </span>
              <span className="font-mono text-[11px] tracking-[0.15em] uppercase">
                {zoneLabel(shot.zone)}
              </span>
              <Pill tone={shot.didPenetrate ? "accent" : "muted"}>
                {shot.didPenetrate ? "PEN" : "blocked"}
              </Pill>
              <span className="flex-1 text-right font-mono text-[11px] text-[var(--color-muted-foreground)]">
                {shot.damage.toFixed(1)} dmg
                {shot.armorDamage > 0 ? ` · ${shot.armorDamage.toFixed(1)} armor` : ""}
                {shot.armorUsed
                  ? ` · via ${shot.armorUsed === "helmet" ? "helmet" : "body armor"}`
                  : ""}
                {shot.killed && (
                  <span className="ml-2 font-semibold text-[var(--color-destructive)]">
                    · FATAL
                  </span>
                )}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <div
                className="flex-1 h-1.5 bg-[var(--color-muted)] border border-[var(--color-line-muted)] overflow-hidden"
                role="progressbar"
                aria-valuenow={Math.round(part.hp)}
                aria-valuemin={0}
                aria-valuemax={part.max}
              >
                <div className={`h-full ${barColor}`} style={{ width: `${pct}%` }} />
              </div>
              <div className="font-mono text-[10px] tabular-nums text-[var(--color-paper-dim)] min-w-[56px] text-right">
                {part.hp.toFixed(0)}/{part.max}
              </div>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
```

- [ ] **Step 5: Typecheck + lint.**

```bash
pnpm --filter @tarkov/web typecheck && pnpm --filter @tarkov/web lint
```

- [ ] **Step 6: Commit.**

```bash
git add apps/web/src/routes/sim.tsx apps/web/src/features/sim/ScenarioSummary.tsx apps/web/src/features/sim/ShotTimeline.tsx
git commit -m "feat(ui): /sim — Field Ledger header + bracket results + Pill timeline"
```

---

## Task 3: `/adc`

**File:** `apps/web/src/routes/adc.tsx`

- [ ] **Step 1: Replace the page header** with the same Field Ledger pattern. Meta: `"FORWARD · BURST"` / `"PER-SHOT TABLE"`. Title: `Armor Damage <span>Calculator</span>`.

- [ ] **Step 2: Results Card** gets `variant="bracket"`.

- [ ] **Step 3: Pen / blocked cells in the per-shot table become `Pill`s.** Replace the inline `<span className={... rounded-full ... primary ... muted ...}>PEN/blocked</span>` pattern with:

```tsx
<Pill tone={r.didPenetrate ? "accent" : "muted"}>{r.didPenetrate ? "PEN" : "blocked"}</Pill>
```

- [ ] **Step 4: Import `Pill`.**

- [ ] **Step 5: Make the summary stat grid tick-divider friendly** — remove internal rounded borders, use dashed-bottom rows or mono uppercase labels consistent with other routes.

- [ ] **Step 6: Commit.**

```bash
git add apps/web/src/routes/adc.tsx
git commit -m "feat(ui): /adc — Field Ledger header + bracket result card + Pill pen badges"
```

---

## Task 4: `/aec`

**File:** `apps/web/src/routes/aec.tsx`

- [ ] **Step 1: Replace the page header.** Meta: `"INVERSE · RANKING"` / `"ARMOR FIXED"`. Title: `Armor Effectiveness <span>Calculator</span>`.

- [ ] **Step 2: Delete the inline `ClassificationPill` component.** It duplicates `@tarkov/ui`'s `Pill`. Replace every call site with:

```tsx
<Pill tone={r.classification}>{r.classification}</Pill>
```

The `Pill` primitive's `tone` already accepts `"reliable" | "marginal" | "ineffective"` — this is a direct swap.

- [ ] **Step 3: Add `variant="bracket"`** to the ranking results Card.

- [ ] **Step 4: Import `Pill` at top.** Remove the now-unused inline `ClassificationPill` definition.

- [ ] **Step 5: Typecheck + lint.**

- [ ] **Step 6: Commit.**

```bash
git add apps/web/src/routes/aec.tsx
git commit -m "feat(ui): /aec — Field Ledger header + bracket ranking card + @tarkov/ui Pill"
```

---

## Task 5: Full verification + push + PR

```bash
pnpm typecheck && pnpm lint && pnpm format:check && pnpm test && pnpm -r build
git push -u origin feat/ballistics-routes-sweep
gh pr create --title "feat(ui): ballistics routes sweep (/calc /sim /adc /aec) — Field Ledger (M3 PR 4)" --body "$(cat <<'EOF'
## Summary

Fourth PR of the M3 Frontend Design Pass. Applies the Field Ledger visual system to `/calc`, `/sim`, `/adc`, `/aec` — no math changes, visual only.

- **All four routes:** new Bungee + mono-caps page headers with meta labels and a bordered bottom rule.
- **Primary result Cards:** `variant="bracket"` — amber corner marks.
- **`/sim` `ScenarioSummary`:** rewritten for mono labels, bordered stat tiles, `Stamp` for ELIMINATED.
- **`/sim` `ShotTimeline`:** `Pill` for PEN / blocked, dashed tick dividers between shots, tightened HP bar row.
- **`/calc` + `/adc`:** inline pen/blocked `<span>`s replaced with `Pill`.
- **`/aec`:** inline `ClassificationPill` deleted; uses `@tarkov/ui`'s `Pill` with reliable / marginal / ineffective tones.
- Plan: `docs/plans/2026-04-20-ballistics-routes-sweep-plan.md`.

## Test plan

- [x] `pnpm typecheck && pnpm lint && pnpm format:check && pnpm test && pnpm -r build` — all exit 0.
- [x] Test count unchanged.
- [ ] Visual walkthrough deferred to post-merge.
- [ ] CI green.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
gh pr checks --watch
gh pr merge --squash --auto
cd /mnt/c/Users/Matt/Source/TarkovGunsmith
git worktree remove .worktrees/ballistics-sweep
git branch -D feat/ballistics-routes-sweep
git fetch origin --prune
```
