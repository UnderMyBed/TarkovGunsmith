# DataSheets (`/data`) Implementation Plan

> **For agentic workers:** superpowers:subagent-driven-development. Checkbox tasks.

**Goal:** Ship `/data` — a single-route, 4-tab reference view for ammo / armor / weapons / modules with sort + filter. Single PR.

**Architecture:** Pure helpers `filterRowsByName<T>` + `sortRows<T>` in `apps/web/src/features/data-sheets/`. Route `apps/web/src/routes/data.tsx` composes tab bar + search input + 4 table configurations. Reuses `useAmmoList`, `useArmorList`, `useWeaponList`, `useModList` from `@tarkov/data`.

---

## Reference

- **Spec:** `docs/superpowers/specs/2026-04-20-datasheets-design.md`.
- **Hooks:** `useAmmoList`, `useArmorList`, `useWeaponList`, `useModList` — all exported from `@tarkov/data`.
- **Pattern:** `apps/web/src/routes/adc.tsx` — table markup style.

## Scope decisions

1. **4 tabs via local state** (not nested routes) — avoids router plumbing; tab state is ephemeral.
2. **Sort is client-side, stable.** Data fits in memory; no need for virtualisation.
3. **Search filters by `name` only** in v1. Additional filters (caliber, class) deferred.
4. **No ammo caliber column.** Upstream schema doesn't expose it cleanly on `AmmoListItem`.

## File map

```
apps/web/src/features/data-sheets/
├── filterRows.ts                  NEW
├── filterRows.test.ts             NEW
├── sortRows.ts                    NEW
└── sortRows.test.ts               NEW

apps/web/src/routes/
├── data.tsx                        NEW
├── __root.tsx                      MODIFIED — nav link
├── index.tsx                       MODIFIED — landing card
└── route-tree.gen.ts               REGENERATED
```

---

## Task 0: Worktree + baseline

```bash
cd ~/TarkovGunsmith
git fetch origin
git worktree add .worktrees/datasheets -b feat/datasheets-route origin/main
cd .worktrees/datasheets
pnpm install --frozen-lockfile
pnpm --filter "./packages/*" build
pnpm --filter @tarkov/web typecheck && pnpm --filter @tarkov/web lint && pnpm --filter @tarkov/web test
```

Expected: all green. 62 web tests.

---

## Task 1: `filterRowsByName` pure helper

**Files:**

- Create: `apps/web/src/features/data-sheets/filterRows.ts`
- Create: `apps/web/src/features/data-sheets/filterRows.test.ts`

- [ ] **Step 1: Failing tests.**

```ts
import { describe, expect, it } from "vitest";
import { filterRowsByName } from "./filterRows.js";

const rows = [
  { id: "1", name: "M855" },
  { id: "2", name: "M995" },
  { id: "3", name: "PS gs" },
];

describe("filterRowsByName", () => {
  it("returns all rows when query is empty", () => {
    expect(filterRowsByName(rows, "")).toEqual(rows);
  });

  it("returns all rows when query is only whitespace", () => {
    expect(filterRowsByName(rows, "   ")).toEqual(rows);
  });

  it("filters by case-insensitive substring on name", () => {
    const out = filterRowsByName(rows, "m8");
    expect(out).toHaveLength(1);
    expect(out[0]!.id).toBe("1");
  });

  it("matches mixed case queries", () => {
    expect(filterRowsByName(rows, "PS")).toHaveLength(1);
    expect(filterRowsByName(rows, "ps")).toHaveLength(1);
  });

  it("returns empty when nothing matches", () => {
    expect(filterRowsByName(rows, "xyz")).toEqual([]);
  });
});
```

- [ ] **Step 2: Run — expect failure.**

```bash
pnpm --filter @tarkov/web test filterRows
```

- [ ] **Step 3: Implement.**

```ts
/**
 * Filter a list of named rows by case-insensitive substring match on `name`.
 * Empty / whitespace-only queries return the input unchanged.
 *
 * @example
 *   filterRowsByName(ammos, "m8")
 */
export function filterRowsByName<T extends { name: string }>(
  rows: readonly T[],
  query: string,
): T[] {
  const q = query.trim().toLowerCase();
  if (q === "") return [...rows];
  return rows.filter((r) => r.name.toLowerCase().includes(q));
}
```

