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
  const n = progress.nodes;
  const clock =
    progress.startedAt === null
      ? "Starting the solver"
      : `${(Math.max(0, now - progress.startedAt) / 1000).toFixed(1)} s of ${seconds(timeoutMs)}`;
  return (
    <Card
      className="flex flex-wrap items-center gap-4 p-5"
      role="status"
      aria-label="Optimizer running"
    >
      <span className="font-bold text-base">Solving</span>
      <span className="text-xs text-[var(--color-muted-foreground)]">
        {clock} · {n} candidate {n === 1 ? "build" : "builds"} checked
      </span>
      <Button className="ml-auto" variant="secondary" size="sm" onClick={onCancel}>
        Cancel
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
  /** The pins the run was sent, path → part id or `null` (empty): what UNPIN names. */
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
    <Card className="flex flex-col gap-3 p-5" role="alert">
      <div className="flex items-center gap-3">
        <span className="font-bold text-base">{shown.heading}</span>
        <Pill tone="marginal">No build</Pill>
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
      Edit profile
    </Button>
  );
  const withoutBudget = (
    <Button variant="secondary" onClick={onRunWithoutBudget}>
      Run without a budget
    </Button>
  );
  const pinLabel = (path: string): string => {
    const id = pinnedSlots.get(path);
    return id === null || id === undefined ? `Empty ${path}` : nameOf(id);
  };
  const unpin = (paths: readonly string[], label: string) =>
    paths.length === 0 ? null : (
      <Button key={label} variant="secondary" onClick={() => onUnpin(paths)}>
        Unpin {label}
      </Button>
    );

  if (failure === null) {
    return {
      heading: "Optimizer stopped",
      message: error?.message ?? "The optimizer stopped without an answer.",
      hint: null,
      actions: <Button onClick={onRunAgain}>Run again</Button>,
    };
  }
  switch (failure.reason) {
    case "timeout":
      return {
        heading: "No build in time",
        message: `The search reached its ${seconds(timeoutMs)} limit before it finished. Only a finished search is shown as the best build.`,
        hint: "Pin more slots or set a budget to narrow the search, then run it again.",
        actions: (
          <Button variant="secondary" onClick={onBack}>
            Back to constraints
          </Button>
        ),
      };
    case "weapon-unavailable":
      return {
        heading: "Weapon out of reach",
        message: failure.message,
        hint: theorycraft
          ? "Pick another weapon."
          : "Raise trader levels or turn on the flea in your profile, or switch to theorycraft.",
        actions: editProfile,
      };
    case "required-slot":
      return {
        heading: "Required slot empty",
        message: failure.message,
        hint: theorycraft
          ? "Pick another weapon."
          : "Raise trader levels or turn on the flea to reach a part for it, or switch to theorycraft.",
        actions: editProfile,
      };
    case "infeasible-budget":
      switch (failure.cause) {
        case "over-budget":
          return {
            heading: "Over budget",
            message: failure.message,
            hint: "Raise the budget, or run without one.",
            actions: withoutBudget,
          };
        case "pins":
          return {
            heading: "No known price",
            message: failure.message,
            hint: "Unpin slots, or run without a budget.",
            actions: (
              <>
                {failure.paths.map((path) => unpin([path], pinLabel(path)))}
                {withoutBudget}
              </>
            ),
          };
        case "unpriced":
          return {
            heading: "No known price",
            message: failure.message,
            hint: theorycraft
              ? "Run without a budget."
              : "Run without a budget, or change the profile to reach parts with a known price.",
            actions: (
              <>
                {withoutBudget}
                {editProfile}
              </>
            ),
          };
      }
      break;
    case "pinned-unpriced": {
      const ids = new Set(failure.itemIds);
      const paths = [...pinnedSlots]
        .filter(([, id]) => id !== null && ids.has(id))
        .map(([path]) => path);
      return {
        heading: "Pinned part unpriced",
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
        heading: "Pins clash",
        message: failure.message,
        // The named pins are the ones a build needs gone, together: one alone may not do.
        hint: failure.paths.length === 1 ? "Unpin it." : "Unpin all of them.",
        actions: unpin(failure.paths, failure.paths.map(pinLabel).join(", ")),
      };
    case "no-valid-combinations":
      return {
        heading: "No build fits together",
        message: failure.message,
        hint: theorycraft
          ? "Pick another weapon."
          : "Change the profile to reach other parts, or pick another weapon.",
        actions: editProfile,
      };
  }
}
