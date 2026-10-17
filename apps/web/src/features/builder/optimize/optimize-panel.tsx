import type { ReactElement, ReactNode } from "react";
import type { WeaponSpec } from "@tarkov/ballistics";
import type { BuildPrice, BuildV6, PriceGate } from "@tarkov/data";
import type { Objective } from "@tarkov/optimizer";
import { Button, Input } from "@tarkov/ui";
import { totalOf } from "../build-price.js";
import { shownErgonomics } from "../ergonomics.js";
import { formatRubDelta, oneDecimal } from "../stat-strip.js";
import type { UseTarkovTrackerSyncResult } from "../useTarkovTrackerSync.js";
import { OPTIMIZER_TIMEOUT_MS } from "./optimize-protocol.js";
import { OptimizeOutcome, OptimizeRunning } from "./optimize-outcome.js";
import { OptimizePinReport } from "./optimize-pin-report.js";
import type { OptimizeSession } from "./useOptimizeSession.js";

export const OBJECTIVES: readonly { value: Objective; label: string }[] = [
  { value: "min-recoil", label: "Min recoil" },
  { value: "max-ergonomics", label: "Max ergonomics" },
  { value: "min-weight", label: "Min weight" },
  { value: "max-accuracy", label: "Max accuracy" },
];

export interface OptimizePanelProps {
  session: OptimizeSession;
  /** Whose gates the search reads: the profile, or `null` in theorycraft. */
  gate: PriceGate;
  sync: UseTarkovTrackerSyncResult;
  /** A budget is checked against live prices, so the field waits for them. */
  pricesReady: boolean;
  /** The current build's figures, which the Proposal's summary starts from. */
  currentSpec: WeaponSpec;
  currentPrice: BuildPrice | null;
  onEditProfile: () => void;
  /** Switch the search to the player's progression (theorycraft's "Use my progression"). */
  onUseProgression: () => void;
  /** Leave optimize mode, keeping the build as it is. */
  onClose: () => void;
  /** Put the ticked changes on the build. */
  onApply: (build: BuildV6) => void;
}

/**
 * The optimize mode's side panel: what to optimize for, the budget, whose progression the
 * search reads, and Run; under it the run in progress, why it found no build, or the Proposal.
 */
export function OptimizePanel({
  session,
  gate,
  sync,
  pricesReady,
  currentSpec,
  currentPrice,
  onEditProfile,
  onUseProgression,
  onClose,
  onApply,
}: OptimizePanelProps): ReactElement {
  const { constraints, dispatch, optimizer, proposed, failure } = session;
  const hasRun = optimizer.result !== undefined || optimizer.state === "error";

  const discard = () => {
    optimizer.reset();
    onClose();
  };

  return (
    <aside
      aria-label="Optimizer"
      className="flex min-w-0 flex-[1_1_300px] flex-col gap-4 lg:max-w-[400px]"
    >
      <section className="flex flex-col gap-4 rounded-[var(--radius-panel)] border border-[var(--color-border)] bg-[var(--color-card)] p-4">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-base font-bold">Optimize for</h2>
          <Button variant="ghost" size="sm" onClick={onClose} aria-label="Close the optimizer">
            Close
          </Button>
        </div>
        <div role="radiogroup" aria-label="Objective" className="grid grid-cols-2 gap-2">
          {OBJECTIVES.map((o) => (
            <label
              key={o.value}
              className="flex min-h-11 cursor-pointer items-center gap-2 rounded-[var(--radius)] border border-[var(--color-border-strong)] px-3 text-sm has-[:checked]:border-[var(--color-primary)] has-[:checked]:bg-[var(--color-selected)] has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-[var(--color-ring)]"
            >
              <input
                type="radio"
                name="objective"
                value={o.value}
                checked={constraints.objective === o.value}
                onChange={() => dispatch({ type: "SET_OBJECTIVE", objective: o.value })}
                className="accent-[var(--color-primary-text)]"
              />
              {o.label}
            </label>
          ))}
        </div>
        <label className="flex flex-col gap-1 text-12 text-[var(--color-muted-foreground)]">
          Budget, ₽ (optional)
          <Input
            type="number"
            min={0}
            inputMode="numeric"
            disabled={!pricesReady}
            placeholder={pricesReady ? "No limit" : "Budget needs prices"}
            value={constraints.budgetRub !== undefined ? String(constraints.budgetRub) : ""}
            onChange={(e) => dispatch({ type: "SET_BUDGET", value: e.target.value })}
            className="h-11"
          />
        </label>
        <ProfileLine
          gate={gate}
          sync={sync}
          onEditProfile={onEditProfile}
          onUseProgression={onUseProgression}
        />
        {session.staleNote !== null && optimizer.state === "idle" && (
          <p role="status" className="text-13 text-[var(--color-foreground-2)]">
            {session.staleNote}
          </p>
        )}
        {/* Enabled while running: the solver is pure, so a new run just supersedes the old. */}
        <Button className="h-12 text-base" onClick={session.run}>
          {hasRun ? "Run again" : "Run"}
        </Button>
      </section>

      {optimizer.progress !== undefined && (
        <OptimizeRunning
          progress={optimizer.progress}
          timeoutMs={OPTIMIZER_TIMEOUT_MS}
          onCancel={() => optimizer.cancel()}
        />
      )}
      {(optimizer.state === "error" || failure !== null) && (
        <OptimizeOutcome
          failure={failure}
          error={optimizer.error}
          theorycraft={gate === null}
          pinnedSlots={optimizer.pins ?? constraints.pinnedSlots}
          nameOf={session.nameOf}
          timeoutMs={OPTIMIZER_TIMEOUT_MS}
          onRunWithoutBudget={() => session.changeAndRun({ type: "SET_BUDGET", value: "" })}
          onUnpin={(paths) => session.changeAndRun({ type: "UNPIN", slotPaths: paths })}
          onEditProfile={onEditProfile}
          onBack={() => optimizer.reset()}
          onRunAgain={session.run}
        />
      )}
      {proposed && session.tickedBuild && (
        <ProposalCard
          session={session}
          objective={optimizer.objective ?? constraints.objective}
          currentSpec={currentSpec}
          currentPrice={currentPrice}
          onApply={() => onApply(session.tickedBuild!.build)}
          onDiscard={discard}
        />
      )}
      {proposed && (
        <OptimizePinReport
          pins={proposed.pins}
          slotTree={session.tree}
          proposed={session.proposedOn}
          current={session.currentOn}
          nameOf={session.nameOf}
        />
      )}
    </aside>
  );
}

