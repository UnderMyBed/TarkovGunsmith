import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useAmmoList, useArmorList } from "@tarkov/data";
import { simulateBurst } from "@tarkov/ballistics";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, Input, Pill } from "@tarkov/ui";
import { adaptAmmo, adaptArmor } from "../features/data-adapters/adapters.js";
import { adcSummary } from "../features/adc/adcSummary.js";

export const Route = createFileRoute("/adc")({
  component: AdcPage,
});

const DEFAULT_SHOTS = 5;
const DEFAULT_DISTANCE = 15;
const MAX_SHOTS = 50;

function AdcPage() {
  const ammo = useAmmoList();
  const armor = useArmorList();

  const [ammoId, setAmmoId] = useState<string>("");
  const [armorId, setArmorId] = useState<string>("");
  const [shots, setShots] = useState<number>(DEFAULT_SHOTS);
  const [distance, setDistance] = useState<number>(DEFAULT_DISTANCE);
  const [durabilityOverride, setDurabilityOverride] = useState<string>("");

  const selectedAmmo = useMemo(() => ammo.data?.find((a) => a.id === ammoId), [ammo.data, ammoId]);
  const selectedArmor = useMemo(
    () => armor.data?.find((a) => a.id === armorId),
    [armor.data, armorId],
  );

  const ammoOptions = useMemo(
    () => (ammo.data ? [...ammo.data].sort((a, b) => a.name.localeCompare(b.name)) : []),
    [ammo.data],
  );
  const armorOptions = useMemo(
    () => (armor.data ? [...armor.data].sort((a, b) => a.name.localeCompare(b.name)) : []),
    [armor.data],
  );

  const results = useMemo(() => {
    if (!selectedAmmo || !selectedArmor) return null;
    const adaptedArmor = adaptArmor(selectedArmor);
    const current = parseDurability(durabilityOverride, adaptedArmor.maxDurability);
    return simulateBurst(
      adaptAmmo(selectedAmmo),
      { ...adaptedArmor, currentDurability: current },
      shots,
      distance,
    );
  }, [selectedAmmo, selectedArmor, shots, distance, durabilityOverride]);

  const summary = useMemo(
    () =>
      results && selectedArmor ? adcSummary(results, selectedArmor.properties.durability) : null,
    [results, selectedArmor],
  );

  const isLoading = ammo.isLoading || armor.isLoading;
  const dataError = ammo.error ?? armor.error;

  return (
    <div className="flex flex-col gap-6">
      <section className="flex flex-col gap-3 border-b border-[var(--color-border)] pb-6">
        <div className="font-mono text-[11px] tracking-[0.22em] uppercase text-[var(--color-paper-dim)] flex gap-4 flex-wrap">
          <span>FORWARD · BURST</span>
          <span>/ PER-SHOT TABLE</span>
        </div>
        <h1 className="font-display text-[clamp(32px,5vw,56px)] leading-[0.95] tracking-tight uppercase">
          Armor Damage <span className="text-[var(--color-primary)]">Calculator</span>
        </h1>
        <p className="text-[var(--color-muted-foreground)] max-w-[640px]">
          Multi-shot forward ballistics at a single armor piece. Pick ammo, armor, and shot count;
          live-recompute shows a shot-by-shot table.
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
          <CardDescription>Live recompute on every change.</CardDescription>
        </CardHeader>
        <CardContent>
          <form className="grid gap-4 sm:grid-cols-2" onSubmit={(e) => e.preventDefault()}>
            <label className="flex flex-col gap-1.5">
              <span className="text-sm font-medium">Ammo</span>
              <select
                className="h-9 rounded-[var(--radius)] border bg-[var(--color-input)] px-3 text-sm"
                value={ammoId}
                onChange={(e) => setAmmoId(e.target.value)}
                disabled={isLoading || ammoOptions.length === 0}
              >
                <option value="">{isLoading ? "Loading…" : "Select ammo…"}</option>
                {ammoOptions.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </select>
            </label>

            <label className="flex flex-col gap-1.5">
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
              <span className="text-sm font-medium">Shots</span>
              <Input
                type="number"
                min={1}
                max={MAX_SHOTS}
                step={1}
                value={Number.isFinite(shots) ? String(shots) : ""}
                onChange={(e) => {
                  const n = Number(e.target.value);
                  const clamped = Math.max(1, Math.min(MAX_SHOTS, Number.isFinite(n) ? n : 1));
                  setShots(clamped);
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

            <label className="flex flex-col gap-1.5 sm:col-span-2">
              <span className="text-sm font-medium">
                Starting durability (optional — defaults to max)
              </span>
              <Input
                type="number"
                min={0}
                step={1}
                value={durabilityOverride}
                placeholder={selectedArmor ? String(selectedArmor.properties.durability) : ""}
                onChange={(e) => setDurabilityOverride(e.target.value)}
              />
            </label>
          </form>
        </CardContent>
      </Card>

      <Card variant="bracket">
        <CardHeader>
          <CardTitle>Results</CardTitle>
          {!results && (
            <CardDescription>Pick an ammo and an armor to see the burst.</CardDescription>
          )}
        </CardHeader>
        {results && selectedArmor && summary && (
          <CardContent className="flex flex-col gap-4">
            <dl className="grid gap-2 sm:grid-cols-2">
              <Stat
                label="First penetration"
                value={
                  summary.firstPenetrationAt === null
                    ? "never penetrates"
                    : `shot ${summary.firstPenetrationAt + 1}`
                }
              />
              <Stat label="Total flesh damage" value={`${summary.totalDamage.toFixed(1)} HP`} />
              <Stat
                label="Final durability"
                value={`${summary.finalDurability.toFixed(2)} / ${selectedArmor.properties.durability}`}
              />
              <Stat
                label="Final durability %"
                value={`${((summary.finalDurability / selectedArmor.properties.durability) * 100).toFixed(0)}%`}
              />
            </dl>

            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-xs uppercase tracking-wide text-[var(--color-muted-foreground)]">
                    <th className="py-2">#</th>
                    <th className="py-2">Pen</th>
                    <th className="py-2">Damage</th>
                    <th className="py-2">Armor dmg</th>
                    <th className="py-2">Durability</th>
                    <th className="py-2">Residual pen</th>
                  </tr>
                </thead>
                <tbody>
                  {results.map((r, i) => (
                    <tr key={i} className="border-b last:border-b-0">
                      <td className="py-1.5 font-mono tabular-nums">{i + 1}</td>
                      <td className="py-1.5">
                        <Pill tone={r.didPenetrate ? "accent" : "muted"}>
                          {r.didPenetrate ? "PEN" : "blocked"}
                        </Pill>
                      </td>
                      <td className="py-1.5 tabular-nums">{r.damage.toFixed(1)}</td>
                      <td className="py-1.5 tabular-nums">{r.armorDamage.toFixed(2)}</td>
                      <td className="py-1.5 tabular-nums">{r.remainingDurability.toFixed(2)}</td>
                      <td className="py-1.5 tabular-nums">{r.residualPenetration}</td>
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

function Stat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="border border-[var(--color-border)] p-3">
      <dt className="font-mono text-[10px] tracking-[0.2em] uppercase text-[var(--color-muted-foreground)]">
        {label}
      </dt>
      <dd className="mt-1 font-mono tabular-nums">{value}</dd>
    </div>
  );
}

function parseDurability(override: string, fallback: number): number {
  if (override.trim() === "") return fallback;
  const n = Number(override);
  if (!Number.isFinite(n) || n < 0) return fallback;
  return Math.min(fallback, n);
}
