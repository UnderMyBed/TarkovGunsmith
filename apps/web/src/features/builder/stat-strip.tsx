import type { ReactNode } from "react";
import type { WeaponSpec } from "@tarkov/ballistics";
import type { BuildPrice } from "@tarkov/data";
import { Button } from "@tarkov/ui";
import { buildPriceParts, formatRub, totalOf, type PricesStatus } from "./build-price.js";
import { ergonomicsFloorNote, shownErgonomics } from "./ergonomics.js";
import { signedPercent } from "./details-panel.js";
import { Delta, type Direction } from "./delta.js";

export interface StatStripProps {
  /** Current build spec (weapon + current mods). */
  spec: WeaponSpec;
  /** Stock-weapon spec (no mods): what each delta is measured against. */
  stockSpec: WeaponSpec | null;
  /** Where live prices stand. */
  prices: PricesStatus;
  /** What the build costs, once it can be worked out. */
  buildPrice: BuildPrice | null;
  /** The preset the cost buys the weapon as, when it is one. */
  boughtAs: string | null;
  /** Names an item id in the cost line. */
  nameOf: (id: string) => string;
  /** Opens the optimizer. Omitted, the strip offers no Optimize (the optimizer is open). */
  onOptimize?: (() => void) | undefined;
  /**
   * A build the optimizer proposes. Given, each figure is the proposal's, set against the
   * current build's (`spec`, `buildPrice`) rather than the stock weapon's.
   */
  proposal?: StripProposal | undefined;
  /** Where the optimizer stands, at the strip's end in place of Optimize. */
  status?: ReactNode;
}

export interface StripProposal {
  readonly spec: WeaponSpec;
  /** `null` until it can be worked out. */
  readonly buildPrice: BuildPrice | null;
  readonly boughtAs: string | null;
}

/** To one decimal, dropping a trailing ".0" (119, not 119.0). */
export function oneDecimal(value: number): string {
  return String(Number(value.toFixed(1)));
}

/**
 * A signed difference with a real minus sign, to `decimals` places: "+2.10", "−48". `trim` drops
 * trailing zeros, for figures shown that way ("+7", "+0.5"). Blank under half the last place, so
 * a rounded "+0" never shows.
 */
export function formatDelta(delta: number, decimals: number, trim = false): string {
  if (Math.abs(delta) < 0.5 * 10 ** -decimals) return "";
  const fixed = Math.abs(delta).toFixed(decimals);
  const magnitude = trim ? String(Number(fixed)) : fixed;
  return `${delta > 0 ? "+" : "−"}${magnitude}`;
}

/** The change from `stock` to `current` as a whole percent: "−34%"; blank under half a percent. */
export function formatPercent(current: number, stock: number): string {
  if (stock === 0) return "";
  const pct = ((current - stock) / stock) * 100;
  if (Math.abs(pct) < 0.5) return "";
  return `${pct > 0 ? "+" : "−"}${Math.abs(pct).toFixed(0)}%`;
}

/** Whether a change of `delta` is an improvement, where a higher figure may be the worse one. */
export function direction(delta: number, higherIsWorse: boolean): Direction {
  if (Math.abs(delta) < 0.005) return null;
  return delta > 0 !== higherIsWorse ? "better" : "worse";
}

function Cell({
  label,
  value,
  unit,
  title,
  sub,
  testId,
}: {
  label: string;
  value: string;
  unit?: string;
  /** What the value leaves out, on hover. */
  title?: string | undefined;
  sub?: ReactNode;
  testId?: string;
}) {
  return (
    <div
      data-testid={testId}
      className="flex min-w-0 flex-[1_1_150px] flex-col gap-1 border-b border-r border-[var(--color-border)] px-3 py-2.5 sm:px-6 sm:py-3"
    >
      <dt className="text-12 font-medium text-[var(--color-muted-foreground)]">{label}</dt>
      <dd
        title={title}
        className="break-words font-mono text-20 font-medium leading-tight tabular-nums text-[var(--color-foreground)] sm:text-[28px]"
      >
        {value}
        {unit !== undefined && (
          <span className="text-13 text-[var(--color-muted-foreground)]"> {unit}</span>
        )}
      </dd>
      {sub !== undefined && (
        <dd className="break-words text-12 text-[var(--color-muted-foreground)]">{sub}</dd>
      )}
    </div>
  );
}

/** "48 stock", then the delta against it, numbers in the numeric face. */
function AgainstStock({ stock, delta, dir }: { stock: string; delta: string; dir: Direction }) {
  return (
    <>
      <span className="font-mono tabular-nums">{stock}</span> stock{" "}
      <span className="font-mono tabular-nums">
        <Delta text={delta} dir={dir} />
      </span>
    </>
  );
}

/** "was 48", then the delta from it, numbers in the numeric face. */
function AgainstCurrent({ was, delta, dir }: { was: string; delta: string; dir: Direction }) {
  return (
    <>
      was <span className="font-mono tabular-nums">{was}</span>{" "}
      <span className="font-mono tabular-nums">
        <Delta text={delta} dir={dir} />
      </span>
    </>
  );
}

