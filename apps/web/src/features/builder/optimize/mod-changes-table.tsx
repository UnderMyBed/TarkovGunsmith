import type { ReactElement, ReactNode } from "react";
import { Button, Card, Pill } from "@tarkov/ui";
import type { ChangedRow, WeaponChange } from "./slot-diff.js";

export type TableMode = "idle" | "running" | "result";

/** The change in the stat the run optimised, labelled with that stat. */
export interface ScoreDelta {
  readonly label: string;
  readonly value: number;
  /** Decimals to show it with. */
  readonly digits: number;
}

export interface ModChangesTableProps {
  rows: readonly ChangedRow[];
  selected: ReadonlySet<string>;
  onToggle: (slotId: string) => void;
  onAcceptAll: () => void;
  onAcceptSelected: () => void;
  onDiscard: () => void;
  scoreDelta: ScoreDelta | null;
  mode: TableMode;
  unchangedCount: number;
  weaponChange?: WeaponChange | null;
}

function deltaDirection(delta: number, lowerIsBetter: boolean): "better" | "worse" | null {
  if (Math.abs(delta) < 0.005) return null;
  const improved = lowerIsBetter ? delta < 0 : delta > 0;
  return improved ? "better" : "worse";
}

const DIRECTION_CLASS = {
  better: "text-[var(--color-better)]",
  worse: "text-[var(--color-worse)]",
} as const;

/**
 * A delta cell. The colour is not the only signal: the direction is spoken by screen readers
 * and shown on hover as well.
 */
function DeltaCell({
  delta,
  lowerIsBetter,
  children,
}: {
  delta: number;
  lowerIsBetter: boolean;
  children: ReactNode;
}): ReactElement {
  const direction = deltaDirection(delta, lowerIsBetter);
  return (
    <span
      className={`text-right font-mono text-xs ${direction === null ? "text-[var(--color-faint)]" : DIRECTION_CLASS[direction]}`}
      title={direction ?? undefined}
    >
      {children}
      {direction !== null && <span className="sr-only"> {direction}</span>}
    </span>
  );
}

function fmtSigned(value: number, decimals = 0): string {
  if (Math.abs(value) < 0.005) return "0";
  const sign = value > 0 ? "+" : "−";
  return `${sign}${Math.abs(value).toFixed(decimals)}`;
}

function fmtPrice(value: number | null): string {
  if (value === null) return "—";
  if (Math.abs(value) < 1) return "0";
  const sign = value > 0 ? "+" : "−";
  return `${sign}${(Math.abs(value) / 1000).toFixed(1)}k`;
}

