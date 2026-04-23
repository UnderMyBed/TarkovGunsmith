import type { ReactElement } from "react";
import type { WeaponSpec } from "@tarkov/ballistics";
import { Card, Skeleton } from "@tarkov/ui";

export interface OptimizeTriptychProps {
  current: WeaponSpec | null;
  optimized: WeaponSpec | null;
  priceCurrent: number | null;
  priceOptimized: number | null;
  running?: boolean;
}

type StatKey = "recoil" | "ergo" | "weight" | "price";

interface StatDef {
  readonly key: StatKey;
  readonly label: string;
  readonly lowerIsBetter: boolean;
  readonly format: (v: number) => string;
  readonly select: (s: WeaponSpec, price: number | null) => number | null;
}

const STATS: readonly StatDef[] = [
  {
    key: "recoil",
    label: "RECOIL V",
    lowerIsBetter: true,
    format: (v) => v.toFixed(0),
    select: (s) => s.verticalRecoil,
  },
  {
    key: "ergo",
    label: "ERGO",
    lowerIsBetter: false,
    format: (v) => v.toFixed(0),
    select: (s) => s.ergonomics,
  },
  {
    key: "weight",
    label: "WT kg",
    lowerIsBetter: true,
    format: (v) => v.toFixed(2),
    select: (s) => s.weight,
  },
  {
    key: "price",
    label: "₽",
    lowerIsBetter: true,
    format: (v) => `${(v / 1000).toFixed(1)}k`,
    select: (_s, price) => price,
  },
];

function deltaClass(delta: number, lowerIsBetter: boolean): string {
  if (Math.abs(delta) < 0.005) return "text-[var(--color-paper-dim)]";
  const improved = lowerIsBetter ? delta < 0 : delta > 0;
  return improved ? "text-[var(--color-olive)]" : "text-[var(--color-destructive)]";
}

function formatDelta(delta: number, stat: StatDef): string {
  if (Math.abs(delta) < 0.005) return "0";
  const sign = delta > 0 ? "+" : "−";
  const abs = stat.format(Math.abs(delta));
  return `${sign}${abs}`;
}

export function OptimizeTriptych({
  current,
  optimized,
  priceCurrent,
  priceOptimized,
  running = false,
}: OptimizeTriptychProps): ReactElement {
  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
      <Card variant="bracket" className="p-4">
        <div className="font-mono text-[10px] tracking-[0.2em] uppercase text-[var(--color-paper-dim)]">
          CURRENT BUILD
        </div>
        <div className="mt-3 grid grid-cols-2 gap-3">
          {STATS.map((stat) => {
            const value = current === null ? null : stat.select(current, priceCurrent);
            return (
              <div key={stat.key}>
                <div className="font-mono text-[10px] tracking-[0.18em] uppercase text-[var(--color-muted-foreground)]">
                  {stat.label}
                </div>
                <div
                  className="font-mono text-xl text-[var(--color-foreground)] mt-0.5"
                  data-testid={`triptych-current-${stat.key}`}
                >
                  {value === null ? "—" : stat.format(value)}
                </div>
              </div>
            );
          })}
        </div>
      </Card>

      <Card variant="bracket-olive" className="p-4">
        <div className="font-mono text-[10px] tracking-[0.2em] uppercase text-[var(--color-olive)]">
          ◇ OPTIMIZED
        </div>
        <div className="mt-3 grid grid-cols-2 gap-3">
          {STATS.map((stat) => {
            const value = optimized === null ? null : stat.select(optimized, priceOptimized);
            return (
              <div key={stat.key}>
                <div className="font-mono text-[10px] tracking-[0.18em] uppercase text-[var(--color-muted-foreground)]">
                  {stat.label}
                </div>
                <div
                  className="font-mono text-xl text-[var(--color-foreground)] mt-0.5"
                  data-testid={`triptych-optimized-${stat.key}`}
                >
                  {running ? (
                    <Skeleton width="60%" height="1.25rem" />
                  ) : value === null ? (
                    <span className="opacity-60">—</span>
                  ) : (
                    stat.format(value)
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </Card>

      <Card variant="bracket" className="p-4">
        <div className="font-mono text-[10px] tracking-[0.2em] uppercase text-[var(--color-primary)]">
          DELTA
        </div>
        <div className="mt-3 grid grid-cols-2 gap-3">
          {STATS.map((stat) => {
            if (current === null || optimized === null) {
              return (
                <div key={stat.key}>
                  <div className="font-mono text-[10px] tracking-[0.18em] uppercase text-[var(--color-muted-foreground)]">
                    {stat.label}
                  </div>
                  <div
                    className="font-mono text-xl text-[var(--color-foreground)] mt-0.5 opacity-60"
                    data-testid={`triptych-delta-${stat.key}`}
                  >
                    —
                  </div>
                </div>
              );
            }
            const cv = stat.select(current, priceCurrent);
            const ov = stat.select(optimized, priceOptimized);
            if (cv === null || ov === null) {
              return (
                <div key={stat.key}>
                  <div className="font-mono text-[10px] tracking-[0.18em] uppercase text-[var(--color-muted-foreground)]">
                    {stat.label}
                  </div>
                  <div
                    className="font-mono text-xl text-[var(--color-foreground)] mt-0.5 opacity-60"
                    data-testid={`triptych-delta-${stat.key}`}
                  >
                    —
                  </div>
                </div>
              );
            }
            const delta = ov - cv;
            return (
              <div key={stat.key}>
                <div className="font-mono text-[10px] tracking-[0.18em] uppercase text-[var(--color-muted-foreground)]">
                  {stat.label}
                </div>
                <div
                  className={`font-mono text-xl mt-0.5 ${deltaClass(delta, stat.lowerIsBetter)}`}
                  data-testid={`triptych-delta-${stat.key}`}
                >
                  {formatDelta(delta, stat)}
                </div>
              </div>
            );
          })}
        </div>
      </Card>
    </div>
  );
}