- [ ] **Step 4: Run — 5 passing.**

- [ ] **Step 5: Commit.**

```bash
git add apps/web/src/features/data-sheets/filterRows.ts apps/web/src/features/data-sheets/filterRows.test.ts
git commit -m "feat(data): filterRowsByName helper"
```

---

## Task 2: `sortRows` pure helper

**Files:**

- Create: `apps/web/src/features/data-sheets/sortRows.ts`
- Create: `apps/web/src/features/data-sheets/sortRows.test.ts`

- [ ] **Step 1: Failing tests.**

```ts
import { describe, expect, it } from "vitest";
import { sortRows } from "./sortRows.js";

const rows = [
  { id: "a", name: "Charlie", damage: 30 },
  { id: "b", name: "Alpha", damage: 50 },
  { id: "c", name: "Bravo", damage: 40 },
];

describe("sortRows", () => {
  it("sorts by string key ascending (locale-aware)", () => {
    const out = sortRows(rows, "name", "asc");
    expect(out.map((r) => r.name)).toEqual(["Alpha", "Bravo", "Charlie"]);
  });

  it("sorts by string key descending", () => {
    const out = sortRows(rows, "name", "desc");
    expect(out.map((r) => r.name)).toEqual(["Charlie", "Bravo", "Alpha"]);
  });

  it("sorts by numeric key ascending", () => {
    const out = sortRows(rows, "damage", "asc");
    expect(out.map((r) => r.damage)).toEqual([30, 40, 50]);
  });

  it("sorts by numeric key descending", () => {
    const out = sortRows(rows, "damage", "desc");
    expect(out.map((r) => r.damage)).toEqual([50, 40, 30]);
  });

  it("does not mutate the input", () => {
    const copy = [...rows];
    sortRows(rows, "damage", "asc");
    expect(rows).toEqual(copy);
  });

  it("is stable for equal keys", () => {
    const dupes = [
      { id: "a", name: "X", damage: 10 },
      { id: "b", name: "X", damage: 10 },
    ];
    const out = sortRows(dupes, "damage", "asc");
    expect(out[0]!.id).toBe("a");
    expect(out[1]!.id).toBe("b");
  });
});
```

- [ ] **Step 2: Run — expect failure.**

- [ ] **Step 3: Implement.**

```ts
export type SortDirection = "asc" | "desc";

/**
 * Stable sort of rows by a given key. String keys use locale-aware compare;
 * numeric keys use simple subtraction. Direction flips the result. The input
 * is never mutated.
 *
 * @example
 *   sortRows(ammos, "damage", "desc");
 */
export function sortRows<T extends Record<string, unknown>, K extends keyof T>(
  rows: readonly T[],
  key: K,
  direction: SortDirection,
): T[] {
  const sign = direction === "asc" ? 1 : -1;
  const copy = [...rows];
  copy.sort((a, b) => {
    const av = a[key];
    const bv = b[key];
    if (typeof av === "number" && typeof bv === "number") {
      return (av - bv) * sign;
    }
    const as = String(av);
    const bs = String(bv);
    return as.localeCompare(bs) * sign;
  });
  return copy;
}
```

- [ ] **Step 4: Run — 6 passing.**

- [ ] **Step 5: Commit.**

```bash
git add apps/web/src/features/data-sheets/sortRows.ts apps/web/src/features/data-sheets/sortRows.test.ts
git commit -m "feat(data): sortRows stable generic sort helper"
```

---

## Task 3: `/data` route with 4 tabs

**Files:**

- Create: `apps/web/src/routes/data.tsx`

- [ ] **Step 1: Write the route.**