export function ModChangesTable({
  rows,
  selected,
  onToggle,
  onAcceptAll,
  onAcceptSelected,
  onDiscard,
  scoreDelta,
  mode,
  unchangedCount,
  weaponChange = null,
}: ModChangesTableProps): ReactElement {
  const cols = "grid-cols-[32px_120px_1.2fr_1.2fr_56px_56px_80px]";
  const hasRows = rows.length > 0;
  const selectedCount = selected.size;
  const isResult = mode === "result";

  return (
    <Card className="flex flex-col overflow-hidden">
      <div className="flex items-center gap-3 border-b border-[var(--color-border)] px-4 py-3">
        <span className="font-bold text-base">Mod changes</span>
        <Pill tone="accent">{rows.length} slots changed</Pill>
        <Pill tone="muted">{unchangedCount} slots unchanged</Pill>
        {scoreDelta !== null && (
          <span className="ml-auto text-11 text-[var(--color-muted-foreground)]">
            {scoreDelta.label} Δ · {scoreDelta.value >= 0 ? "+" : "−"}
            {Math.abs(scoreDelta.value).toFixed(scoreDelta.digits)}
          </span>
        )}
      </div>

      <div className={`grid ${cols} gap-2 border-b border-[var(--color-border)] px-4 py-2`}>
        <span />
        <span className="text-11 text-[var(--color-muted-foreground)]">Slot</span>
        <span className="text-11 text-[var(--color-muted-foreground)]">Current</span>
        <span className="text-11 text-[var(--color-muted-foreground)]">Suggested</span>
        <span className="text-right text-11 text-[var(--color-muted-foreground)]">Ergo</span>
        <span className="text-right text-11 text-[var(--color-muted-foreground)]">Rcl %</span>
        <span className="text-right text-11 text-[var(--color-muted-foreground)]">₽</span>
      </div>

      <div className="flex-1 overflow-y-auto overflow-x-auto max-h-[420px]">
        {mode === "idle" && (
          <p className="py-12 text-center text-xs text-[var(--color-faint)]">
            Run the solver to see proposed changes
          </p>
        )}
        {mode === "running" && (
          <p className="py-12 text-center text-xs text-[var(--color-faint)]">Running…</p>
        )}
        {isResult && !hasRows && (
          <p className="py-12 text-center text-xs text-[var(--color-faint)]">
            No improvements found · try a different objective
          </p>
        )}
        {isResult &&
          hasRows &&
          rows.map((row) => (
            <div
              key={row.slotId}
              className={`grid ${cols} items-center gap-2 border-b border-[var(--color-border)] px-4 py-2.5`}
            >
              <input
                type="checkbox"
                aria-label={`Accept ${row.slotLabel} change`}
                checked={selected.has(row.slotId)}
                onChange={() => onToggle(row.slotId)}
              />
              <span className="text-11 text-[var(--color-primary-text)]">{row.slotLabel}</span>
              <span className="text-13 text-[var(--color-faint)] line-through decoration-[var(--color-border)]">
                {row.currentName ?? "—"}
              </span>
              <span className="text-13 text-[var(--color-primary-text)]">
                → {row.proposedName ?? "— (removed)"}
              </span>
              <DeltaCell delta={row.ergoDelta} lowerIsBetter={false}>
                {fmtSigned(row.ergoDelta)}
              </DeltaCell>
              {/* `recoilDelta` is a fraction (slot-diff.ts keeps upstream's
                  unit), so it must be scaled here. Unscaled it hit fmtSigned's
                  0-decimal rounding and every changed row rendered "−0". */}
              <DeltaCell delta={row.recoilDelta * 100} lowerIsBetter>
                {fmtSigned(row.recoilDelta * 100, 1)}
              </DeltaCell>
              <DeltaCell delta={row.priceDelta ?? 0} lowerIsBetter>
                {fmtPrice(row.priceDelta)}
              </DeltaCell>
            </div>
          ))}
        {isResult && weaponChange !== null && (
          <div
            className={`grid ${cols} items-center gap-2 border-b border-[var(--color-border)] px-4 py-2.5`}
            data-testid="weapon-change"
          >
            <span />
            <span className="text-11 text-[var(--color-primary-text)]">Weapon</span>
            <span className="text-13 text-[var(--color-faint)]">bought as {weaponChange.from}</span>
            <span className="text-13 text-[var(--color-primary-text)]">
              → bought as {weaponChange.to}
            </span>
            <span />
            <span />
            <DeltaCell delta={weaponChange.priceDelta ?? 0} lowerIsBetter>
              {fmtPrice(weaponChange.priceDelta)}
            </DeltaCell>
          </div>
        )}
      </div>

      <div className="flex items-center gap-2 border-t border-[var(--color-border)] px-4 py-3">
        <Button onClick={onAcceptAll} disabled={!isResult || !hasRows}>
          Accept all
        </Button>
        <Button
          variant="secondary"
          onClick={onAcceptSelected}
          disabled={!isResult || !hasRows || selectedCount === 0}
        >
          Accept selected ({selectedCount})
        </Button>
        <Button variant="ghost" onClick={onDiscard}>
          {isResult && !hasRows ? "Back to editor" : "Discard"}
        </Button>
        <span className="ml-auto text-11 text-[var(--color-muted-foreground)]">
          DFS · linear lower-bound prune · 2s budget
        </span>
      </div>
    </Card>
  );
}