/**
 * The workbench's stat strip: the six figures a build is judged by, each with its stock value and
 * a delta coloured, and named, better or worse. The Optimize action sits at its end. On a phone
 * the figures form a 3×2 grid, and Optimize is the bottom bar's (`phone-action-bar.tsx`).
 *
 * Ergonomics is the figure the game uses, floored at 0 (`ergonomics.ts`), and its delta compares
 * floored values. Accuracy has no stock: the bare receiver's MOA has no barrel in it, so every
 * real build would read as a regression against it. The cost appears once prices are in, and
 * sets only its rouble figure in the numeric face.
 */
export function StatStrip({
  spec,
  stockSpec,
  prices,
  buildPrice,
  boughtAs,
  nameOf,
  onOptimize,
  proposal,
  status,
}: StatStripProps) {
  const end =
    onOptimize !== undefined ? (
      <div className="flex flex-[0_0_auto] items-center px-4 py-3 sm:px-6">
        <Button
          variant="secondary"
          className="h-12 border-2 border-[var(--color-primary)] px-5 text-base font-bold text-[var(--color-primary-text)]"
          onClick={onOptimize}
        >
          <svg aria-hidden width="14" height="14" viewBox="0 0 14 14" fill="none">
            <path d="M7 1l6 6-6 6-6-6z" stroke="currentColor" strokeWidth="1.6" />
          </svg>
          Optimize
        </Button>
      </div>
    ) : status !== undefined ? (
      // On a phone the status takes a full-width row under the 3×2 grid.
      <div className="flex min-w-0 flex-[0_0_auto] flex-col justify-center gap-1 px-4 py-3 text-12 max-sm:flex-[1_1_100%] sm:px-6">
        {status}
      </div>
    ) : null;

  if (proposal !== undefined) {
    return (
      <ProposalStrip
        current={spec}
        currentPrice={buildPrice}
        proposal={proposal}
        prices={prices}
        nameOf={nameOf}
        end={end}
      />
    );
  }

  const ergo = shownErgonomics(spec.ergonomics);
  const stockErgo = stockSpec === null ? null : shownErgonomics(stockSpec.ergonomics);

  const vs = (stock: number | null, render: (stock: number) => ReactNode) =>
    stock === null ? undefined : render(stock);

  return (
    <section
      aria-label="Build stats"
      className="flex flex-wrap items-stretch border-b border-[var(--color-border)] bg-[var(--color-muted)]"
    >
      <dl className="-mb-px flex min-w-0 flex-[1_1_640px] flex-wrap max-sm:grid max-sm:grid-cols-3">
        <Cell
          label="Ergonomics"
          value={oneDecimal(ergo)}
          title={ergonomicsFloorNote(spec.ergonomics)}
          sub={vs(stockErgo, (s) => (
            <AgainstStock
              stock={oneDecimal(s)}
              delta={formatDelta(ergo - s, 1, true)}
              dir={direction(ergo - s, false)}
            />
          ))}
        />
        <Cell
          label="Vertical recoil"
          value={oneDecimal(spec.verticalRecoil)}
          sub={vs(stockSpec?.verticalRecoil ?? null, (s) => (
            <AgainstStock
              stock={oneDecimal(s)}
              delta={formatPercent(spec.verticalRecoil, s)}
              dir={direction(spec.verticalRecoil - s, true)}
            />
          ))}
        />
        <Cell
          label="Horizontal recoil"
          value={oneDecimal(spec.horizontalRecoil)}
          sub={vs(stockSpec?.horizontalRecoil ?? null, (s) => (
            <AgainstStock
              stock={oneDecimal(s)}
              delta={formatPercent(spec.horizontalRecoil, s)}
              dir={direction(spec.horizontalRecoil - s, true)}
            />
          ))}
        />
        <Cell
          label="Weight"
          value={spec.weight.toFixed(2)}
          unit="kg"
          sub={vs(stockSpec?.weight ?? null, (s) => (
            <AgainstStock
              stock={s.toFixed(2)}
              delta={formatDelta(spec.weight - s, 2)}
              dir={direction(spec.weight - s, true)}
            />
          ))}
        />
        <Cell
          label="Accuracy"
          value={spec.accuracy.toFixed(2)}
          unit="MOA"
          sub={`base ${spec.baseMoa.toFixed(2)} · accuracy ${signedPercent(spec.accuracyModifier * 100)}`}
        />
        <CostCell prices={prices} buildPrice={buildPrice} boughtAs={boughtAs} nameOf={nameOf} />
      </dl>
      {end}
    </section>
  );
}

/**
 * The strip while a proposal shows: the proposed build's figures, each against the current
 * build's. Ergonomics is floored as everywhere (`ergonomics.ts`), its delta too.
 */
