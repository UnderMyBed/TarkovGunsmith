import type { ReactElement } from "react";
import { Stamp } from "@tarkov/ui";
import { statDelta } from "@tarkov/data";
import { ergonomicsFloorNote, shownErgonomics } from "../ergonomics.js";

type Stats = NonNullable<Parameters<typeof statDelta>[0]>;

interface CompareStatDeltaProps {
  left: Stats | null;
  right: Stats | null;
}

function formatNum(n: number | null): string {
  if (n === null) return "—";
  return Number.isInteger(n) ? n.toLocaleString() : n.toFixed(2);
}

function formatDelta(d: number | null): string {
  if (d === null) return "—";
  if (d === 0) return "±0";
  const sign = d > 0 ? "+" : "−";
  const abs = Math.abs(d);
  return `${sign}${Number.isInteger(abs) ? abs.toLocaleString() : abs.toFixed(2)}`;
}

/** "better" / "worse" for a delta that has a direction, so it is not carried by colour alone. */
function directionWord(direction: string): "better" | "worse" | undefined {
  return direction === "better" || direction === "worse" ? direction : undefined;
}

/** The side as the game handles it: ergonomics floored at 0, so the delta compares that. */
function asShown(stats: Stats): Stats {
  return stats.ergonomics === undefined
    ? stats
    : { ...stats, ergonomics: shownErgonomics(stats.ergonomics) };
}

/** The raw ergonomics behind a floored side, for its cell's `title`. */
function floorNote(stats: Stats, key: string): string | undefined {
  return key === "ergonomics" && stats.ergonomics !== undefined
    ? ergonomicsFloorNote(stats.ergonomics)
    : undefined;
}

export function CompareStatDelta({ left, right }: CompareStatDeltaProps): ReactElement {
  if (!left || !right) {
    return (
      <div className="border border-[var(--color-border)] p-4 text-center text-sm text-[var(--color-muted-foreground)]">
        Add a second build to see deltas.
      </div>
    );
  }

  const rows = statDelta(asShown(left), asShown(right));
  const allEqual = rows.every((r) => r.delta === 0 || r.direction === "unavailable");

  if (allEqual) {
    return (
      <div className="flex justify-center py-6">
        <Stamp tone="accent">Builds are identical</Stamp>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-[1fr_auto_auto_auto] gap-x-6 gap-y-2 text-sm">
      {rows.map((r) => (
        <div key={r.key} className="contents">
          <span className="text-[var(--color-muted-foreground)]">{r.label}</span>
          <span className="text-right font-mono tabular-nums" title={floorNote(left, r.key)}>
            {formatNum(r.left)}
          </span>
          <span className="text-right font-mono tabular-nums" title={floorNote(right, r.key)}>
            {formatNum(r.right)}
          </span>
          <span
            data-direction={r.direction}
            className="text-right font-mono tabular-nums data-[direction=better]:text-[var(--color-better)] data-[direction=worse]:text-[var(--color-worse)]"
            title={directionWord(r.direction)}
          >
            {formatDelta(r.delta)}
            {/* The colour is not the only signal: the direction is spoken and on hover too. */}
            {directionWord(r.direction) !== undefined && (
              <span className="sr-only"> {directionWord(r.direction)}</span>
            )}
          </span>
        </div>
      ))}
    </div>
  );
}
