import type { PlannedShot } from "@tarkov/ballistics";
import { Button } from "@tarkov/ui";
import { zoneLabel } from "./zoneMetadata.js";

interface ShotQueueProps {
  plan: readonly PlannedShot[];
  onMove: (from: number, to: number) => void;
  onRemove: (index: number) => void;
  onClear: () => void;
}

/**
 * Ordered shot plan queue. Renders each planned shot as a row with zone
 * label, reorder buttons, and a remove button. Shows helper copy when empty.
 *
 * @example
 *   <ShotQueue plan={plan} onMove={move} onRemove={remove} onClear={clear} />
 */
export function ShotQueue({ plan, onMove, onRemove, onClear }: ShotQueueProps) {
  if (plan.length === 0) {
    return (
      <p className="text-sm text-[var(--color-muted-foreground)]">
        Click a zone on the silhouette to add shots to your plan.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <ol className="flex flex-col gap-1">
        {plan.map((shot, i) => (
          <li
            key={i}
            className="flex items-center gap-2 rounded-[var(--radius)] border px-3 py-1.5 text-sm"
          >
            <span className="min-w-[4rem] font-medium">{zoneLabel(shot.zone)}</span>
            <span className="flex-1 text-xs text-[var(--color-muted-foreground)]">
              {shot.distance}m
            </span>
            <Button
              size="sm"
              variant="ghost"
              aria-label="Move shot up"
              disabled={i === 0}
              onClick={() => onMove(i, i - 1)}
            >
              ↑
            </Button>
            <Button
              size="sm"
              variant="ghost"
              aria-label="Move shot down"
              disabled={i === plan.length - 1}
              onClick={() => onMove(i, i + 1)}
            >
              ↓
            </Button>
            <Button size="sm" variant="ghost" aria-label="Remove shot" onClick={() => onRemove(i)}>
              ×
            </Button>
          </li>
        ))}
      </ol>
      <Button size="sm" variant="secondary" onClick={onClear}>
        Clear
      </Button>
    </div>
  );
}
