import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useAmmoList, useArmorList } from "@tarkov/data";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, Input } from "@tarkov/ui";
import { adaptAmmo, adaptArmor } from "../features/data-adapters/adapters.js";
import { rankAmmos, type AecClassification } from "../features/aec/rankAmmos.js";

export const Route = createFileRoute("/aec")({
  component: AecPage,
});

const DEFAULT_SHOT_CAP = 30;
const DEFAULT_DISTANCE = 15;

function AecPage() {
  const ammo = useAmmoList();
  const armor = useArmorList();

  const [armorId, setArmorId] = useState<string>("");
  const [shotCap, setShotCap] = useState<number>(DEFAULT_SHOT_CAP);
  const [distance, setDistance] = useState<number>(DEFAULT_DISTANCE);

  const selectedArmor = useMemo(
    () => armor.data?.find((a) => a.id === armorId),
    [armor.data, armorId],
  );

  const armorOptions = useMemo(
    () => (armor.data ? [...armor.data].sort((a, b) => a.name.localeCompare(b.name)) : []),
    [armor.data],
  );

  const rows = useMemo(() => {
    if (!selectedArmor || !ammo.data) return null;
    const adaptedArmor = adaptArmor(selectedArmor);
    const adaptedAmmos = ammo.data.map(adaptAmmo);
    return rankAmmos(adaptedAmmos, adaptedArmor, shotCap, distance);
  }, [selectedArmor, ammo.data, shotCap, distance]);

  const isLoading = ammo.isLoading || armor.isLoading;
  const dataError = ammo.error ?? armor.error;

  return (
    <div className="flex flex-col gap-6">
      <section>
        <h1 className="text-3xl font-bold tracking-tight">Armor Effectiveness Calculator</h1>
        <p className="mt-2 text-[var(--color-muted-foreground)]">
          Pick an armor; every ammo is simulated and ranked by how efficiently it breaks it.
          Classifications: <strong>reliable</strong> (≤ cap), <strong>marginal</strong> (≤ 2× cap),
          <strong> ineffective</strong> (never breaks within 2× cap).
        </p>
      </section>

      {dataError && (
        <Card>
          <CardContent className="pt-6">
            <p className="text-[var(--color-destructive)]">
              Failed to load data: {dataError.message}
            </p>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Inputs</CardTitle>
          <CardDescription>Armor picker + shot cap + distance.</CardDescription>
        </CardHeader>
        <CardContent>
          <form className="grid gap-4 sm:grid-cols-3" onSubmit={(e) => e.preventDefault()}>
            <label className="flex flex-col gap-1.5 sm:col-span-3">
              <span className="text-sm font-medium">Armor</span>
              <select
                className="h-9 rounded-[var(--radius)] border bg-[var(--color-input)] px-3 text-sm"
                value={armorId}
                onChange={(e) => setArmorId(e.target.value)}
                disabled={isLoading || armorOptions.length === 0}
              >
                <option value="">{isLoading ? "Loading…" : "Select armor…"}</option>
                {armorOptions.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </select>
            </label>

            <label className="flex flex-col gap-1.5">
              <span className="text-sm font-medium">Shot cap</span>
              <Input
                type="number"
                min={1}
                max={200}
                step={1}
                value={Number.isFinite(shotCap) ? String(shotCap) : ""}
                onChange={(e) => {
                  const n = Number(e.target.value);
                  setShotCap(Math.max(1, Math.min(200, Number.isFinite(n) ? n : 1)));
                }}
              />
            </label>

            <label className="flex flex-col gap-1.5">
              <span className="text-sm font-medium">Distance (m)</span>
              <Input
                type="number"
                min={0}
                max={500}
                step={1}
                value={Number.isFinite(distance) ? String(distance) : ""}
                onChange={(e) => {
                  const n = Number(e.target.value);
                  setDistance(Number.isFinite(n) ? n : 0);
                }}
              />
            </label>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Ranked ammo</CardTitle>
          {!rows && <CardDescription>Pick an armor to rank every ammo.</CardDescription>}
        </CardHeader>
        {rows && (
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-xs uppercase tracking-wide text-[var(--color-muted-foreground)]">
                    <th className="py-2">#</th>
                    <th className="py-2">Ammo</th>
                    <th className="py-2">Shots to break</th>
                    <th className="py-2">First pen</th>
                    <th className="py-2">Damage at break</th>
                    <th className="py-2">Classification</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r, i) => (
                    <tr key={r.ammo.id} className="border-b last:border-b-0">
                      <td className="py-1.5 font-mono tabular-nums">{i + 1}</td>
                      <td className="py-1.5">{r.ammo.name}</td>
                      <td className="py-1.5 tabular-nums">
                        {Number.isFinite(r.shotsToBreak) ? r.shotsToBreak : "∞"}
                      </td>
                      <td className="py-1.5 tabular-nums">
                        {r.firstPenetrationAt === null ? "never" : r.firstPenetrationAt + 1}
                      </td>
                      <td className="py-1.5 tabular-nums">
                        {r.totalDamageAtBreak === 0 ? "—" : r.totalDamageAtBreak.toFixed(0)}
                      </td>
                      <td className="py-1.5">
                        <ClassificationPill k={r.classification} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        )}
      </Card>
    </div>
  );
}

function ClassificationPill({ k }: { k: AecClassification }) {
  if (k === "reliable") {
    return (
      <span className="rounded-full bg-[var(--color-primary)]/20 px-2 py-0.5 text-xs font-semibold text-[var(--color-primary)]">
        reliable
      </span>
    );
  }
  if (k === "marginal") {
    return (
      <span className="rounded-full bg-amber-600/20 px-2 py-0.5 text-xs font-semibold text-amber-500">
        marginal
      </span>
    );
  }
  return (
    <span className="rounded-full bg-[var(--color-muted)] px-2 py-0.5 text-xs">ineffective</span>
  );
}
