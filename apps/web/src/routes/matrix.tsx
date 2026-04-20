import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useAmmoList, useArmorList } from "@tarkov/data";
import type { AmmoListItem } from "@tarkov/data";
import { armorEffectiveness } from "@tarkov/ballistics";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, Input } from "@tarkov/ui";
import { adaptAmmo, adaptArmor } from "../features/data-adapters/adapters.js";
import { BUCKET_CLASSES, shotsToBreakBucket } from "../features/matrix/colors.js";

export const Route = createFileRoute("/matrix")({
  component: MatrixPage,
});

const DEFAULT_TOP_AMMO = 30;

function MatrixPage() {
  const ammo = useAmmoList();
  const armor = useArmorList();
  const [search, setSearch] = useState<string>("");
  const [topN, setTopN] = useState<number>(DEFAULT_TOP_AMMO);

  // Pre-sort armors by class (low → high) once data lands.
  const sortedArmors = useMemo(
    () =>
      armor.data ? [...armor.data].sort((a, b) => a.properties.class - b.properties.class) : [],
    [armor.data],
  );

  // Pre-sort ammos by penetration desc, then optionally filter by search,
  // then take top-N. Penetration-desc puts the ammo most likely to break
  // armors at the top, which is what users typically want to see first.
  const sortedAmmos = useMemo(() => {
    if (!ammo.data) return [];
    const filtered = search
      ? ammo.data.filter(
          (a) =>
            a.name.toLowerCase().includes(search.toLowerCase()) ||
            a.properties.caliber.toLowerCase().includes(search.toLowerCase()),
        )
      : ammo.data;
    return [...filtered]
      .sort((a, b) => b.properties.penetrationPower - a.properties.penetrationPower)
      .slice(0, topN);
  }, [ammo.data, search, topN]);

  // Compute the matrix once whenever the visible ammo or armor sets change.
  // Each cell runs simulateBurst up to 500 shots — for top-30 × 60 armors
  // = 1800 cells, this is a noticeable but tolerable initial compute on
  // first render. Memoized so changes to `search` only recompute affected.
  const matrix = useMemo(() => {
    if (sortedAmmos.length === 0 || sortedArmors.length === 0) return [];
    return armorEffectiveness(sortedAmmos.map(adaptAmmo), sortedArmors.map(adaptArmor));
  }, [sortedAmmos, sortedArmors]);

  const isLoading = ammo.isLoading || armor.isLoading;
  const error = ammo.error ?? armor.error;
  const hasData = sortedAmmos.length > 0 && sortedArmors.length > 0;

  return (
    <div className="flex flex-col gap-6">
      <section className="flex flex-col gap-3 border-b border-[var(--color-border)] pb-6">
        <div className="font-mono text-[11px] tracking-[0.22em] uppercase text-[var(--color-paper-dim)] flex gap-4 flex-wrap">
          <span>DATA · MATRIX</span>
          <span>/ AMMO × ARMOR</span>
          <span>/ SHOTS TO BREAK</span>
        </div>
        <h1 className="font-display text-[clamp(32px,5vw,56px)] leading-[0.95] tracking-tight uppercase">
          AmmoVsArmor <span className="text-[var(--color-primary)]">Matrix</span>
        </h1>
        <p className="text-[var(--color-muted-foreground)] max-w-[640px]">
          Shots-to-break for every visible ammo against every armor, computed via{" "}
          <code>armorEffectiveness</code>. Cells are color-coded by bucket: olive = great, amber =
          good, rust = poor, dim = can&apos;t break.
        </p>
      </section>

      {error && (
        <Card>
          <CardContent className="pt-6">
            <p className="text-[var(--color-destructive)]">Failed to load data: {error.message}</p>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Filters</CardTitle>
          <CardDescription>
            {isLoading
              ? "Loading…"
              : `${sortedAmmos.length} ammo × ${sortedArmors.length} armor = ${sortedAmmos.length * sortedArmors.length} cells`}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="flex flex-col gap-1.5">
              <span className="text-sm font-medium">Filter ammo by name or caliber</span>
              <Input
                type="search"
                placeholder="e.g. 5.56, 7.62x39, M855…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-sm font-medium">Show top N (by penetration)</span>
              <Input
                type="number"
                min={1}
                max={150}
                step={5}
                value={Number.isFinite(topN) ? String(topN) : ""}
                onChange={(e) => {
                  const next = Number(e.target.value);
                  setTopN(Number.isFinite(next) && next > 0 ? Math.min(150, next) : 1);
                }}
              />
            </label>
          </div>
        </CardContent>
      </Card>

      {hasData && (
        <Card>
          <CardContent className="overflow-x-auto p-0">
            <MatrixTable ammos={sortedAmmos} armors={sortedArmors} matrix={matrix} />
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function MatrixTable({
  ammos,
  armors,
  matrix,
}: {
  ammos: AmmoListItem[];
  armors: ReturnType<typeof useArmorList>["data"];
  matrix: number[][];
}) {
  if (!armors) return null;
  return (
    <table className="w-full border-collapse text-xs">
      <thead className="sticky top-0 bg-[var(--color-card)]">
        <tr>
          <th className="border p-2 text-left font-semibold">Ammo \\ Armor</th>
          {armors.map((a) => (
            <th
              key={a.id}
              className="border p-2 text-left font-semibold"
              title={`${a.name} (Class ${a.properties.class}, ${a.properties.durability} dur)`}
            >
              <div className="whitespace-nowrap">{a.shortName}</div>
              <div className="text-[var(--color-muted-foreground)]">C{a.properties.class}</div>
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {ammos.map((ammoItem, ammoIdx) => (
          <tr key={ammoItem.id}>
            <th
              className="border p-2 text-left font-medium"
              title={`${ammoItem.name} (pen ${ammoItem.properties.penetrationPower}, dmg ${ammoItem.properties.damage})`}
            >
              <div className="whitespace-nowrap">{ammoItem.shortName}</div>
              <div className="text-[var(--color-muted-foreground)]">
                pen {ammoItem.properties.penetrationPower}
              </div>
            </th>
            {armors.map((_, armorIdx) => {
              const shots = matrix[ammoIdx]?.[armorIdx] ?? Number.POSITIVE_INFINITY;
              const bucket = shotsToBreakBucket(shots);
              return (
                <td
                  key={armorIdx}
                  className={`border p-2 text-center ${BUCKET_CLASSES[bucket]}`}
                  title={
                    Number.isFinite(shots)
                      ? `${shots} shots to break`
                      : "Cannot break within 500 shots"
                  }
                >
                  {Number.isFinite(shots) ? shots : "—"}
                </td>
              );
            })}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
