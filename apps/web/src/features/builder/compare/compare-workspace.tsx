// apps/web/src/features/builder/compare/compare-workspace.tsx
import { useCallback, useEffect, useMemo, type ReactElement } from "react";
import { useNavigate } from "@tanstack/react-router";
import {
  useWeaponList,
  useModList,
  useWeaponTree,
  useSavePair,
  useForkPair,
  slotDiff,
  CURRENT_PAIR_VERSION,
  type BuildV4,
  type BuildPair,
} from "@tarkov/data";
import { CompareToolbar } from "./compare-toolbar.js";
import { CompareStatDelta } from "./compare-stat-delta.js";
import { CompareProgressionRow } from "./compare-progression-row.js";
import { CompareSide, computeSideSpec } from "./compare-side.js";
import { useCompareDraft } from "./useCompareDraft.js";

export interface CompareWorkspaceProps {
  initialPair?: BuildPair;
  initialPairId?: string;
}

export function CompareWorkspace({
  initialPair,
  initialPairId,
}: CompareWorkspaceProps = {}): ReactElement {
  const navigate = useNavigate();

  const draft = useCompareDraft(
    initialPair
      ? {
          left: initialPair.left?.version === 4 ? initialPair.left : null,
          right: initialPair.right?.version === 4 ? initialPair.right : null,
          leftProfile: initialPair.leftProfile,
          rightProfile: initialPair.rightProfile,
          name: initialPair.name,
          description: initialPair.description,
          dirty: false,
        }
      : undefined,
  );

  const weapons = useWeaponList();
  const mods = useModList();
  const leftTree = useWeaponTree(draft.state.left?.weaponId ?? "");
  const rightTree = useWeaponTree(draft.state.right?.weaponId ?? "");

  const save = useSavePair();
  const fork = useForkPair();

  // Unsaved-edits guard (beforeunload)
  useEffect(() => {
    if (!draft.state.dirty) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [draft.state.dirty]);

  const diff = useMemo(() => {
    const l =
      draft.state.left && leftTree.data
        ? {
            tree: leftTree.data.slots,
            attachments: draft.state.left.attachments,
          }
        : null;
    const r =
      draft.state.right && rightTree.data
        ? {
            tree: rightTree.data.slots,
            attachments: draft.state.right.attachments,
          }
        : null;
    return slotDiff(l, r);
  }, [draft.state.left, draft.state.right, leftTree.data, rightTree.data]);

  const leftSpec = useMemo(
    () => computeSideSpec(draft.state.left, weapons.data, mods.data),
    [draft.state.left, weapons.data, mods.data],
  );
  const rightSpec = useMemo(
    () => computeSideSpec(draft.state.right, weapons.data, mods.data),
    [draft.state.right, weapons.data, mods.data],
  );

  const handleSave = useCallback(() => {
    const pair: BuildPair = {
      v: CURRENT_PAIR_VERSION,
      createdAt: new Date().toISOString(),
      left: draft.state.left,
      right: draft.state.right,
      leftProfile: draft.state.leftProfile,
      rightProfile: draft.state.rightProfile,
      name: draft.state.name,
      description: draft.state.description,
    };
    save.mutate(pair, {
      onSuccess: (res) => {
        draft.markClean();
        void navigate({
          to: "/builder/compare/$pairId",
          params: { pairId: res.id },
        });
      },
    });
  }, [draft, save, navigate]);

  const handleSaveAsNew = useCallback(() => {
    if (initialPairId) {
      fork.mutate(initialPairId, {
        onSuccess: (res) => {
          draft.markClean();
          void navigate({
            to: "/builder/compare/$pairId",
            params: { pairId: res.id },
          });
        },
      });
    } else {
      handleSave();
    }
  }, [initialPairId, fork, draft, navigate, handleSave]);

  const canSwap = draft.state.left !== null || draft.state.right !== null;
  const canClone = canSwap;

  return (
    <div className="flex flex-col gap-4">
      <CompareToolbar
        dirty={draft.state.dirty}
        pairId={initialPairId}
        canSwap={canSwap}
        canClone={canClone}
        onSave={handleSave}
        onSaveAsNew={handleSaveAsNew}
        onSwap={draft.swap}
        onCloneLeftToRight={draft.cloneLeftToRight}
        onCloneRightToLeft={draft.cloneRightToLeft}
      />

      <CompareStatDelta left={leftSpec} right={rightSpec} />

      <CompareProgressionRow
        leftPriceRub={null}
        rightPriceRub={null}
        leftReachable={null}
        rightReachable={null}
      />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <CompareSide
          label="A"
          sectionIndex={1}
          build={draft.state.left}
          profile={draft.state.leftProfile}
          diff={diff}
          onBuildChange={(b: BuildV4 | null) => draft.setSide("left", b)}
        />
        <CompareSide
          label="B"
          sectionIndex={2}
          build={draft.state.right}
          profile={draft.state.rightProfile}
          diff={diff}
          onBuildChange={(b: BuildV4 | null) => draft.setSide("right", b)}
        />
      </div>
    </div>
  );
}
