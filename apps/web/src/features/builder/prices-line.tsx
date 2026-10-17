import type { PricesStatus } from "./build-price.js";

const PRICE_TIME = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "UTC",
  timeZoneName: "short",
});

const META = "text-11 text-[var(--color-muted-foreground)]";

/**
 * Where live prices stand, in one line: loading, how old they are, or why there are none. The
 * Builder's weapon panel and Compare show the same line, so a missing price always has a reason.
 */
export function PricesLine({ prices }: { prices: PricesStatus }) {
  if (prices.state === "loading") return <p className={META}>Prices loading…</p>;
  if (prices.state === "error") {
    return (
      <p className="text-11 text-[var(--color-destructive)]">
        Prices unavailable: {prices.message}
      </p>
    );
  }
  return (
    <p className={META}>
      Prices as of <time dateTime={prices.asOf}>{PRICE_TIME.format(new Date(prices.asOf))}</time>
    </p>
  );
}
