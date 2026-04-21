import type { ReactElement } from "react";
import type { OptimizationResult } from "@tarkov/optimizer";
import type { WeaponSpec } from "@tarkov/ballistics";
import { Button, Pill, SectionTitle, Stamp } from "@tarkov/ui";
import { CompareStatDelta } from "../compare/compare-stat-delta.js";

interface Props {
  result: OptimizationResult;
  currentStats: WeaponSpec | null;
  onAccept: () => void;
  onReject: () => void;
  onAdjust: () => void;
}

export function OptimizeResultView({
  result,
  currentStats,
  onAccept,
  onReject,
  onAdjust,
}: Props): ReactElement {
  if (!result.ok) {
    return <FailureView reason={result.reason} onAdjust={onAdjust} />;
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <SectionTitle index={1} title="Result" />
        {result.partial && <Stamp tone="amber">PARTIAL</Stamp>}
      </div>
      {result.partial && (
        <p className="text-xs text-[var(--color-muted-foreground)]">
          Timed out before the search completed. Showing best explored so far.
        </p>
      )}
      <CompareStatDelta left={currentStats} right={result.stats} />
      <div className="flex gap-2 justify-end">
        <Button variant="ghost" onClick={onReject}>
          Reject
        </Button>
        <Button onClick={onAccept}>Accept</Button>
      </div>
    </div>
  );
}

const REASON_COPY: Readonly<Record<string, { title: string; body: string }>> = {
  "no-valid-combinations": {
    title: "No valid build exists",
    body:
      "Under these constraints, nothing is buildable. Try unpinning a slot, " +
      "raising the budget, or loosening the profile.",
  },
  "infeasible-budget": {
    title: "Budget too tight",
    body: "The cheapest valid build exceeds your budget.",
  },
  timeout: {
    title: "Timed out",
    body: "The solver didn't finish in time and couldn't find any valid build.",
  },
};

function FailureView({ reason, onAdjust }: { reason: string; onAdjust: () => void }): ReactElement {
  const copy = REASON_COPY[reason] ?? {
    title: "Couldn't optimize",
    body: "Unknown error.",
  };
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h3 className="font-display text-lg uppercase tracking-wider">{copy.title}</h3>
        <p className="text-sm text-[var(--color-muted-foreground)]">{copy.body}</p>
      </div>
      <Pill>{reason.toUpperCase()}</Pill>
      <div className="flex justify-end">
        <Button onClick={onAdjust}>Adjust constraints</Button>
      </div>
    </div>
  );
}
