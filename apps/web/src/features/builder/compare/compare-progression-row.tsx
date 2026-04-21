import type { ReactElement } from "react";
import { Pill } from "@tarkov/ui";

interface CompareProgressionRowProps {
  leftPriceRub: number | null;
  rightPriceRub: number | null;
  leftReachable: boolean | null;
  rightReachable: boolean | null;
}

function formatPrice(rub: number | null): string {
  if (rub === null) return "—";
  return `₽${rub.toLocaleString()}`;
}

function SidePill({
  priceRub,
  reachable,
}: {
  priceRub: number | null;
  reachable: boolean | null;
}): ReactElement {
  return (
    <span className="flex items-baseline gap-3 font-mono text-sm tabular-nums">
      <span>{formatPrice(priceRub)}</span>
      {reachable === false && <Pill tone="muted">LOCKED</Pill>}
      {reachable === true && <Pill tone="reliable">REACHABLE</Pill>}
    </span>
  );
}

export function CompareProgressionRow(props: CompareProgressionRowProps): ReactElement {
  return (
    <div className="flex items-center justify-between border-t border-dashed border-[var(--color-border)] py-2 text-sm">
      <SidePill priceRub={props.leftPriceRub} reachable={props.leftReachable} />
      <SidePill priceRub={props.rightPriceRub} reachable={props.rightReachable} />
    </div>
  );
}
