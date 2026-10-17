import type { ReactNode } from "react";
import type { WeaponSpec } from "@tarkov/ballistics";
import type { BuildPrice } from "@tarkov/data";
import { Button, cn } from "@tarkov/ui";
import { buildPriceParts, type PricesStatus } from "./build-price.js";
import { ergonomicsFloorNote, shownErgonomics } from "./ergonomics.js";
import { signedPercent } from "./details-panel.js";

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
}

type Direction = "better" | "worse" | null;

/** To one decimal, dropping a trailing ".0" (119, not 119.0). */
export function oneDecimal(value: number): string {
  return String(Number(value.toFixed(1)));
}

/** A signed difference with a real minus sign: "+7", "−48", "+2.10"; blank under 0.005. */
export function formatDelta(delta: number, decimals: number): string {
  if (Math.abs(delta) < 0.005) return "";
  const magnitude =
    decimals === 0 ? String(Math.round(Math.abs(delta))) : Math.abs(delta).toFixed(decimals);
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

function Delta({ text, dir }: { text: string; dir: Direction }) {
  if (text === "") return null;
  return (
    <span
      className={cn(
        "font-semibold",
        dir === "better" && "text-[var(--color-better)]",
        dir === "worse" && "text-[var(--color-worse)]",
      )}
      title={dir ?? undefined}
    >
      {text}
      {/* The colour is not the only signal: the direction is spoken and on hover too. */}
      {dir !== null && <span className="sr-only"> {dir}</span>}
    </span>
  );
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
      className="flex min-w-0 flex-[1_1_150px] flex-col gap-1 border-b border-r border-[var(--color-border)] px-4 py-3 sm:px-6"
    >
      <dt className="text-12 font-medium text-[var(--color-muted-foreground)]">{label}</dt>
      <dd
        title={title}
        className="font-mono text-[28px] font-medium leading-tight tabular-nums text-[var(--color-foreground)]"
      >
        {value}
        {unit !== undefined && (
          <span className="text-13 text-[var(--color-muted-foreground)]"> {unit}</span>
        )}
      </dd>
      {sub !== undefined && <dd className="text-12 text-[var(--color-muted-foreground)]">{sub}</dd>}
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

/**
 * The workbench's stat strip: the six figures a build is judged by, each with its stock value and
 * a delta coloured, and named, better or worse. The Optimize action sits at its end.
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
}: StatStripProps) {
  const ergo = shownErgonomics(spec.ergonomics);
  const stockErgo = stockSpec === null ? null : shownErgonomics(stockSpec.ergonomics);

  const vs = (stock: number | null, render: (stock: number) => ReactNode) =>
    stock === null ? undefined : render(stock);

  return (
    <section
      aria-label="Build stats"
      className="flex flex-wrap items-stretch border-b border-[var(--color-border)] bg-[var(--color-muted)]"
    >
      <dl className="-mb-px flex min-w-0 flex-[1_1_640px] flex-wrap">
        <Cell
          label="Ergonomics"
          value={oneDecimal(ergo)}
          title={ergonomicsFloorNote(spec.ergonomics)}
          sub={vs(stockErgo, (s) => (
            <AgainstStock
              stock={oneDecimal(s)}
              delta={formatDelta(ergo - s, 0)}
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
      {onOptimize && (
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
      )}
    </section>
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
        sub={prices.state === "error" ? "No prices" : "Waiting for prices"}
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
