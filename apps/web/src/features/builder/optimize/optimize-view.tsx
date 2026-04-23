import { useEffect, useMemo, useReducer, useState, type ReactElement } from "react";
import type { BuildV4, ModListItem, PlayerProfile, WeaponTree } from "@tarkov/data";
import type { BallisticWeapon, WeaponSpec } from "@tarkov/ballistics";
import { Button, Card, Pill } from "@tarkov/ui";
import type { UseTarkovTrackerSyncResult } from "../useTarkovTrackerSync.js";
import {
  constraintsReducer,
  initialConstraintsState,
  toOptimizerInput,
} from "./optimize-constraints-reducer.js";
import { OptimizeConstraintsForm } from "./optimize-constraints-form.js";
import { useOptimizer } from "./useOptimizer.js";
import { OptimizeTriptych } from "./optimize-triptych.js";
import { ModChangesTable, type TableMode } from "./mod-changes-table.js";
import { ProfileReadout } from "./profile-readout.js";
import { slotDiff, type ChangedRow } from "./slot-diff.js";
import { buildFromSelection } from "./build-from-selection.js";

export interface OptimizeViewProps {
  weapon: BallisticWeapon;
  slotTree: WeaponTree;
  modList: readonly ModListItem[];
  profile: PlayerProfile;
  sync: UseTarkovTrackerSyncResult;
  currentAttachments: Readonly<Record<string, string>>;
  currentBuild: BuildV4;
  currentStats: WeaponSpec | null;
  currentPrice: number | null;
  onAccept: (build: BuildV4) => void;
  onExit: () => void;
  onEditProfile: () => void;
}

function sumPrice(
  attachments: Readonly<Record<string, string>>,
  modList: readonly ModListItem[],
): number {
  let total = 0;
  for (const id of Object.values(attachments)) {
    const m = modList.find((x) => x.id === id);
    total += m?.price ?? 0;
  }
  return total;
}

function computeScoreDelta(objective: string, current: WeaponSpec, proposed: WeaponSpec): number {
  switch (objective) {
    case "min-recoil":
      return proposed.verticalRecoil - current.verticalRecoil;
    case "max-ergonomics":
      return -(proposed.ergonomics - current.ergonomics);
    case "min-weight":
      return proposed.weight - current.weight;
    case "max-accuracy":
      return proposed.accuracy - current.accuracy;
    default:
      return 0;
  }
}

export function OptimizeView({
  weapon,
  slotTree,
  modList,
  profile,
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

  // Pre-fill constraints pins from the user's current build on first mount.
  // Empty deps array is intentional — we only want this to run once on mount.
  useEffect(() => {
    dispatch({ type: "INIT_FROM_BUILD", attachments: currentAttachments });
  }, []);

  const proposed = optimizer.result && optimizer.result.ok ? optimizer.result : null;

  const rows: readonly ChangedRow[] = useMemo(() => {
    if (!proposed) return [];
    return slotDiff(currentAttachments, proposed.build.attachments, slotTree, modList);
  }, [proposed, currentAttachments, slotTree, modList]);

  // Default selection = all changed slots, refreshed whenever a new result arrives.
  useEffect(() => {
    if (proposed) setSelected(new Set(rows.map((r) => r.slotId)));
  }, [proposed, rows]);

  const optimizedPrice = useMemo(
    () => (proposed ? sumPrice(proposed.build.attachments, modList) : null),
    [proposed, modList],
  );
  const unchangedCount = slotTree.slots.length - rows.length;

  const mode: TableMode = optimizer.state === "running" ? "running" : proposed ? "result" : "idle";

  const scoreDelta =
    proposed && currentStats && proposed.stats
      ? computeScoreDelta(state.objective, currentStats, proposed.stats)
      : null;

  function handleRun(): void {
    optimizer.run(toOptimizerInput(state, { weapon, slotTree, modList, profile }));
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
    onAccept(buildFromSelection(currentBuild, proposed.build, new Set(rows.map((r) => r.slotId))));
  }

  function handleAcceptSelected(): void {
    if (!proposed) return;
    onAccept(buildFromSelection(currentBuild, proposed.build, selected));
  }

  function handleDiscard(): void {
    optimizer.reset();
    onExit();
  }

  const isError =
    optimizer.state === "error" || (proposed === null && optimizer.result && !optimizer.result.ok);

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
          className="font-mono text-[11px] uppercase tracking-[0.2em] text-[var(--color-muted-foreground)] hover:text-[var(--color-primary)]"
          aria-label="Back to builder editor"
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
            <Pill tone="reliable">BRANCH-AND-BOUND</Pill>
          </div>
          <OptimizeConstraintsForm
            state={state}
            dispatch={dispatch}
            slotTree={slotTree}
            onRun={handleRun}
          />
          <ProfileReadout profile={profile} sync={sync} onEditProfile={onEditProfile} />
          <Button onClick={handleRun} disabled={optimizer.state === "running"}>
            RE-RUN OPTIMIZATION
          </Button>
        </Card>

        <div className="flex flex-col gap-5 min-w-0">
          {isError ? (
            <Card variant="bracket" className="p-5">
              <div className="font-display text-base">OPTIMIZER ERROR</div>
              <p className="mt-2 text-sm text-[var(--color-destructive)]">
                {optimizer.error?.message ?? "No valid build under these constraints."}
              </p>
              <Button className="mt-3" variant="secondary" onClick={() => optimizer.reset()}>
                BACK TO CONSTRAINTS
              </Button>
            </Card>
          ) : (
            <OptimizeTriptych
              current={currentStats}
              optimized={proposed?.stats ?? null}
              priceCurrent={currentPrice}
              priceOptimized={optimizedPrice}
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
          />
        </div>
      </div>
    </div>
  );
}
