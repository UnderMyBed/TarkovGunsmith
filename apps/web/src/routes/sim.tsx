import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useAmmoList, useArmorList } from "@tarkov/data";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, Input } from "@tarkov/ui";
import { adaptAmmo } from "../features/data-adapters/adapters.js";
import { useScenario } from "../features/sim/useScenario.js";
import { BodySilhouette } from "../features/sim/BodySilhouette.js";
import { ShotQueue } from "../features/sim/ShotQueue.js";
import { ScenarioSummary } from "../features/sim/ScenarioSummary.js";
import { ShotTimeline } from "../features/sim/ShotTimeline.js";
import { buildScenarioTarget } from "../features/sim/buildScenarioTarget.js";
import { WipBanner } from "../features/nav/wip-banner.js";

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

  const { plan, lastResult, append, move, remove, clear, run } = useScenario();

  const selectedAmmo = useMemo(() => ammo.data?.find((a) => a.id === ammoId), [ammo.data, ammoId]);
  const selectedHelmet = useMemo(
    () => armor.data?.find((a) => a.id === helmetId),
    [armor.data, helmetId],
  );
  const selectedBodyArmor = useMemo(
    () => armor.data?.find((a) => a.id === bodyArmorId),
    [armor.data, bodyArmorId],
  );

  const ammoOptions = useMemo(
    () => (ammo.data ? [...ammo.data].sort((a, b) => a.name.localeCompare(b.name)) : []),
    [ammo.data],
  );
  const helmetOptions = useMemo(
    () =>
      armor.data
        ? [...armor.data]
            .filter((a) => a.properties.zones.some((z) => z.toLowerCase().includes("head")))
            .sort((a, b) => a.name.localeCompare(b.name))
        : [],
    [armor.data],
  );
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
  const dataError = ammo.error ?? armor.error;

  const canRun = selectedAmmo !== undefined && !isLoading && dataError === null;

  const onRun = () => {
    if (!selectedAmmo) return;
    const target = buildScenarioTarget({
      helmet: selectedHelmet,
      bodyArmor: selectedBodyArmor,
    });
    run(adaptAmmo(selectedAmmo), target);
  };

  return (
    <div className="flex flex-col gap-6">
      <WipBanner />
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
          Build a shot plan against a PMC target — pick ammo, optional helmet + body armor, click
          zones to queue shots, then hit Run to simulate the engagement shot-by-shot.
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

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Inputs */}
        <Card>
          <CardHeader>
            <CardTitle>Inputs</CardTitle>
            <CardDescription>Ammo + target loadout.</CardDescription>
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
                {!isLoading && helmetOptions.length === 0 && (
                  <span className="text-xs text-[var(--color-muted-foreground)]">
                    No helmets available — tarkov-api&rsquo;s <code>armor</code> type may not
                    include headwear. Follow-up.
                  </span>
                )}
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

        {/* Shot plan */}
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
              onClick={onRun}
              disabled={!canRun}
              title={canRun ? "" : "Select ammo to enable"}
              className="rounded-[var(--radius)] border bg-[var(--color-primary)] px-3 py-1.5 text-sm font-medium text-[var(--color-primary-foreground)] hover:bg-[var(--color-primary)]/90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Run
            </button>
          </CardContent>
        </Card>

        {/* Results */}
        <Card variant="bracket">
          <CardHeader>
            <CardTitle>Results</CardTitle>
            {!lastResult && (
              <CardDescription>Pick ammo, build a plan, then press Run.</CardDescription>
            )}
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            {lastResult ? (
              <>
                <ScenarioSummary result={lastResult} />
                <ShotTimeline shots={lastResult.shots} />
              </>
            ) : (
              <p className="text-sm text-[var(--color-muted-foreground)]">No results yet.</p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