```tsx
import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import {
  useAmmoList,
  useArmorList,
  useWeaponList,
  useModList,
  type AmmoListItem,
  type ArmorListItem,
  type WeaponListItem,
  type ModListItem,
} from "@tarkov/data";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, Input } from "@tarkov/ui";
import { filterRowsByName } from "../features/data-sheets/filterRows.js";
import { sortRows, type SortDirection } from "../features/data-sheets/sortRows.js";

export const Route = createFileRoute("/data")({
  component: DataPage,
});

type Tab = "ammo" | "armor" | "weapons" | "modules";

function DataPage() {
  const [tab, setTab] = useState<Tab>("ammo");
  const [query, setQuery] = useState<string>("");

  return (
    <div className="flex flex-col gap-6">
      <section>
        <h1 className="text-3xl font-bold tracking-tight">DataSheets</h1>
        <p className="mt-2 text-[var(--color-muted-foreground)]">
          Reference tables for ammo, armor, weapons, and weapon modifications. Sort by any column;
          filter by name.
        </p>
      </section>

      <div className="flex flex-wrap items-center gap-2 border-b">
        {(["ammo", "armor", "weapons", "modules"] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={
              tab === t
                ? "border-b-2 border-[var(--color-primary)] px-3 py-2 text-sm font-semibold text-[var(--color-primary)]"
                : "px-3 py-2 text-sm text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)]"
            }
          >
            {t.charAt(0).toUpperCase() + t.slice(1)}
          </button>
        ))}
        <div className="ml-auto">
          <Input
            type="search"
            placeholder="Filter by name…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="w-56"
          />
        </div>
      </div>

      {tab === "ammo" && <AmmoTable query={query} />}
      {tab === "armor" && <ArmorTable query={query} />}
      {tab === "weapons" && <WeaponTable query={query} />}
      {tab === "modules" && <ModTable query={query} />}
    </div>
  );
}

type SortState<T> = { key: keyof T; direction: SortDirection };

function useSortedFiltered<T extends { name: string }>(
  rows: readonly T[] | undefined,
  query: string,
  initialSort: SortState<T>,
) {
  const [sort, setSort] = useState<SortState<T>>(initialSort);
  const filtered = useMemo(() => (rows ? filterRowsByName(rows, query) : []), [rows, query]);
  const sorted = useMemo(() => sortRows(filtered, sort.key, sort.direction), [filtered, sort]);
  const onSort = (key: keyof T) => {
    setSort((s) => ({
      key,
      direction: s.key === key && s.direction === "asc" ? "desc" : "asc",
    }));
  };
  return { rows: sorted, sort, onSort };
}

function Header<T>({
  label,
  keyName,
  sort,
  onSort,
  align = "left",
}: {
  label: string;
  keyName: keyof T;
  sort: SortState<T>;
  onSort: (k: keyof T) => void;
  align?: "left" | "right";
}) {
  const active = sort.key === keyName;
  return (
    <th className={align === "right" ? "py-2 text-right" : "py-2 text-left"}>
      <button
        type="button"
        onClick={() => onSort(keyName)}
        className="text-xs font-semibold uppercase tracking-wide hover:text-[var(--color-primary)]"
      >
        {label}
        {active && <span className="ml-1">{sort.direction === "asc" ? "▲" : "▼"}</span>}
      </button>
    </th>
  );
}

function AmmoTable({ query }: { query: string }) {
  const q = useAmmoList();
  type Row = AmmoListItem & {
    pen: number;
    damage: number;
    adp: number;
    projectiles: number;
  };
  const rows = useMemo<Row[]>(
    () =>
      (q.data ?? []).map((a) => ({
        ...a,
        pen: a.properties.penetrationPower,
        damage: a.properties.damage,
        adp: a.properties.armorDamage,
        projectiles: a.properties.projectileCount,
      })),
    [q.data],
  );
  const {
    rows: display,
    sort,
    onSort,
  } = useSortedFiltered<Row>(rows, query, {
    key: "name",
    direction: "asc",
  });
  if (q.isLoading) return <Loading />;
  if (q.error) return <ErrorCard message={q.error.message} />;
  return (
    <DataCard title="Ammo" count={display.length}>
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b text-[var(--color-muted-foreground)]">
            <Header<Row> label="Name" keyName="name" sort={sort} onSort={onSort} />
            <Header<Row> label="Pen" keyName="pen" sort={sort} onSort={onSort} align="right" />
            <Header<Row>
              label="Damage"
              keyName="damage"
              sort={sort}
              onSort={onSort}
              align="right"
            />
            <Header<Row>
              label="Armor dmg %"
              keyName="adp"
              sort={sort}
              onSort={onSort}
              align="right"
            />
            <Header<Row>
              label="Projectiles"
              keyName="projectiles"
              sort={sort}
              onSort={onSort}
              align="right"
            />
          </tr>
        </thead>
        <tbody>
          {display.map((r) => (
            <tr key={r.id} className="border-b last:border-b-0">
              <td className="py-1.5">{r.name}</td>
              <td className="py-1.5 text-right tabular-nums">{r.pen}</td>
              <td className="py-1.5 text-right tabular-nums">{r.damage}</td>
              <td className="py-1.5 text-right tabular-nums">{r.adp}</td>
              <td className="py-1.5 text-right tabular-nums">{r.projectiles}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </DataCard>
  );
}

function ArmorTable({ query }: { query: string }) {
  const q = useArmorList();
  type Row = ArmorListItem & {
    class: number;
    durability: number;
    material: string;
    zonesJoined: string;
  };
  const rows = useMemo<Row[]>(
    () =>
      (q.data ?? []).map((a) => ({
        ...a,
        class: a.properties.class,
        durability: a.properties.durability,
        material: a.properties.material.name,
        zonesJoined: a.properties.zones.join(", "),
      })),
    [q.data],
  );
  const {
    rows: display,
    sort,
    onSort,
  } = useSortedFiltered<Row>(rows, query, {
    key: "name",
    direction: "asc",
  });
  if (q.isLoading) return <Loading />;
  if (q.error) return <ErrorCard message={q.error.message} />;
  return (
    <DataCard title="Armor" count={display.length}>
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b text-[var(--color-muted-foreground)]">
            <Header<Row> label="Name" keyName="name" sort={sort} onSort={onSort} />
            <Header<Row> label="Class" keyName="class" sort={sort} onSort={onSort} align="right" />
            <Header<Row>
              label="Durability"
              keyName="durability"
              sort={sort}
              onSort={onSort}
              align="right"
            />
            <Header<Row> label="Material" keyName="material" sort={sort} onSort={onSort} />
            <Header<Row> label="Zones" keyName="zonesJoined" sort={sort} onSort={onSort} />
          </tr>
        </thead>
        <tbody>
          {display.map((r) => (
            <tr key={r.id} className="border-b last:border-b-0">
              <td className="py-1.5">{r.name}</td>
              <td className="py-1.5 text-right tabular-nums">{r.class}</td>
              <td className="py-1.5 text-right tabular-nums">{r.durability}</td>
              <td className="py-1.5">{r.material}</td>
              <td className="py-1.5 text-[var(--color-muted-foreground)]">{r.zonesJoined}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </DataCard>
  );
}

function WeaponTable({ query }: { query: string }) {
  const q = useWeaponList();
  type Row = WeaponListItem & {
    caliber: string;
    ergonomics: number;
    recoilVertical: number;
    recoilHorizontal: number;
    fireRate: number;
  };
  const rows = useMemo<Row[]>(
    () =>
      (q.data ?? []).map((w) => ({
        ...w,
        caliber: w.properties.caliber,
        ergonomics: w.properties.ergonomics,
        recoilVertical: w.properties.recoilVertical,
        recoilHorizontal: w.properties.recoilHorizontal,
        fireRate: w.properties.fireRate,
      })),
    [q.data],
  );
  const {
    rows: display,
    sort,
    onSort,
  } = useSortedFiltered<Row>(rows, query, {
    key: "name",
    direction: "asc",
  });
  if (q.isLoading) return <Loading />;
  if (q.error) return <ErrorCard message={q.error.message} />;
  return (
    <DataCard title="Weapons" count={display.length}>
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b text-[var(--color-muted-foreground)]">
            <Header<Row> label="Name" keyName="name" sort={sort} onSort={onSort} />
            <Header<Row> label="Caliber" keyName="caliber" sort={sort} onSort={onSort} />
            <Header<Row>
              label="Ergo"
              keyName="ergonomics"
              sort={sort}
              onSort={onSort}
              align="right"
            />
            <Header<Row>
              label="Recoil V"
              keyName="recoilVertical"
              sort={sort}
              onSort={onSort}
              align="right"
            />
            <Header<Row>
              label="Recoil H"
              keyName="recoilHorizontal"
              sort={sort}
              onSort={onSort}
              align="right"
            />
            <Header<Row>
              label="Fire rate"
              keyName="fireRate"
              sort={sort}
              onSort={onSort}
              align="right"
            />
            <Header<Row>
              label="Weight"
              keyName="weight"
              sort={sort}
              onSort={onSort}
              align="right"
            />
          </tr>
        </thead>
        <tbody>
          {display.map((r) => (
            <tr key={r.id} className="border-b last:border-b-0">
              <td className="py-1.5">{r.name}</td>
              <td className="py-1.5 text-[var(--color-muted-foreground)]">{r.caliber}</td>
              <td className="py-1.5 text-right tabular-nums">{r.ergonomics}</td>
              <td className="py-1.5 text-right tabular-nums">{r.recoilVertical}</td>
              <td className="py-1.5 text-right tabular-nums">{r.recoilHorizontal}</td>
              <td className="py-1.5 text-right tabular-nums">{r.fireRate}</td>
              <td className="py-1.5 text-right tabular-nums">{r.weight.toFixed(2)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </DataCard>
  );
}

function ModTable({ query }: { query: string }) {
  const q = useModList();
  type Row = ModListItem & {
    ergo: number;
    recoilPct: number;
    accuracyPct: number;
  };
  const rows = useMemo<Row[]>(
    () =>
      (q.data ?? []).map((m) => ({
        ...m,
        ergo: m.properties.ergonomics,
        recoilPct: m.properties.recoilModifier,
        accuracyPct: m.properties.accuracyModifier,
      })),
    [q.data],
  );
  const {
    rows: display,
    sort,
    onSort,
  } = useSortedFiltered<Row>(rows, query, {
    key: "name",
    direction: "asc",
  });
  if (q.isLoading) return <Loading />;
  if (q.error) return <ErrorCard message={q.error.message} />;
  return (
    <DataCard title="Modules" count={display.length}>
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b text-[var(--color-muted-foreground)]">
            <Header<Row> label="Name" keyName="name" sort={sort} onSort={onSort} />
            <Header<Row> label="Ergo Δ" keyName="ergo" sort={sort} onSort={onSort} align="right" />
            <Header<Row>
              label="Recoil %"
              keyName="recoilPct"
              sort={sort}
              onSort={onSort}
              align="right"
            />
            <Header<Row>
              label="Accuracy %"
              keyName="accuracyPct"
              sort={sort}
              onSort={onSort}
              align="right"
            />
            <Header<Row>
              label="Weight"
              keyName="weight"
              sort={sort}
              onSort={onSort}
              align="right"
            />
          </tr>
        </thead>
        <tbody>
          {display.map((r) => (
            <tr key={r.id} className="border-b last:border-b-0">
              <td className="py-1.5">{r.name}</td>
              <td className="py-1.5 text-right tabular-nums">{r.ergo}</td>
              <td className="py-1.5 text-right tabular-nums">{r.recoilPct}</td>
              <td className="py-1.5 text-right tabular-nums">{r.accuracyPct}</td>
              <td className="py-1.5 text-right tabular-nums">{r.weight.toFixed(2)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </DataCard>
  );
}

function DataCard({
  title,
  count,
  children,
}: {
  title: string;
  count: number;
  children: React.ReactNode;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>
          {count} row{count === 1 ? "" : "s"}
        </CardDescription>
      </CardHeader>
      <CardContent className="overflow-x-auto">{children}</CardContent>
    </Card>
  );
}

function Loading() {
  return (
    <Card>
      <CardContent className="pt-6">
        <p className="text-sm text-[var(--color-muted-foreground)]">Loading…</p>
      </CardContent>
    </Card>
  );
}

function ErrorCard({ message }: { message: string }) {
  return (
    <Card>
      <CardContent className="pt-6">
        <p className="text-[var(--color-destructive)]">Failed to load: {message}</p>
      </CardContent>
    </Card>
  );
}
```

