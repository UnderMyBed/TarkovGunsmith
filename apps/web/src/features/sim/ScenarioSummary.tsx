import type { ScenarioResult } from "@tarkov/ballistics";

export interface ScenarioSummaryProps {
  readonly result: ScenarioResult;
}

/**
 * Top-line summary card. Shows kill outcome, shots fired, shots-to-kill,
 * total flesh damage, and final armor durabilities (if armor was involved).
 */
export function ScenarioSummary({ result }: ScenarioSummaryProps) {
  const shotsFired = result.shots.length;
  const totalDamage = result.shots.reduce((sum, s) => sum + s.damage, 0);

  // Final armor durabilities: look at the last shot that used each piece.
  const lastHelmetShot = [...result.shots].reverse().find((s) => s.armorUsed === "helmet");
  const lastBodyShot = [...result.shots].reverse().find((s) => s.armorUsed === "bodyArmor");

  const killedRow = result.killed ? (
    <span className="font-semibold text-[var(--color-destructive)]">
      Killed{result.killedAt !== null ? ` on shot ${result.killedAt + 1}` : ""}
    </span>
  ) : (
    <span className="font-semibold text-[var(--color-primary)]">Alive</span>
  );

  return (
    <dl className="grid gap-2 sm:grid-cols-2">
      <Stat label="Outcome" value={killedRow} />
      <Stat label="Shots fired" value={`${shotsFired}`} />
      <Stat label="Total flesh damage" value={`${totalDamage.toFixed(1)} HP`} />
      {lastBodyShot && (
        <Stat
          label="Body armor durability"
          value={`${lastBodyShot.remainingDurability.toFixed(1)} pts`}
        />
      )}
      {lastHelmetShot && (
        <Stat
          label="Helmet durability"
          value={`${lastHelmetShot.remainingDurability.toFixed(1)} pts`}
        />
      )}
    </dl>
  );
}

function Stat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5 rounded-[var(--radius)] border p-3">
      <dt className="text-xs uppercase tracking-wide text-[var(--color-muted-foreground)]">
        {label}
      </dt>
      <dd>{value}</dd>
    </div>
  );
}
