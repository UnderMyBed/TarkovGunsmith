import type { ReactElement } from "react";
import type { BuildPrice } from "@tarkov/data";
import { Pill } from "@tarkov/ui";
import { formatRub } from "../build-price.js";

/** One side's cost, under that side's profile, or `null` gates in theorycraft. */
export interface CompareSidePrice {
  /** `null` until the side's build, weapon and parts load, or with no build. */
  readonly price: BuildPrice | null;
  /** Whether the side carries a profile: only then is "reachable" a claim worth making. */
  readonly gated: boolean;
}

interface CompareProgressionRowProps {
  left: CompareSidePrice;
  right: CompareSidePrice;
  /** Without live prices every total is unknown, so none is shown. */
  pricesReady: boolean;
}

function SidePill({ side, pricesReady }: { side: CompareSidePrice; pricesReady: boolean }) {
  const { price, gated } = side;
  let text = "—";
  if (price !== null && pricesReady) {
    if (price.status === "priced") text = formatRub(price.totalRUB);
    else if (price.status === "unknown") text = `${formatRub(price.knownRUB)}+`;
  }
  return (
    <span className="flex items-baseline gap-3 font-mono text-sm tabular-nums">
      <span>{text}</span>
      {pricesReady && price?.status === "unknown" && (
        <Pill tone="muted">{price.unpriced.length} UNPRICED</Pill>
      )}
      {/* Unlisted flea entries are only known once prices are in: before then a lock is a guess. */}
      {pricesReady && gated && price?.status === "unobtainable" && <Pill tone="muted">LOCKED</Pill>}
      {pricesReady && gated && price !== null && price.status !== "unobtainable" && (
        <Pill tone="reliable">REACHABLE</Pill>
      )}
    </span>
  );
}

/**
 * Each side's cost: the weapon by its cheapest path plus the parts that path does not come
 * with, under the side's own profile, or every gate open when it has none.
 */
export function CompareProgressionRow(props: CompareProgressionRowProps): ReactElement {
  return (
    <div
      className="flex items-center justify-between border-t border-dashed border-[var(--color-border)] py-2 text-sm"
      data-testid="compare-price-row"
    >
      <SidePill side={props.left} pricesReady={props.pricesReady} />
      <SidePill side={props.right} pricesReady={props.pricesReady} />
    </div>
  );
}
