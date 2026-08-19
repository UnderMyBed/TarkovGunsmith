// apps/web/src/features/builder/compare/compare-workspace.tsx
import { useCallback, useEffect, useMemo, useRef, type ReactElement } from "react";
import { useNavigate } from "@tanstack/react-router";
import {
  useWeaponList,
  useModList,
  useWeaponTree,
  useSavePair,
  useForkPair,
  slotDiff,
  loadBuild,
  CURRENT_PAIR_VERSION,
  type BuildV6,
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
          left: initialPair.left?.version === 6 ? initialPair.left : null,
          right: initialPair.right?.version === 6 ? initialPair.right : null,
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

  // One-shot sessionStorage prefill consumer. Runs on mount for the blank
  // /builder/compare route (no loader-supplied initialPair). Lets the
  // Builder "Compare ↔" button hand off a draft build without a share URL.
  //
  // This deliberately wants the *mount-time* snapshot of `initialPair` and `draft`, not
  // whatever they are on some later render — it must run exactly once, and re-running it
  // (or re-deciding whether to run it) if either changed later would replay a stale
  // sessionStorage handoff over whatever the user has since done. `useRef` freezes that
  // snapshot honestly instead of closing over the render-1 values directly with an `[]`
  // deps array a reader has to trust is intentional — exhaustive-deps can't tell "closes
  // over stale values on purpose" from "forgot to list a dependency" and is right to flag
  // the latter shape either way.
  const mountSnapshot = useRef({ initialPair, draft });
  useEffect(() => {
    const { initialPair, draft } = mountSnapshot.current;
    if (initialPair) return;
    const raw = sessionStorage.getItem("compare:leftPrefill");
    const mode = sessionStorage.getItem("compare:mode");
    const rightId = sessionStorage.getItem("compare:rightBuildId");
    if (!raw || !mode) return;

    try {
      const left = JSON.parse(raw) as BuildV6;
      // Only accept the current version; loadBuild upgrades v3/v4 on the way in.
      if (left.version !== 6) return;
      draft.setSide("left", left);
      if (mode === "clone-both") {
        draft.setSide("right", structuredClone(left));
      } else if (mode === "paste-url" && rightId) {
        // This used to be a `const { loadBuild } = await import("@tarkov/data")` — a dead
        // split. This file already statically imports six other bindings from the same
        // package (above), and `app.tsx` statically imports `TarkovDataProvider` from it
        // too, so `@tarkov/data`'s module graph was already in the eagerly-loaded chunk
        // before this dynamic import ever ran; Rollup can't move an already-eager module
        // into a lazy chunk for one caller. That produced Vite's
        // [INEFFECTIVE_DYNAMIC_IMPORT] warning for no benefit. `loadBuild` is imported
        // statically above instead; genuine bundle savings come from lazy-loading whole
        // routes (vite.config.ts's `autoCodeSplitting`), not from splitting a shared
        // package that's already resident.
        void (async () => {
          try {
            const right = await loadBuild(fetch, rightId);
            if (right.version === 6) draft.setSide("right", right);
          } catch {
            // Swallow — user sees empty right side; can paste again.
          }
        })();
      }
    } catch {
      // Malformed session storage — skip.
    } finally {
      sessionStorage.removeItem("compare:leftPrefill");
      sessionStorage.removeItem("compare:mode");
      sessionStorage.removeItem("compare:rightBuildId");
      draft.markClean(); // fresh-clone from Builder shouldn't start "dirty"
    }
    // Run once on mount, against the mount-time snapshot above.
  }, []);

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
          onBuildChange={(b: BuildV6 | null) => draft.setSide("left", b)}
        />
        <CompareSide
          label="B"
          sectionIndex={2}
          build={draft.state.right}
          profile={draft.state.rightProfile}
          diff={diff}
          onBuildChange={(b: BuildV6 | null) => draft.setSide("right", b)}
        />
      </div>
    </div>
  );
}
