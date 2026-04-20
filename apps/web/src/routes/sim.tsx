import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useAmmoList, useArmorList } from "@tarkov/data";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, Input } from "@tarkov/ui";
import { useScenario } from "../features/sim/useScenario.js";
import { BodySilhouette } from "../features/sim/BodySilhouette.js";
import { ShotQueue } from "../features/sim/ShotQueue.js";

export const Route = createFileRoute("/sim")({
  component: SimPage,
});

const DEFAULT_DISTANCE = 15;

function SimPage() {
  const ammo = useAmmoList();
  const armor = useArmorList();

  const [ammoId, setAmmoId] = useState<string>("");
  const [helmetId, setHelmetId] = useState<string>("");
  const [bodyArmorId, setBodyArmorId] = useState<string>("");
  const [distance, setDistance] = useState<number>(DEFAULT_DISTANCE);

  const { plan, lastResult, append, move, remove, clear } = useScenario();

  const ammoOptions = useMemo(
    () => (ammo.data ? [...ammo.data].sort((a, b) => a.name.localeCompare(b.name)) : []),
    [ammo.data],
  );

  // Helmet options: armored headwear (zones includes head-related zone names)
  const helmetOptions = useMemo(
    () =>
      armor.data
        ? [...armor.data]
            .filter((a) => a.properties.zones.some((z) => z.toLowerCase().includes("head")))
            .sort((a, b) => a.name.localeCompare(b.name))
        : [],
    [armor.data],
  );

  // Body armor options: chest/stomach coverage
  const bodyArmorOptions = useMemo(
    () =>
      armor.data
        ? [...armor.data]
            .filter((a) =>
              a.properties.zones.some(
                (z) => z.toLowerCase().includes("chest") || z.toLowerCase().includes("thorax"),
              ),
            )
            .sort((a, b) => a.name.localeCompare(b.name))
        : [],
    [armor.data],
  );

  const isLoading = ammo.isLoading || armor.isLoading;
  const error = ammo.error ?? armor.error;

  // Selections held for PR 4 wire-up (target + ammo passed to run()).
  void ammoId;
  void helmetId;
  void bodyArmorId;

  return (
    <div className="flex flex-col gap-6">
      <section>
        <h1 className="text-3xl font-bold tracking-tight">Ballistics Simulator</h1>
        <p className="mt-2 text-[var(--color-muted-foreground)]">
          Build a shot plan against a PMC target. Pick ammo, optional armor, click zones to queue
          shots, then hit Run to simulate the engagement.
        </p>
      </section>

      {error && (
        <Card>
          <CardContent className="pt-6">
            <p className="text-[var(--color-destructive)]">Failed to load data: {error.message}</p>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Panel 1 — Inputs */}
        <Card>
          <CardHeader>
            <CardTitle>Inputs</CardTitle>
            <CardDescription>Ammo and target loadout.</CardDescription>
          </CardHeader>
          <CardContent>
            <form className="flex flex-col gap-4" onSubmit={(e) => e.preventDefault()}>
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
                <span className="text-sm font-medium">Helmet (optional)</span>
                <select
                  className="h-9 rounded-[var(--radius)] border bg-[var(--color-input)] px-3 text-sm"
                  value={helmetId}
                  onChange={(e) => setHelmetId(e.target.value)}
                  disabled={isLoading}
                >
                  <option value="">{isLoading ? "Loading…" : "None"}</option>
                  {helmetOptions.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
                </select>
              </label>

              <label className="flex flex-col gap-1.5">
                <span className="text-sm font-medium">Body armor (optional)</span>
                <select
                  className="h-9 rounded-[var(--radius)] border bg-[var(--color-input)] px-3 text-sm"
                  value={bodyArmorId}
                  onChange={(e) => setBodyArmorId(e.target.value)}
                  disabled={isLoading}
                >
                  <option value="">{isLoading ? "Loading…" : "None"}</option>
                  {bodyArmorOptions.map((a) => (
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
              </label>
            </form>
          </CardContent>
        </Card>

        {/* Panel 2 — Shot Plan */}
        <Card>
          <CardHeader>
            <CardTitle>Shot Plan</CardTitle>
            <CardDescription>Click a zone to add it to the queue.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <BodySilhouette onZoneClick={(zone) => append({ zone, distance })} />
            <ShotQueue plan={plan} onMove={move} onRemove={remove} onClear={clear} />
            <button
              type="button"
              disabled
              title="Scenario execution lands in Simulator PR 4"
              className="rounded-[var(--radius)] border bg-[var(--color-primary)] px-3 py-1.5 text-sm font-medium text-[var(--color-primary-foreground)] disabled:cursor-not-allowed disabled:opacity-50"
            >
              Run
            </button>
          </CardContent>
        </Card>

        {/* Panel 3 — Results (placeholder — wired in PR 4) */}
        <Card>
          <CardHeader>
            <CardTitle>Results</CardTitle>
            {!lastResult && (
              <CardDescription>Add shots to the plan and press Run to simulate.</CardDescription>
            )}
          </CardHeader>
          <CardContent>
            {lastResult ? (
              <p className="text-sm text-[var(--color-muted-foreground)]">
                Results wiring lands in PR 4.
              </p>
            ) : (
              <p className="text-sm text-[var(--color-muted-foreground)]">
                No results yet. Build a shot plan and press Run.
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
