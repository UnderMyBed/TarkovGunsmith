import { useMemo, useReducer, useState, type ReactElement } from "react";
import type { ScoreDelta } from "./mod-changes-table.js";
import {
  partsById,
  type AttachablePart,
  type BuildPrice,
  type BuildV6,
  type PriceGate,
  type PricedPreset,
  type WeaponListItem,
  type WeaponTree,
} from "@tarkov/data";
import type { Objective } from "@tarkov/optimizer";
import type { BallisticWeapon, WeaponSpec } from "@tarkov/ballistics";
import { Button, Card, Pill, focusRing } from "@tarkov/ui";
import type { UseTarkovTrackerSyncResult } from "../useTarkovTrackerSync.js";
import {
  constraintsReducer,
  initialConstraintsState,
  toOptimizerInput,
  type ConstraintsAction,
  type ConstraintsState,
} from "./optimize-constraints-reducer.js";
import { OPTIMIZER_TIMEOUT_MS } from "./optimize-protocol.js";
import { OptimizeOutcome, OptimizeRunning } from "./optimize-outcome.js";
import { OptimizeConstraintsForm } from "./optimize-constraints-form.js";
import { useOptimizer } from "./useOptimizer.js";
import { OptimizeTriptych } from "./optimize-triptych.js";
import { ModChangesTable, type TableMode } from "./mod-changes-table.js";
import { ProfileReadout } from "./profile-readout.js";
import { shownSlots, slotDiff, weaponChangeOf, type ChangedRow } from "./slot-diff.js";
import { buildFromSelection } from "./build-from-selection.js";
import { coversOf, priceBuild, totalOf } from "../build-price.js";

export interface OptimizeViewProps {
  weapon: BallisticWeapon;
  /** The weapon's own record: the optimizer's budget covers the gun as well as its parts. */
  weaponItem: WeaponListItem;
  slotTree: WeaponTree;
  parts: readonly AttachablePart[];
  /** Whose gates the search and prices read: the profile, or `null` in theorycraft. */
  gate: PriceGate;
  /** The weapon's presets, priced: a build bought as one does not pay for its parts twice. */
  presets: readonly PricedPreset[];
  /** Whether live prices have loaded; a budget waits for them. */
  pricesReady: boolean;
  sync: UseTarkovTrackerSyncResult;
  currentAttachments: Readonly<Record<string, string>>;
  currentBuild: BuildV6;
  currentStats: WeaponSpec | null;
  currentPrice: BuildPrice | null;
  onAccept: (build: BuildV6) => void;
  onExit: () => void;
  onEditProfile: () => void;
}

/**
 * The change in what the run optimised. Min recoil minimises the summed recoil modifier, which
 * scales vertical and horizontal recoil alike, so its delta is on V+H; max accuracy is MOA.
 * Decimals match the triptych.
 */
export function objectiveDelta(
  objective: Objective,
  current: WeaponSpec,
  proposed: WeaponSpec,
): ScoreDelta {
  switch (objective) {
    case "min-recoil":
      return {
        label: "RECOIL V+H",
        value:
          proposed.verticalRecoil +
          proposed.horizontalRecoil -
          (current.verticalRecoil + current.horizontalRecoil),
        digits: 0,
      };
    case "max-ergonomics":
      return { label: "ERGO", value: proposed.ergonomics - current.ergonomics, digits: 0 };
    case "min-weight":
      return { label: "WEIGHT KG", value: proposed.weight - current.weight, digits: 2 };
    case "max-accuracy":
      return { label: "MOA", value: proposed.accuracy - current.accuracy, digits: 2 };
  }
}