Note on the mod properties shape: the plan assumes `recoilModifier` and `accuracyModifier` fields on `ModListItem.properties`. Verify by reading `packages/tarkov-data/src/queries/modList.ts`; if field names differ (e.g., `recoilModifier` vs `recoil`), adjust the column bindings. `ergonomics` and `weight` are known to exist from Builder usage.

- [ ] **Step 2: Typecheck + lint.**

```bash
pnpm --filter @tarkov/web typecheck && pnpm --filter @tarkov/web lint
```

If typecheck fails on `m.properties.recoilModifier` etc., inspect `packages/tarkov-data/src/queries/modList.ts` and rename the bindings to match the schema. Keep all 5 columns.

- [ ] **Step 3: Commit.**

```bash
git add apps/web/src/routes/data.tsx
git commit -m "feat(data): /data route with 4-tab DataSheets (ammo/armor/weapons/mods)"
```

---

## Task 4: Nav + landing + route tree regen

**Files:**

- Modify: `apps/web/src/routes/__root.tsx`
- Modify: `apps/web/src/routes/index.tsx`
- Regenerate: `apps/web/src/route-tree.gen.ts`

- [ ] **Step 1: Add nav link** after `/aec`:

```tsx
<Link
  to="/aec"
  activeProps={{ className: "font-semibold text-[var(--color-primary)]" }}
>
  AEC
</Link>
<Link
  to="/data"
  activeProps={{ className: "font-semibold text-[var(--color-primary)]" }}
>
  Data
</Link>
```