function ProposalStrip({
  current,
  currentPrice,
  proposal,
  prices,
  nameOf,
  end,
}: {
  current: WeaponSpec;
  currentPrice: BuildPrice | null;
  proposal: StripProposal;
  prices: PricesStatus;
  nameOf: (id: string) => string;
  end: ReactNode;
}) {
  const next = proposal.spec;
  const ergo = shownErgonomics(next.ergonomics);
  const was = shownErgonomics(current.ergonomics);
  const one = (value: number, from: number, higherIsWorse: boolean) => (
    <AgainstCurrent
      was={oneDecimal(from)}
      delta={formatDelta(value - from, 1, true)}
      dir={direction(value - from, higherIsWorse)}
    />
  );
  const two = (value: number, from: number) => (
    <AgainstCurrent
      was={from.toFixed(2)}
      delta={formatDelta(value - from, 2)}
      dir={direction(value - from, true)}
    />
  );
  return (
    <section
      aria-label="Build stats, proposed"
      className="flex flex-wrap items-stretch border-b border-[var(--color-border)] bg-[var(--color-muted)]"
    >
      <dl className="-mb-px flex min-w-0 flex-[1_1_640px] flex-wrap max-sm:grid max-sm:grid-cols-3">
        <Cell
          label="Ergonomics"
          value={oneDecimal(ergo)}
          title={ergonomicsFloorNote(next.ergonomics)}
          sub={one(ergo, was, false)}
        />
        <Cell
          label="Vertical recoil"
          value={oneDecimal(next.verticalRecoil)}
          sub={one(next.verticalRecoil, current.verticalRecoil, true)}
        />
        <Cell
          label="Horizontal recoil"
          value={oneDecimal(next.horizontalRecoil)}
          sub={one(next.horizontalRecoil, current.horizontalRecoil, true)}
        />
        <Cell
          label="Weight"
          value={next.weight.toFixed(2)}
          unit="kg"
          sub={two(next.weight, current.weight)}
        />
        <Cell
          label="Accuracy"
          value={next.accuracy.toFixed(2)}
          unit="MOA"
          sub={two(next.accuracy, current.accuracy)}
        />
        <ProposedCostCell
          prices={prices}
          current={currentPrice}
          proposal={proposal}
          nameOf={nameOf}
        />
      </dl>
      {end}
    </section>
  );
}

/** "₽787.0k": a rouble difference, to the nearest hundred. */
export function formatRubDelta(delta: number): string {
  if (Math.abs(delta) < 50) return "";
  return `${delta > 0 ? "+" : "−"}${(Math.abs(delta) / 1000).toFixed(1)}k`;
}

function ProposedCostCell({
  prices,
  current,
  proposal,
  nameOf,
}: {
  prices: PricesStatus;
  current: BuildPrice | null;
  proposal: StripProposal;
  nameOf: (id: string) => string;
}) {
  if (prices.state !== "ready" || proposal.buildPrice === null) {
    return <CostCell prices={prices} buildPrice={null} boughtAs={null} nameOf={nameOf} />;
  }
  const { figure, note } = buildPriceParts(proposal.buildPrice, nameOf);
  const from = totalOf(current);
  const to = totalOf(proposal.buildPrice);
  const as =
    proposal.buildPrice.status !== "unobtainable" && proposal.boughtAs !== null
      ? `as the ${proposal.boughtAs} preset`
      : null;
  const against =
    from === null ? null : (
      <AgainstCurrent
        was={formatRub(from)}
        delta={to === null ? "" : formatRubDelta(to - from)}
        dir={to === null ? null : direction(to - from, true)}
      />
    );
  const rest = [as, note].filter((s): s is string => s !== null).join(" · ");
  return (
    <Cell
      testId="build-cost"
      label="Cost"
      value={figure ?? "—"}
      sub={
        against === null && rest === "" ? undefined : (
          <>
            {against}
            {against !== null && rest !== "" && " · "}
            {rest}
          </>
        )
      }
    />
  );
}

function CostCell({
  prices,
  buildPrice,
  boughtAs,
  nameOf,
}: Pick<StatStripProps, "prices" | "buildPrice" | "boughtAs" | "nameOf">) {
  if (prices.state !== "ready" || buildPrice === null) {
    return (
      <Cell
        label="Cost"
        value="—"
        sub={
          prices.state === "error"
            ? "No prices"
            : prices.state === "loading"
              ? "Waiting for prices"
              : "Pricing…"
        }
      />
    );
  }
  const { figure, note } = buildPriceParts(buildPrice, nameOf);
  const as =
    buildPrice.status !== "unobtainable" && boughtAs !== null ? `as the ${boughtAs} preset` : null;
  const sub = [as, note].filter((s): s is string => s !== null).join(" · ");
  return (
    <Cell
      testId="build-cost"
      label="Cost"
      value={figure ?? "—"}
      sub={sub === "" ? undefined : sub}
    />
  );
}