export function OptimizeView({
  weapon,
  weaponItem,
  slotTree,
  parts,
  gate,
  presets,
  pricesReady,
  sync,
  currentAttachments,
  currentBuild,
  currentStats,
  currentPrice,
  onAccept,
  onExit,
  onEditProfile,
}: OptimizeViewProps): ReactElement {
  const [state, dispatch] = useReducer(constraintsReducer, initialConstraintsState);
  const optimizer = useOptimizer();
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());

  // Pre-fill constraints pins from the user's current build. This used to be a mount-only
  // effect (`[]` deps, "we only want this to run once") which silently went stale for any
  // future caller that keeps OptimizeView mounted across a currentAttachments change — the
  // exhaustive-deps rule was right to flag it even though today's one caller always remounts
  // this component on entry, making the staleness latent rather than currently observable.
  // Comparing against the previous prop during render (React's documented alternative to an
  // effect for "adjust state when a prop changes" — see
  // https://react.dev/learn/you-might-not-need-an-effect#adjusting-some-state-when-a-prop-changes)
  // reacts correctly to that prop for as long as this component lives, and still fires
  // exactly once on mount since `pinnedFrom` starts as `undefined`.
  const [pinnedFrom, setPinnedFrom] = useState<Readonly<Record<string, string>> | undefined>(
    undefined,
  );
  if (currentAttachments !== pinnedFrom) {
    setPinnedFrom(currentAttachments);
    dispatch({ type: "INIT_FROM_BUILD", attachments: currentAttachments });
  }

  const proposed = optimizer.result && optimizer.result.ok ? optimizer.result : null;

  const byId = useMemo(() => partsById(parts), [parts]);

  const optimizedPrice = useMemo(
    () =>
      proposed
        ? priceBuild(gate, weaponItem, slotTree, proposed.build.attachments, byId, presets)
        : null,
    [proposed, gate, weaponItem, slotTree, byId, presets],
  );

  const rows: readonly ChangedRow[] = useMemo(() => {
    if (!proposed) return [];
    return slotDiff(currentAttachments, proposed.build.attachments, slotTree, byId, gate, {
      current: coversOf(currentPrice, presets),
      proposed: coversOf(optimizedPrice, presets),
    });
  }, [proposed, currentAttachments, slotTree, byId, gate, currentPrice, optimizedPrice, presets]);

  // When the two builds buy the weapon differently, the weapon's own change belongs to no slot:
  // it is the rest of the cost change, shown on a line of its own.
  const weaponChange = useMemo(
    () =>
      weaponChangeOf(currentPrice, optimizedPrice, rows, (id) =>
        id === null ? weaponItem.shortName : (presets.find((p) => p.id === id)?.shortName ?? id),
      ),
    [currentPrice, optimizedPrice, rows, presets, weaponItem],
  );

  // Default selection = all changed slots, refreshed whenever a new result arrives. Same
  // "adjust state during render" pattern as above: `setSelected` used to run in a
  // useEffect after commit, which meant every new optimizer result painted once with the
  // *previous* selection still showing before this effect corrected it a moment later.
  const [selectedFor, setSelectedFor] = useState(proposed);
  if (proposed !== selectedFor) {
    setSelectedFor(proposed);
    if (proposed) setSelected(new Set(rows.map((r) => r.slotId)));
  }

  // Over every slot either build shows, at any depth: rows include deep slots too.
  const unchangedCount = useMemo(
    () =>
      shownSlots(slotTree, currentAttachments, proposed?.build.attachments ?? {}).length -
      rows.length,
    [slotTree, currentAttachments, proposed, rows],
  );

  const mode: TableMode = optimizer.state === "running" ? "running" : proposed ? "result" : "idle";

  // Scored by the objective the result was run with, which the hook keeps with the result.
  const scoreDelta =
    proposed && currentStats && optimizer.objective
      ? objectiveDelta(optimizer.objective, currentStats, proposed.stats)
      : null;

  function runWith(constraints: ConstraintsState): void {
    optimizer.run(
      toOptimizerInput(constraints, {
        weapon,
        weaponItem,
        slotTree,
        parts,
        gate,
        presets,
        pricesReady,
      }),
    );
  }

  function handleRun(): void {
    runWith(state);
  }

  /** Change the constraints and run on the changed ones at once. */
  function changeAndRun(action: ConstraintsAction): void {
    dispatch(action);
    runWith(constraintsReducer(state, action));
  }

  function handleToggle(slotId: string): void {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(slotId)) next.delete(slotId);
      else next.add(slotId);
      return next;
    });
  }

  function handleAcceptAll(): void {
    if (!proposed) return;
    onAccept(
      buildFromSelection(
        currentBuild,
        proposed.build,
        new Set(rows.map((r) => r.slotId)),
        slotTree,
        byId,
      ),
    );
  }

  function handleAcceptSelected(): void {
    if (!proposed) return;
    onAccept(buildFromSelection(currentBuild, proposed.build, selected, slotTree, byId));
  }

  function handleDiscard(): void {
    optimizer.reset();
    onExit();
  }

  const failure = optimizer.result && !optimizer.result.ok ? optimizer.result : null;
  const isError = optimizer.state === "error" || failure !== null;

  const optimizerPillTone =
    optimizer.state === "idle"
      ? ("muted" as const)
      : optimizer.state === "running"
        ? ("accent" as const)
        : optimizer.state === "error"
          ? ("marginal" as const)
          : ("reliable" as const);

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center gap-4 border-b border-dashed border-[var(--color-border)] pb-3">
        <button
          type="button"
          onClick={onExit}
          aria-label="Back to builder editor"
          className={`font-mono text-11 uppercase tracking-20 text-[var(--color-muted-foreground)] hover:text-[var(--color-primary)] ${focusRing}`}
        >
          ← EDITOR
        </button>
        <h1 className="font-display text-2xl uppercase tracking-wide text-[var(--color-foreground)]">
          OPTIMIZER
        </h1>
        <Pill tone={optimizerPillTone}>{optimizer.state.toUpperCase()}</Pill>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[340px_1fr] gap-6">
        <Card variant="bracket" className="flex flex-col gap-5 p-5">
          <div className="flex items-center justify-between">
            <span className="font-display text-base tracking-wide">SOLVER</span>
            <Pill tone="reliable">EXACT</Pill>
          </div>
          <OptimizeConstraintsForm
            state={state}
            dispatch={dispatch}
            slotTree={slotTree}
            pricesReady={pricesReady}
          />
          <ProfileReadout gate={gate} sync={sync} onEditProfile={onEditProfile} />
          {/* Enabled while running: the solver is pure, so a new run just supersedes the old. */}
          <Button onClick={handleRun}>RE-RUN OPTIMIZATION</Button>
        </Card>

        <div className="flex flex-col gap-5 min-w-0">
          {optimizer.progress !== undefined && (
            <OptimizeRunning
              progress={optimizer.progress}
              timeoutMs={OPTIMIZER_TIMEOUT_MS}
              onCancel={() => optimizer.cancel()}
            />
          )}
          {isError ? (
            <OptimizeOutcome
              failure={failure}
              error={optimizer.error}
              theorycraft={gate === null}
              pinnedSlots={state.pinnedSlots}
              nameOf={(id) => byId.get(id)?.name ?? id}
              timeoutMs={OPTIMIZER_TIMEOUT_MS}
              onRunWithoutBudget={() => changeAndRun({ type: "SET_BUDGET", value: "" })}
              onUnpin={(paths) => changeAndRun({ type: "UNPIN", slotPaths: paths })}
              onEditProfile={onEditProfile}
              onBack={() => optimizer.reset()}
              onRunAgain={handleRun}
            />
          ) : (
            <OptimizeTriptych
              current={currentStats}
              optimized={proposed?.stats ?? null}
              priceCurrent={totalOf(currentPrice)}
              priceOptimized={totalOf(optimizedPrice)}
              running={optimizer.state === "running"}
            />
          )}

          <ModChangesTable
            rows={rows}
            selected={selected}
            onToggle={handleToggle}
            onAcceptAll={handleAcceptAll}
            onAcceptSelected={handleAcceptSelected}
            onDiscard={handleDiscard}
            scoreDelta={scoreDelta}
            mode={mode}
            unchangedCount={Math.max(0, unchangedCount)}
            weaponChange={weaponChange}
          />
        </div>
      </div>
    </div>
  );
}
