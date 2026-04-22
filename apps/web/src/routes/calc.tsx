import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import type { ReactNode } from "react";
import { useAmmoList, useArmorList } from "@tarkov/data";
import { simulateShot } from "@tarkov/ballistics";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, Input, Pill } from "@tarkov/ui";
import { adaptAmmo, adaptArmor } from "../features/data-adapters/adapters.js";
import { WipBanner } from "../features/nav/wip-banner.js";

export const Route = createFileRoute("/calc")({
  component: CalcPage,
});

const DEFAULT_DISTANCE = 15;

function CalcPage() {
  const ammo = useAmmoList();
  const armor = useArmorList();

  const [ammoId, setAmmoId] = useState<string>("");
  const [armorId, setArmorId] = useState<string>("");
  const [distance, setDistance] = useState<number>(DEFAULT_DISTANCE);

  const selectedAmmo = useMemo(() => ammo.data?.find((a) => a.id === ammoId), [ammo.data, ammoId]);
  const selectedArmor = useMemo(
    () => armor.data?.find((a) => a.id === armorId),
    [armor.data, armorId],
  );

  const result = useMemo(() => {
    if (!selectedAmmo || !selectedArmor) return null;
    return simulateShot(adaptAmmo(selectedAmmo), adaptArmor(selectedArmor), distance);
  }, [selectedAmmo, selectedArmor, distance]);

  const ammoOptions = useMemo(
    () => (ammo.data ? [...ammo.data].sort((a, b) => a.name.localeCompare(b.name)) : []),
    [ammo.data],
  );
  const armorOptions = useMemo(
    () => (armor.data ? [...armor.data].sort((a, b) => a.name.localeCompare(b.name)) : []),
    [armor.data],
  );

  const isLoading = ammo.isLoading || armor.isLoading;
  const error = ammo.error ?? armor.error;

  return (
    <div className="flex flex-col gap-6">
      <WipBanner />
      <section className="flex flex-col gap-3 border-b border-[var(--color-border)] pb-6">
        <div className="font-mono text-[11px] tracking-[0.22em] uppercase text-[var(--color-paper-dim)] flex gap-4 flex-wrap">
          <span>FORWARD · SINGLE SHOT</span>
          <span>/ LIVE RECOMPUTE</span>
        </div>
        <h1 className="font-display text-[clamp(32px,5vw,56px)] leading-[0.95] tracking-tight uppercase">
          Ballistic <span className="text-[var(--color-primary)]">Calculator</span>
        </h1>
        <p className="text-[var(--color-muted-foreground)] max-w-[640px]">
          Pick an ammo + armor + distance to compute the deterministic shot outcome (penetration,
          damage, armor damage, remaining durability) via <code>simulateShot</code>.
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
          <CardTitle>Inputs</CardTitle>
          <CardDescription>Live recompute on every change — no Calculate button.</CardDescription>
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
              <span className="text-sm font-medium">Distance (m)</span>
              <Input
                type="number"
                min={0}
                max={500}
                step={1}
                value={Number.isFinite(distance) ? String(distance) : ""}
                onChange={(e) => {
                  const next = Number(e.target.value);
                  setDistance(Number.isFinite(next) ? next : 0);
                }}
              />
              <span className="text-xs text-[var(--color-muted-foreground)]">
                Distance does not affect the math at MVP — recorded for the burst view.
              </span>
            </label>
          </form>
        </CardContent>
      </Card>

      <Card variant="bracket">
        <CardHeader>
          <CardTitle>Result</CardTitle>
          {!result && (
            <CardDescription>Pick an ammo and an armor to see the result.</CardDescription>
          )}
        </CardHeader>
        {result && selectedAmmo && selectedArmor && (
          <CardContent>
            <dl className="grid gap-2 sm:grid-cols-2">
              <Stat
                label="Penetrated?"
                value={
                  <Pill tone={result.didPenetrate ? "accent" : "muted"}>
                    {result.didPenetrate ? "PEN" : "BLOCKED"}
                  </Pill>
                }
              />
              <Stat label="Body damage" value={`${result.damage.toFixed(1)} HP`} />
              <Stat label="Armor damage" value={`${result.armorDamage.toFixed(2)} pts`} />
              <Stat
                label="Remaining durability"
                value={`${result.remainingDurability.toFixed(2)} / ${selectedArmor.properties.durability}`}
              />
              <Stat label="Residual penetration" value={`${result.residualPenetration} pts`} />
              <Stat
                label="Matchup"
                value={
                  <>
                    <code>{selectedAmmo.shortName}</code> vs <code>{selectedArmor.shortName}</code>{" "}
                    at {distance}m
                  </>
                }
              />
            </dl>
          </CardContent>
        )}
      </Card>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5 rounded-[var(--radius)] border p-3">
      <dt className="text-xs uppercase tracking-wide text-[var(--color-muted-foreground)]">
        {label}
      </dt>
      <dd>{value}</dd>
    </div>
  );
}