- [ ] **Step 2: Landing card.**

```tsx
<Link to="/data" className="block">
  <Card className="transition-colors hover:border-[var(--color-primary)]">
    <CardHeader>
      <CardTitle>DataSheets</CardTitle>
      <CardDescription>Browse raw stats — ammo, armor, weapons, modules.</CardDescription>
    </CardHeader>
    <CardContent className="text-sm text-[var(--color-muted-foreground)]">
      Sortable, searchable reference tables.
    </CardContent>
  </Card>
</Link>
```

- [ ] **Step 3: Regen route tree.**

```bash
pnpm --filter @tarkov/web exec vite build
```

- [ ] **Step 4: Commit.**

```bash
git add apps/web/src/routes/__root.tsx apps/web/src/routes/index.tsx apps/web/src/route-tree.gen.ts
git commit -m "feat(data): add /data nav + landing card + regen route tree"
```

---

## Task 5: Full verification + push + PR

- [ ] **Step 1: CI parity.**

```bash
pnpm typecheck && pnpm lint && pnpm format:check && pnpm test && pnpm -r build
```

- [ ] **Step 2: Push.**

```bash
git push -u origin feat/datasheets-route
```

- [ ] **Step 3: PR.**

```bash
gh pr create --title "feat(data): /data DataSheets route (M2 sub-project 4)" --body "$(cat <<'EOF'
## Summary

Fourth M2 sub-project. Single `/data` route with 4 tabs (Ammo / Armor / Weapons / Modules). Sort by any column, filter by name. Reuses existing `@tarkov/data` hooks; no new queries.

- Pure helpers: `filterRowsByName`, `sortRows` — 11 unit tests.
- Route `apps/web/src/routes/data.tsx` with tab bar + search input + 4 table views.
- Nav link + landing card.
- Spec: `docs/superpowers/specs/2026-04-20-datasheets-design.md`.
- Plan: `docs/plans/2026-04-20-datasheets-route-plan.md`.

## Test plan

- [x] `pnpm --filter @tarkov/web test` — 11 new passing.
- [x] `pnpm typecheck && pnpm lint && pnpm format:check && pnpm test && pnpm -r build` — all exit 0.
- [ ] CI green on this PR.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- [ ] **Step 4: Merge + cleanup.**

```bash
gh pr checks --watch
gh pr merge --squash --auto
cd ~/TarkovGunsmith
git worktree remove .worktrees/datasheets
git branch -D feat/datasheets-route
git fetch origin --prune
```
