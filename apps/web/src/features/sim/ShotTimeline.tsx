import type { ScenarioShotResult } from "@tarkov/ballistics";
import { Pill } from "@tarkov/ui";
import { zoneLabel } from "./zoneMetadata.js";

export interface ShotTimelineProps {
  readonly shots: readonly ScenarioShotResult[];
}

export function ShotTimeline({ shots }: ShotTimelineProps) {
  if (shots.length === 0) {
    return (
      <p className="font-mono text-[10px] tracking-[0.18em] uppercase text-[var(--color-muted-foreground)]">
        No shots executed.
      </p>
    );
  }
  return (
    <ol className="flex flex-col">
      {shots.map((shot, i) => {
        const part = shot.bodyAfter[shot.zone];
        const pct = part.max > 0 ? Math.max(0, Math.min(100, (part.hp / part.max) * 100)) : 0;
        const barColor =
          part.hp === 0 ? "bg-[var(--color-destructive)]" : "bg-[var(--color-primary)]";
        return (
          <li
            key={i}
            className={`flex flex-col gap-1 py-2 border-b border-dashed border-[var(--color-border)] last:border-b-0 ${
              shot.killed ? "bg-[color:rgba(185,28,28,0.05)]" : ""
            }`}
          >
            <div className="flex items-center gap-3">
              <span
                className={`font-mono text-xs tabular-nums ${
                  shot.killed ? "text-[var(--color-destructive)]" : "text-[var(--color-paper-dim)]"
                }`}
              >
                #{String(i + 1).padStart(2, "0")}
              </span>
              <span className="font-mono text-[11px] tracking-[0.15em] uppercase">
                {zoneLabel(shot.zone)}
              </span>
              <Pill tone={shot.didPenetrate ? "accent" : "muted"}>
                {shot.didPenetrate ? "PEN" : "blocked"}
              </Pill>
              <span className="flex-1 text-right font-mono text-[11px] text-[var(--color-muted-foreground)]">
                {shot.damage.toFixed(1)} dmg
                {shot.armorDamage > 0 ? ` · ${shot.armorDamage.toFixed(1)} armor` : ""}
                {shot.armorUsed
                  ? ` · via ${shot.armorUsed === "helmet" ? "helmet" : "body armor"}`
                  : ""}
                {shot.killed && (
                  <span className="ml-2 font-semibold text-[var(--color-destructive)]">
                    · FATAL
                  </span>
                )}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <div
                className="flex-1 h-1.5 bg-[var(--color-muted)] border border-[var(--color-line-muted)] overflow-hidden"
                role="progressbar"
                aria-valuenow={Math.round(part.hp)}
                aria-valuemin={0}
                aria-valuemax={part.max}
              >
                <div className={`h-full ${barColor}`} style={{ width: `${pct}%` }} />
              </div>
              <div className="font-mono text-[10px] tabular-nums text-[var(--color-paper-dim)] min-w-[56px] text-right">
                {part.hp.toFixed(0)}/{part.max}
              </div>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