function ProposalCard({
  session,
  objective,
  currentSpec,
  currentPrice,
  onApply,
  onDiscard,
}: {
  session: OptimizeSession;
  objective: Objective;
  currentSpec: WeaponSpec;
  currentPrice: BuildPrice | null;
  onApply: () => void;
  onDiscard: () => void;
}) {
  const total = session.changes.size;
  const ticked = session.landed;
  const objectiveLabel = OBJECTIVES.find((o) => o.value === objective)!.label.toLowerCase();
  const next = session.tickedBuild!;
  return (
    <section
      aria-label="Proposal"
      className="flex flex-col gap-3 rounded-[var(--radius-panel)] border border-[var(--color-primary)] bg-[var(--color-card)] p-4"
    >
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-base font-bold">Proposal</h2>
        {total > 0 && (
          <span className="font-mono text-12 tabular-nums text-[var(--color-muted-foreground)]">
            {ticked} of {total} ticked
          </span>
        )}
      </div>
      {total === 0 ? (
        <p className="text-13 leading-normal text-[var(--color-foreground-2)]">
          No change beats this build on {objectiveLabel}.
        </p>
      ) : (
        <p className="text-13 leading-normal text-[var(--color-foreground-2)]">
          {proposalSummary(objective, currentSpec, next.spec, currentPrice, next.price)} Untick any
          change in the build to leave that slot as it is.
        </p>
      )}
      {session.weaponChange !== null && (
        <p data-testid="weapon-change" className="text-13 text-[var(--color-foreground-2)]">
          Bought as {session.weaponChange.to} instead of {session.weaponChange.from}
          {session.weaponChange.priceDelta !== null &&
            formatRubDelta(session.weaponChange.priceDelta) !== "" &&
            ` (₽${formatRubDelta(session.weaponChange.priceDelta).slice(1)} ${session.weaponChange.priceDelta > 0 ? "more" : "less"})`}
          .
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        {total > 0 && (
          <Button className="h-11 flex-[1_1_auto]" disabled={!session.netChange} onClick={onApply}>
            Apply ticked changes
          </Button>
        )}
        <Button variant="secondary" className="h-11" onClick={onDiscard}>
          Discard
        </Button>
      </div>
    </section>
  );
}

/**
 * One sentence on what the ticked changes do: the stat the run optimised, then what they cost
 * and weigh. "Vertical recoil 78.1 → 40, for ₽787.0k more and 2.05 kg heavier."
 */
export function proposalSummary(
  objective: Objective,
  current: WeaponSpec,
  next: WeaponSpec,
  currentPrice: BuildPrice | null,
  nextPrice: BuildPrice | null,
): string {
  const headline = (() => {
    switch (objective) {
      case "min-recoil":
        return `Vertical recoil ${oneDecimal(current.verticalRecoil)} → ${oneDecimal(next.verticalRecoil)}`;
      case "max-ergonomics":
        return `Ergonomics ${oneDecimal(shownErgonomics(current.ergonomics))} → ${oneDecimal(shownErgonomics(next.ergonomics))}`;
      case "min-weight":
        return `Weight ${current.weight.toFixed(2)} → ${next.weight.toFixed(2)} kg`;
      case "max-accuracy":
        return `Accuracy ${current.accuracy.toFixed(2)} → ${next.accuracy.toFixed(2)} MOA`;
    }
  })();
  const clauses: string[] = [];
  const from = totalOf(currentPrice);
  const to = totalOf(nextPrice);
  if (from !== null && to !== null) {
    const delta = formatRubDelta(to - from);
    clauses.push(
      delta === "" ? "at the same cost" : `for ₽${delta.slice(1)} ${to > from ? "more" : "less"}`,
    );
  }
  const kg = next.weight - current.weight;
  if (objective !== "min-weight" && Math.abs(kg) >= 0.005) {
    clauses.push(`${Math.abs(kg).toFixed(2)} kg ${kg > 0 ? "heavier" : "lighter"}`);
  }
  return clauses.length === 0 ? `${headline}.` : `${headline}, ${clauses.join(" and ")}.`;
}

function formatRelativeTime(then: number, now = Date.now()): string {
  const ms = Math.max(0, now - then);
  const hours = Math.floor(ms / 3_600_000);
  if (hours < 1) return `${Math.max(1, Math.floor(ms / 60_000))}m ago`;
  if (hours < 48) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

/** Whose progression the search reads, in one line, with the way to change it. */
export function ProfileLine({
  gate,
  sync,
  onEditProfile,
  onUseProgression,
}: {
  gate: PriceGate;
  sync: UseTarkovTrackerSyncResult;
  onEditProfile: () => void;
  onUseProgression: () => void;
}): ReactElement {
  const link = (text: string, onClick: () => void): ReactNode => (
    <button
      type="button"
      onClick={onClick}
      className="text-[var(--color-primary-text)] underline-offset-2 hover:underline"
    >
      {text}
    </button>
  );
  if (gate === null) {
    return (
      <p className="text-13 leading-normal text-[var(--color-foreground-2)]">
        Theorycraft: every trader, flea and quest counts as open.{" "}
        {link("Use my progression", onUseProgression)}
      </p>
    );
  }
  const synced =
    sync.detail.state === "synced"
      ? ` · TarkovTracker ${formatRelativeTime(sync.detail.lastSyncedAt)}`
      : "";
  return (
    <p className="text-13 leading-normal text-[var(--color-foreground-2)]">
      My progression: PMC level <span className="font-mono tabular-nums">{gate.level}</span>, flea{" "}
      {gate.flea ? "on" : "off"}
      {synced}. {link("Edit progression", onEditProfile)}
    </p>
  );
}

/** Where the optimizer stands, for the stat strip's end. */
export function optimizeStatus(session: OptimizeSession): ReactNode {
  const { optimizer, proposed, changes, landed, staleNote } = session;
  if (staleNote !== null && optimizer.state === "idle") {
    return <span className="text-[var(--color-foreground-2)]">{staleNote}</span>;
  }
  if (optimizer.state === "running") {
    return <span className="text-[var(--color-muted-foreground)]">Solving…</span>;
  }
  if (proposed) {
    return (
      <>
        <span className="text-[var(--color-muted-foreground)]">Showing the proposal</span>
        {landed === changes.size ? (
          <span
            className="font-mono text-[var(--color-primary-text)]"
            title="The best build there is for this objective"
          >
            Exact
          </span>
        ) : (
          <span className="font-mono text-[var(--color-foreground-2)]">
            Partial: {landed} of {changes.size} changes
          </span>
        )}
      </>
    );
  }
  if (optimizer.result !== undefined || optimizer.state === "error") {
    return <span className="text-[var(--color-muted-foreground)]">No build</span>;
  }
  return <span className="text-[var(--color-muted-foreground)]">Ready to run</span>;
}
