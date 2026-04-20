import type { ScenarioShotResult } from "@tarkov/ballistics";
import { zoneLabel } from "./zoneMetadata.js";

export interface ShotTimelineProps {
  readonly shots: readonly ScenarioShotResult[];
}

/**
 * Per-shot timeline. Each row shows index, zone, pen Y/N, damage dealt,
 * armor damage, and an HP bar for the affected body part after the shot.
 */
export function ShotTimeline({ shots }: ShotTimelineProps) {
  if (shots.length === 0) {
    return <p className="text-sm text-[var(--color-muted-foreground)]">No shots executed.</p>;
  }

  return (
    <ol className="flex flex-col gap-1.5">
      {shots.map((shot, i) => {
        const part = shot.bodyAfter[shot.zone];
        const pct = part.max > 0 ? Math.max(0, Math.min(100, (part.hp / part.max) * 100)) : 0;
        return (
          <li
            key={i}
            className="flex flex-col gap-1 rounded-[var(--radius)] border px-3 py-2 text-sm"
          >
            <div className="flex items-center gap-3">
              <span className="flex-none font-mono text-xs tabular-nums text-[var(--color-muted-foreground)]">
                #{i + 1}
              </span>
              <span className="flex-none font-medium">{zoneLabel(shot.zone)}</span>
              <span
                className={
                  shot.didPenetrate
                    ? "flex-none rounded-full bg-[var(--color-primary)]/20 px-2 py-0.5 text-xs font-semibold text-[var(--color-primary)]"
                    : "flex-none rounded-full bg-[var(--color-muted)] px-2 py-0.5 text-xs"
                }
              >
                {shot.didPenetrate ? "PEN" : "blocked"}
              </span>
              <span className="flex-1 text-right text-xs text-[var(--color-muted-foreground)]">
                {shot.damage.toFixed(1)} dmg
                {shot.armorDamage > 0 ? ` · ${shot.armorDamage.toFixed(1)} armor` : ""}
                {shot.armorUsed
                  ? ` · via ${shot.armorUsed === "helmet" ? "helmet" : "body armor"}`
                  : ""}
                {shot.killed ? " · fatal" : ""}
              </span>
            </div>
            <div
              className="h-2 overflow-hidden rounded-full bg-[var(--color-muted)]"
              role="progressbar"
              aria-valuenow={Math.round(part.hp)}
              aria-valuemin={0}
              aria-valuemax={part.max}
              aria-label={`${zoneLabel(shot.zone)} HP after shot`}
            >
              <div
                className={
                  part.hp === 0
                    ? "h-full bg-[var(--color-destructive)]"
                    : "h-full bg-[var(--color-primary)]"
                }
                style={{ width: `${pct}%` }}
              />
            </div>
            <div className="text-xs text-[var(--color-muted-foreground)]">
              {zoneLabel(shot.zone)} HP: {part.hp.toFixed(0)} / {part.max}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
