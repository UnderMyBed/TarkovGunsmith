import type { ReactElement } from "react";
import { Stamp } from "@tarkov/ui";
import { statDelta } from "@tarkov/data";

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

export function CompareStatDelta({ left, right }: CompareStatDeltaProps): ReactElement {
  if (!left || !right) {
    return (
      <div className="border border-dashed border-[var(--color-border)] p-4 text-center text-sm text-[var(--color-muted-foreground)]">
        Add a second build to see deltas.
      </div>
    );
  }

  const rows = statDelta(left, right);
  const allEqual = rows.every((r) => r.delta === 0 || r.direction === "unavailable");

  if (allEqual) {
    return (
      <div className="flex justify-center py-6">
        <Stamp tone="amber">BUILDS ARE IDENTICAL</Stamp>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-[1fr_auto_auto_auto] gap-x-6 gap-y-2 font-mono text-sm">
      {rows.map((r) => (
        <div key={r.key} className="contents">
          <span className="text-[var(--color-muted-foreground)] uppercase tracking-wider">
            {r.label}
          </span>
          <span className="text-right tabular-nums">{formatNum(r.left)}</span>
          <span className="text-right tabular-nums">{formatNum(r.right)}</span>
          <span
            data-direction={r.direction}
            className="text-right tabular-nums data-[direction=better]:text-[var(--color-primary)] data-[direction=worse]:text-[var(--color-destructive)]"
          >
            {formatDelta(r.delta)}
          </span>
        </div>
      ))}
    </div>
  );
}
