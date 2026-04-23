import type { ReactElement } from "react";
import { Button, Card, Pill } from "@tarkov/ui";
import type { ChangedRow } from "./slot-diff.js";

export type TableMode = "idle" | "running" | "result";

export interface ModChangesTableProps {
  rows: readonly ChangedRow[];
  selected: ReadonlySet<string>;
  onToggle: (slotId: string) => void;
  onAcceptAll: () => void;
  onAcceptSelected: () => void;
  onDiscard: () => void;
  scoreDelta: number | null;
  mode: TableMode;
  unchangedCount: number;
}

function deltaClass(delta: number, lowerIsBetter: boolean): string {
  if (Math.abs(delta) < 0.005) return "text-[var(--color-paper-dim)]";
  const improved = lowerIsBetter ? delta < 0 : delta > 0;
  return improved ? "text-[var(--color-olive)]" : "text-[var(--color-destructive)]";
}

function fmtSigned(value: number, decimals = 0): string {
  if (Math.abs(value) < 0.005) return "0";
  const sign = value > 0 ? "+" : "−";
  return `${sign}${Math.abs(value).toFixed(decimals)}`;
}

function fmtPrice(value: number): string {
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
}: ModChangesTableProps): ReactElement {
  const cols = "grid-cols-[32px_120px_1.2fr_1.2fr_56px_56px_80px]";
  const hasRows = rows.length > 0;
  const selectedCount = selected.size;
  const isResult = mode === "result";

  return (
    <Card variant="bracket" className="flex flex-col overflow-hidden">
      <div className="flex items-center gap-3 border-b border-dashed border-[var(--color-border)] px-4 py-3">
        <span className="font-display text-base tracking-wide">MOD CHANGES</span>
        <Pill tone="accent">{rows.length} SLOTS CHANGED</Pill>
        <Pill tone="muted">{unchangedCount} SLOTS UNCHANGED</Pill>
        {scoreDelta !== null && (
          <span className="ml-auto font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--color-muted-foreground)]">
            SCORE Δ · {scoreDelta >= 0 ? "+" : "−"}
            {Math.abs(scoreDelta).toFixed(2)}
          </span>
        )}
      </div>

      <div className={`grid ${cols} gap-2 border-b border-[var(--color-border)] px-4 py-2`}>
        <span />
        <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--color-muted-foreground)]">
          SLOT
        </span>
        <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--color-muted-foreground)]">
          CURRENT
        </span>
        <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--color-muted-foreground)]">
          SUGGESTED
        </span>
        <span className="text-right font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--color-muted-foreground)]">
          ERGO
        </span>
        <span className="text-right font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--color-muted-foreground)]">
          RCL
        </span>
        <span className="text-right font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--color-muted-foreground)]">
          ₽
        </span>
      </div>

      <div className="flex-1 overflow-y-auto overflow-x-auto max-h-[420px]">
        {mode === "idle" && (
          <p className="py-12 text-center font-mono text-xs uppercase tracking-[0.18em] text-[var(--color-paper-dim)]">
            RUN THE SOLVER TO SEE PROPOSED CHANGES
          </p>
        )}
        {mode === "running" && (
          <p className="py-12 text-center font-mono text-xs uppercase tracking-[0.18em] text-[var(--color-paper-dim)]">
            RUNNING…
          </p>
        )}
        {isResult && !hasRows && (
          <p className="py-12 text-center font-mono text-xs uppercase tracking-[0.18em] text-[var(--color-paper-dim)]">
            NO IMPROVEMENTS FOUND · TRY A DIFFERENT OBJECTIVE
          </p>
        )}
        {isResult &&
          hasRows &&
          rows.map((row) => (
            <div
              key={row.slotId}
              className={`grid ${cols} items-center gap-2 border-b border-dashed border-[var(--color-border)] px-4 py-2.5`}
            >
              <input
                type="checkbox"
                aria-label={`Accept ${row.slotLabel} change`}
                checked={selected.has(row.slotId)}
                onChange={() => onToggle(row.slotId)}
              />
              <span className="font-mono text-[11px] uppercase tracking-[0.18em] text-[var(--color-primary)]">
                {row.slotLabel}
              </span>
              <span className="text-[13px] text-[var(--color-paper-dim)] line-through decoration-[var(--color-border)]">
                {row.currentName ?? "—"}
              </span>
              <span className="text-[13px] text-[var(--color-olive)]">
                → {row.proposedName ?? "— (removed)"}
              </span>
              <span className={`text-right font-mono text-xs ${deltaClass(row.ergoDelta, false)}`}>
                {fmtSigned(row.ergoDelta)}
              </span>
              <span className={`text-right font-mono text-xs ${deltaClass(row.recoilDelta, true)}`}>
                {fmtSigned(row.recoilDelta)}
              </span>
              <span className={`text-right font-mono text-xs ${deltaClass(row.priceDelta, true)}`}>
                {fmtPrice(row.priceDelta)}
              </span>
            </div>
          ))}
      </div>

      <div className="flex items-center gap-2 border-t border-[var(--color-border)] px-4 py-3">
        <Button onClick={onAcceptAll} disabled={!isResult || !hasRows}>
          ACCEPT ALL
        </Button>
        <Button
          variant="secondary"
          onClick={onAcceptSelected}
          disabled={!isResult || !hasRows || selectedCount === 0}
        >
          ACCEPT SELECTED ({selectedCount})
        </Button>
        <Button variant="ghost" onClick={onDiscard}>
          {isResult && !hasRows ? "BACK TO EDITOR" : "DISCARD"}
        </Button>
        <span className="ml-auto font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--color-muted-foreground)]">
          DFS · LINEAR LOWER-BOUND PRUNE · 2s BUDGET
        </span>
      </div>
    </Card>
  );
}
