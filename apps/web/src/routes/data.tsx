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
