import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import {
  BarChart,
  Bar,
  Cell,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";
import { useAmmoList, useArmorList } from "@tarkov/data";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, Input } from "@tarkov/ui";
import { adaptAmmo, adaptArmor } from "../features/data-adapters/adapters.js";
import { rankArmorsForAmmo, type ChartRow } from "../features/charts/rankArmorsForAmmo.js";

export const Route = createFileRoute("/charts")({
  component: ChartsPage,
});

const DEFAULT_SHOT_CAP = 30;
const DEFAULT_DISTANCE = 15;
const VISUAL_CAP_MULT = 3;

interface ChartDatum {
  name: string;
  value: number;
  infinite: boolean;
  classification: ChartRow["classification"];
}

function ChartsPage() {
  const ammo = useAmmoList();
  const armor = useArmorList();

  const [ammoId, setAmmoId] = useState<string>("");
  const [shotCap, setShotCap] = useState<number>(DEFAULT_SHOT_CAP);
  const [distance, setDistance] = useState<number>(DEFAULT_DISTANCE);

  const selectedAmmo = useMemo(() => ammo.data?.find((a) => a.id === ammoId), [ammo.data, ammoId]);

  const ammoOptions = useMemo(
    () => (ammo.data ? [...ammo.data].sort((a, b) => a.name.localeCompare(b.name)) : []),
    [ammo.data],
  );

  const rows = useMemo(() => {
    if (!selectedAmmo || !armor.data) return null;
    const adaptedAmmo = adaptAmmo(selectedAmmo);
    const adaptedArmors = armor.data.map(adaptArmor);
    return rankArmorsForAmmo(adaptedAmmo, adaptedArmors, shotCap, distance);
  }, [selectedAmmo, armor.data, shotCap, distance]);

  const chartData = useMemo((): ChartDatum[] | null => {
    if (!rows) return null;
    const visualCap = shotCap * VISUAL_CAP_MULT;
    return rows.map((r) => ({
      name: r.armor.name,
      value: Number.isFinite(r.shotsToBreak) ? r.shotsToBreak : visualCap,
      infinite: !Number.isFinite(r.shotsToBreak),
      classification: r.classification,
    }));
  }, [rows, shotCap]);

  const isLoading = ammo.isLoading || armor.isLoading;
  const dataError = ammo.error ?? armor.error;

  return (
    <div className="flex flex-col gap-6">
      <section>
        <h1 className="text-3xl font-bold tracking-tight">Effectiveness Charts</h1>
        <p className="mt-2 text-[var(--color-muted-foreground)]">
          Visualise how an ammo stacks up across every armor. Bar height = shots to break.
          <span className="ml-1">∞ bars = never breaks within the sim window.</span>
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
          <CardDescription>Ammo + shot cap + distance.</CardDescription>
        </CardHeader>
        <CardContent>
          <form className="grid gap-4 sm:grid-cols-3" onSubmit={(e) => e.preventDefault()}>
            <label className="flex flex-col gap-1.5 sm:col-span-3">
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
          <CardTitle>Shots to break, by armor</CardTitle>
          {!chartData && <CardDescription>Pick an ammo to render the chart.</CardDescription>}
        </CardHeader>
        {chartData && (
          <CardContent>
            <div className="h-[500px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} margin={{ top: 16, right: 16, bottom: 80, left: 16 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                  <XAxis
                    dataKey="name"
                    angle={-45}
                    textAnchor="end"
                    height={100}
                    interval={0}
                    tick={{ fill: "var(--color-muted-foreground)", fontSize: 11 }}
                  />
                  <YAxis tick={{ fill: "var(--color-muted-foreground)" }} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "var(--color-popover)",
                      border: "1px solid var(--color-border)",
                      borderRadius: "var(--radius)",
                    }}
                    formatter={(value, _name, entry) => {
                      const row = (entry as { payload?: ChartDatum }).payload;
                      const label = row?.infinite
                        ? "∞ (never breaks)"
                        : `${String(value ?? "")} shots`;
                      return [label, "Shots to break"];
                    }}
                  />
                  <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                    {chartData.map((entry, i) => (
                      <Cell key={i} fill={fillForClassification(entry.classification)} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div className="mt-4 flex gap-4 text-xs text-[var(--color-muted-foreground)]">
              <Legend color="var(--color-primary)" label="reliable (≤ shot cap)" />
              <Legend color="#d97706" label="marginal (≤ 2× cap)" />
              <Legend color="var(--color-muted)" label="ineffective (∞ or > 2× cap)" />
            </div>
          </CardContent>
        )}
      </Card>
    </div>
  );
}

function fillForClassification(k: ChartRow["classification"]): string {
  if (k === "reliable") return "var(--color-primary)";
  if (k === "marginal") return "#d97706";
  return "var(--color-muted)";
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span
        className="inline-block h-3 w-3 rounded-sm"
        style={{ backgroundColor: color }}
        aria-hidden
      />
      {label}
    </span>
  );
}
