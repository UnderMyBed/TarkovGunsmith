import { useEffect, useState, type ReactElement, type ReactNode } from "react";
import type { OptimizationResult } from "@tarkov/optimizer";
import { Button, Card, Pill } from "@tarkov/ui";
import type { OptimizerProgress } from "./useOptimizer.js";

export type OptimizationFailure = Extract<OptimizationResult, { ok: false }>;

const seconds = (ms: number): string => `${(ms / 1000).toFixed(ms % 1000 === 0 ? 0 : 1)} s`;

interface RunningProps {
  progress: OptimizerProgress;
  timeoutMs: number;
  onCancel: () => void;
}

/** While the worker solves: how long it has run against its limit, how far it has got, Cancel. */
export function OptimizeRunning({ progress, timeoutMs, onCancel }: RunningProps): ReactElement {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 100);
    return () => clearInterval(id);
  }, []);
  const elapsed = Math.max(0, now - progress.startedAt);
  const n = progress.nodes;
  return (
    <Card
      variant="bracket"
      className="flex flex-wrap items-center gap-4 p-5"
      role="status"
      aria-label="Optimizer running"
    >
      <span className="font-display text-base tracking-wide">SOLVING</span>
      <span className="font-mono text-xs uppercase tracking-18 text-[var(--color-muted-foreground)]">
        {(elapsed / 1000).toFixed(1)} s of {seconds(timeoutMs)} · {n} candidate{" "}
        {n === 1 ? "build" : "builds"} checked
      </span>
      <Button className="ml-auto" variant="secondary" size="sm" onClick={onCancel}>
        CANCEL
      </Button>
    </Card>
  );
}

interface OutcomeProps {
  /** The solver's answer when it found no build; `null` when the run threw instead. */
  failure: OptimizationFailure | null;
  /** What the run threw, when it did. */
  error: Error | undefined;
  /** Whether the run read no profile: nothing a profile change could reach. */
  theorycraft: boolean;
  /** The form's pins, path → part id or `null` (empty): what an UNPIN button removes. */
  pinnedSlots: ReadonlyMap<string, string | null>;
  /** A part's display name. */
  nameOf: (id: string) => string;
  timeoutMs: number;
  onRunWithoutBudget: () => void;
  onUnpin: (paths: readonly string[]) => void;
  onEditProfile: () => void;
  onBack: () => void;
  onRunAgain: () => void;
}

interface Shown {
  readonly heading: string;
  readonly message: string;
  readonly hint: string | null;
  readonly actions: ReactNode;
}

/**
 * Why the run gave no build, and what to do about it: the solver's own message for each
 * reason, then the step the user can take, with a button that takes it where one exists.
 */
export function OptimizeOutcome(props: OutcomeProps): ReactElement {
  const shown = describe(props);
  return (
    <Card variant="bracket" className="flex flex-col gap-3 p-5" role="alert">
      <div className="flex items-center gap-3">
        <span className="font-display text-base tracking-wide">{shown.heading}</span>
        <Pill tone="marginal">NO BUILD</Pill>
      </div>
      <p className="text-sm text-[var(--color-destructive)]">{shown.message}</p>
      {shown.hint !== null && (
        <p className="text-sm text-[var(--color-muted-foreground)]">{shown.hint}</p>
      )}
      <div className="flex flex-wrap gap-2">{shown.actions}</div>
    </Card>
  );
}

function describe({
  failure,
  error,
  theorycraft,
  pinnedSlots,
  nameOf,
  timeoutMs,
  onRunWithoutBudget,
  onUnpin,
  onEditProfile,
  onBack,
  onRunAgain,
}: OutcomeProps): Shown {
  const editProfile = theorycraft ? null : (
    <Button variant="secondary" onClick={onEditProfile}>
      EDIT PROFILE
    </Button>
  );
  const withoutBudget = (
    <Button variant="secondary" onClick={onRunWithoutBudget}>
      RUN WITHOUT A BUDGET
    </Button>
  );
  const pinLabel = (path: string): string => {
    const id = pinnedSlots.get(path);
    return id === null || id === undefined ? `EMPTY ${path}` : nameOf(id);
  };
  const unpin = (paths: readonly string[], label: string) =>
    paths.length === 0 ? null : (
      <Button key={label} variant="secondary" onClick={() => onUnpin(paths)}>
        UNPIN {label}
      </Button>
    );

  if (failure === null) {
    return {
      heading: "OPTIMIZER STOPPED",
      message: error?.message ?? "The optimizer stopped without an answer.",
      hint: null,
      actions: <Button onClick={onRunAgain}>RUN AGAIN</Button>,
    };
  }
  switch (failure.reason) {
    case "timeout":
      return {
        heading: "NO BUILD IN TIME",
        message: `The search reached its ${seconds(timeoutMs)} limit before it finished. Only a finished search is shown as the best build.`,
        hint: "Pin more slots or set a budget to narrow the search, then run it again.",
        actions: (
          <Button variant="secondary" onClick={onBack}>
            BACK TO CONSTRAINTS
          </Button>
        ),
      };
    case "weapon-unavailable":
      return {
        heading: "WEAPON OUT OF REACH",
        message: failure.message,
        hint: theorycraft
          ? "Pick another weapon."
          : "Raise trader levels or turn on the flea in your profile, or switch to theorycraft.",
        actions: editProfile,
      };
    case "required-slot":
      return {
        heading: "REQUIRED SLOT EMPTY",
        message: failure.message,
        hint: theorycraft
          ? "Pick another weapon."
          : "Raise trader levels or turn on the flea to reach a part for it, or switch to theorycraft.",
        actions: editProfile,
      };
    case "infeasible-budget":
      return {
        heading: "OVER BUDGET",
        message: failure.message,
        hint: "Raise the budget, or run without one.",
        actions: withoutBudget,
      };
    case "pinned-unpriced": {
      const ids = new Set(failure.itemIds);
      const paths = [...pinnedSlots]
        .filter(([, id]) => id !== null && ids.has(id))
        .map(([path]) => path);
      return {
        heading: "PINNED PART UNPRICED",
        message: failure.message,
        hint: "Unpin the part, or run without a budget.",
        actions: (
          <>
            {unpin(paths, failure.itemIds.map(nameOf).join(", "))}
            {withoutBudget}
          </>
        ),
      };
    }
    case "pin-conflict":
      return {
        heading: "PINS CLASH",
        message: failure.message,
        hint: "Unpin one of them.",
        actions: <>{failure.paths.map((path) => unpin([path], pinLabel(path)))}</>,
      };
    case "no-valid-combinations":
      return {
        heading: "NO BUILD FITS TOGETHER",
        message: failure.message,
        hint: theorycraft
          ? "Unpin slots, or pick another weapon."
          : "Unpin slots, or change the profile to reach other parts.",
        actions: editProfile,
      };
  }
}
