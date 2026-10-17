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
      <div className="flex items-baseline justify-between border-b border-[var(--color-border)] pb-3">
        <div>
          <div className="text-11 text-[var(--color-muted-foreground)]">Outcome</div>
          <div className="font-bold text-xl leading-none mt-1">
            {result.killed ? (
              <span className="text-[var(--color-destructive)]">
                Killed{result.killedAt !== null ? ` · shot ${result.killedAt + 1}` : ""}
              </span>
            ) : (
              <span className="text-[var(--color-primary-text)]">Alive</span>
            )}
          </div>
        </div>
        {result.killed && <Stamp tone="red">Eliminated</Stamp>}
      </div>
      <dl className="grid grid-cols-2 gap-3">
        <SummaryStat label="Shots fired" value={`${shotsFired}`} />
        <SummaryStat label="Total flesh dmg" value={`${totalDamage.toFixed(1)} HP`} />
        {lastBodyShot && (
          <SummaryStat
            label="Body armor · rem"
            value={`${lastBodyShot.remainingDurability.toFixed(1)}`}
          />
        )}
        {lastHelmetShot && (
          <SummaryStat
            label="Helmet · rem"
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
      <dt className="text-11 text-[var(--color-muted-foreground)]">{label}</dt>
      <dd className="mt-1 font-mono text-xl tabular-nums">{value}</dd>
    </div>
  );
}
