import type { ScenarioResult } from "@tarkov/ballistics";
import { Stamp } from "@tarkov/ui";
import type { ReactNode } from "react";

export interface ScenarioSummaryProps {
  readonly result: ScenarioResult;
}

export function ScenarioSummary({ result }: ScenarioSummaryProps) {
  const shotsFired = result.shots.length;
  const totalDamage = result.shots.reduce((sum, s) => sum + s.damage, 0);
  const lastHelmetShot = [...result.shots].reverse().find((s) => s.armorUsed === "helmet");
  const lastBodyShot = [...result.shots].reverse().find((s) => s.armorUsed === "bodyArmor");

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-baseline justify-between border-b border-dashed border-[var(--color-border)] pb-3">
        <div>
          <div className="font-mono text-[10px] tracking-[0.2em] uppercase text-[var(--color-muted-foreground)]">
            OUTCOME
          </div>
          <div className="font-display text-xl leading-none mt-1 uppercase">
            {result.killed ? (
              <span className="text-[var(--color-destructive)]">
                Killed{result.killedAt !== null ? ` · shot ${result.killedAt + 1}` : ""}
              </span>
            ) : (
              <span className="text-[var(--color-primary)]">Alive</span>
            )}
          </div>
        </div>
        {result.killed && <Stamp tone="red">ELIMINATED</Stamp>}
      </div>
      <dl className="grid grid-cols-2 gap-3">
        <SummaryStat label="SHOTS FIRED" value={`${shotsFired}`} />
        <SummaryStat label="TOTAL FLESH DMG" value={`${totalDamage.toFixed(1)} HP`} />
        {lastBodyShot && (
          <SummaryStat
            label="BODY ARMOR · REM"
            value={`${lastBodyShot.remainingDurability.toFixed(1)}`}
          />
        )}
        {lastHelmetShot && (
          <SummaryStat
            label="HELMET · REM"
            value={`${lastHelmetShot.remainingDurability.toFixed(1)}`}
          />
        )}
      </dl>
    </div>
  );
}

function SummaryStat({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="border border-[var(--color-border)] p-3">
      <dt className="font-mono text-[10px] tracking-[0.2em] uppercase text-[var(--color-muted-foreground)]">
        {label}
      </dt>
      <dd className="mt-1 font-mono text-xl tabular-nums">{value}</dd>
    </div>
  );
}
