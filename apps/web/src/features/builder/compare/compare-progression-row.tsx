import type { ReactElement } from "react";
import type { BuildPrice } from "@tarkov/data";
import { Pill } from "@tarkov/ui";
import { describeBuildPrice, type PricesStatus } from "../build-price.js";
import { PricesLine } from "../prices-line.js";

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
  /** Where live prices stand. Without them every total is unknown, so none is shown. */
  prices: PricesStatus;
  /** Names an item id in a side's cost line. */
  nameOf: (id: string) => string;
}

function SidePill({
  side,
  pricesReady,
  nameOf,
}: {
  side: CompareSidePrice;
  pricesReady: boolean;
  nameOf: (id: string) => string;
}) {
  const { price, gated } = side;
  // The Builder's own cost line, hedges and all, so one build reads the same on both pages.
  const text = price !== null && pricesReady ? describeBuildPrice(price, nameOf) : "—";
  return (
    <span className="flex items-baseline gap-3 font-mono text-sm tabular-nums">
      <span>{text}</span>
      {/* Unlisted flea entries are only known once prices are in: before then a lock is a guess. */}
      {pricesReady && gated && price?.status === "unobtainable" && <Pill tone="muted">Locked</Pill>}
      {pricesReady && gated && price !== null && price.status !== "unobtainable" && (
        <Pill tone="reliable">Reachable</Pill>
      )}
    </span>
  );
}

/**
 * Each side's cost: the weapon by its cheapest path plus the parts that path does not come
 * with, under the side's own profile, or every gate open when it has none.
 */
export function CompareProgressionRow(props: CompareProgressionRowProps): ReactElement {
  const pricesReady = props.prices.state === "ready";
  return (
    <div className="flex flex-col gap-1 border-t border-[var(--color-border)] py-2">
      <div className="flex items-center justify-between text-sm" data-testid="compare-price-row">
        <SidePill side={props.left} pricesReady={pricesReady} nameOf={props.nameOf} />
        <SidePill side={props.right} pricesReady={pricesReady} nameOf={props.nameOf} />
      </div>
      <PricesLine prices={props.prices} />
    </div>
  );
}
