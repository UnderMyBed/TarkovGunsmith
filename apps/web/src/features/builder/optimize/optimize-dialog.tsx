import { useEffect, useReducer, useState, type ReactElement } from "react";
import type { BuildV4, ModListItem, PlayerProfile, WeaponTree } from "@tarkov/data";
import type { BallisticWeapon, WeaponSpec } from "@tarkov/ballistics";
import { Button, Card, CardContent } from "@tarkov/ui";
import {
  constraintsReducer,
  initialConstraintsState,
  toOptimizerInput,
} from "./optimize-constraints-reducer.js";
import { OptimizeConstraintsForm } from "./optimize-constraints-form.js";
import { OptimizeResultView } from "./optimize-result-view.js";
import { useOptimizer } from "./useOptimizer.js";

interface OptimizeDialogProps {
  open: boolean;
  onClose: () => void;
  onAccept: (build: BuildV4) => void;
  weapon: BallisticWeapon;
  slotTree: WeaponTree;
  modList: readonly ModListItem[];
  profile: PlayerProfile;
  currentAttachments: Readonly<Record<string, string>>;
  currentStats: WeaponSpec | null;
}

export function OptimizeDialog({
  open,
  onClose,
  onAccept,
  weapon,
  slotTree,
  modList,
  profile,
  currentAttachments,
  currentStats,
}: OptimizeDialogProps): ReactElement | null {
  const [tab, setTab] = useState<"constraints" | "result">("constraints");
  const [state, dispatch] = useReducer(constraintsReducer, initialConstraintsState);
  const optimizer = useOptimizer();

  // Reset dialog state on the false→true edge of `open`. `optimizer` returns a
  // fresh object every render (see useOptimizer), so including it in deps
  // would re-fire this effect on every state tick mid-run and clobber the
  // result back to idle before the tab-transition effect below can latch.
  useEffect(() => {
    if (open) {
      dispatch({ type: "INIT_FROM_BUILD", attachments: currentAttachments });
      setTab("constraints");
      optimizer.reset();
    }
  }, [open]);

  useEffect(() => {
    if (optimizer.state === "done" || optimizer.state === "error") {
      setTab("result");
    }
  }, [optimizer.state]);

  if (!open) return null;

  const handleRun = () => {
    optimizer.run(toOptimizerInput(state, { weapon, slotTree, modList, profile }));
  };

  const handleAccept = () => {
    if (optimizer.result?.ok) {
      onAccept(optimizer.result.build);
      onClose();
    }
  };

  const handleReject = () => {
    optimizer.reset();
    onClose();
  };

  const handleAdjust = () => {
    optimizer.reset();
    setTab("constraints");
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70"
      onClick={onClose}
    >
      <Card className="w-full max-w-2xl" onClick={(e: React.MouseEvent) => e.stopPropagation()}>
        <CardContent className="p-6 flex flex-col gap-4">
          <h2 className="font-display text-xl uppercase tracking-wider">Optimize build</h2>

          {tab === "constraints" && (
            <OptimizeConstraintsForm
              state={state}
              dispatch={dispatch}
              slotTree={slotTree}
              onRun={handleRun}
            />
          )}

          {tab === "result" && optimizer.state === "running" && (
            <p className="text-center text-sm text-[var(--color-muted-foreground)] py-8">
              Running…
            </p>
          )}

          {tab === "result" && optimizer.result && (
            <OptimizeResultView
              result={optimizer.result}
              currentStats={currentStats}
              onAccept={handleAccept}
              onReject={handleReject}
              onAdjust={handleAdjust}
            />
          )}

          {tab === "result" && optimizer.state === "error" && (
            <div className="flex flex-col gap-3">
              <p className="text-sm text-[var(--color-destructive)]">
                Optimizer threw: {optimizer.error?.message ?? "unknown error"}
              </p>
              <Button onClick={handleAdjust}>Back</Button>
            </div>
          )}

          <div className="flex justify-between pt-2 border-t border-[var(--color-border)]">
            <Button variant="ghost" onClick={onClose}>
              Close
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
