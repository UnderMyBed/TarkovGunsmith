// apps/web/src/features/builder/compare/compare-workspace.tsx
import { useCallback, useEffect, useMemo, useRef, useState, type ReactElement } from "react";
import { useNavigate } from "@tanstack/react-router";
import {
  useWeaponList,
  usePartCatalog,
  useWeaponPresets,
  useWeaponTree,
  useLivePrices,
  partsById,
  useSavePair,
  useForkPair,
  slotDiff,
  loadBuild,
  loadSavedBuild,
  useBuilderData,
  CURRENT_PAIR_VERSION,
  PlayerProfile,
  type BuildV6,
  type BuildPair,
} from "@tarkov/data";
import type { LoadedPair } from "./known-parts.js";
import { QuestNameProvider } from "../quest-names.js";
import { shareBlockedReason } from "../useShareBuild.js";
import { CompareToolbar } from "./compare-toolbar.js";
import { CompareStatDelta } from "./compare-stat-delta.js";
import { CompareProgressionRow } from "./compare-progression-row.js";
import { CompareSide, computeSideSpec, reseedSide } from "./compare-side.js";
import { useCompareDraft, type CompareSide as Side } from "./useCompareDraft.js";
import { priceBuild, pricesStatus } from "../build-price.js";
import { usePendingSeed } from "../usePendingSeed.js";
import { HANDOFF_KEYS } from "../useCompareHandoff.js";

export interface CompareWorkspaceProps {
  /** A saved comparison, both sides already through `loadPair`. */
  initialPair?: LoadedPair;
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
          left: initialPair.left,
          right: initialPair.right,
          leftProfile: initialPair.leftProfile,
          rightProfile: initialPair.rightProfile,
          name: initialPair.name,
          description: initialPair.description,
          // The pair already publishes them: a re-save keeps them unless the user opts out.
          embedProfiles:
            initialPair.leftProfile !== undefined || initialPair.rightProfile !== undefined,
          dirty: false,
        }
      : undefined,
  );

  const weapons = useWeaponList();
  const mods = usePartCatalog();
  const leftTree = useWeaponTree(draft.state.left?.weaponId ?? "");
  const rightTree = useWeaponTree(draft.state.right?.weaponId ?? "");
  const presets = useWeaponPresets();
  const livePrices = useLivePrices();

  const save = useSavePair();
  const fork = useForkPair();

  // The id the store just minted, held until the router hands this component the same id as
  // `initialPairId`. `navigate()` starts a transition rather than finishing one: the URL
  // flips to /builder/compare/<id> immediately, but `builder.compare.tsx` keeps rendering
  // *this* workspace until the child route's match commits (with `autoCodeSplitting` that
  // window also covers fetching the child's chunk). Without this the toolbar spends the
  // whole transition reading "Save comparison" at a URL that already carries a pairId —
  // a button that would POST a second, duplicate pair. See issue #163.
  const [savedPairId, setSavedPairId] = useState<string | null>(null);
  const pairId = initialPairId ?? savedPairId ?? undefined;

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
  const builderData = useBuilderData();
  // Set when the game data a pasted build is read against fails to load. Without it the
  // right side cannot be shown at all, and pasting again would fail the same way.
  const [gameDataError, setGameDataError] = useState<string | null>(null);
  const mountSnapshot = useRef({ initialPair, draft, builderData });
  useEffect(() => {
    const { initialPair, draft, builderData } = mountSnapshot.current;
    if (initialPair) return;
    const raw = sessionStorage.getItem(HANDOFF_KEYS.left);
    const mode = sessionStorage.getItem(HANDOFF_KEYS.mode);
    const rightId = sessionStorage.getItem(HANDOFF_KEYS.rightBuildId);
    const rawProfile = sessionStorage.getItem(HANDOFF_KEYS.profile);
    if (!raw || !mode) return;

    try {
      const left = JSON.parse(raw) as BuildV6;
      // Only accept the current version; loadBuild upgrades v3/v4 on the way in.
      if (left.version !== 6) return;
      // Present only for a handoff from progression; a handoff written before the key
      // existed has none, and is theorycraft as it was. A profile that does not parse drops
      // the handoff, as a malformed build does.
      const profile = rawProfile === null ? undefined : PlayerProfile.parse(JSON.parse(rawProfile));
      draft.setSide("left", left);
      // Both sides, whatever fills the right: the comparison is under the viewer's profile.
      draft.setProfile("left", profile);
      draft.setProfile("right", profile);
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
          const snapshotLoad = builderData.snapshot();
          try {
            const [right, snapshot] = await Promise.all([loadBuild(fetch, rightId), snapshotLoad]);
            // Through the same load path as /builder/$id: any version, read against the game data.
            draft.setSide("right", loadSavedBuild(right, snapshot));
          } catch {
            // A game-data failure is shown: it needs a reload, not another paste. A build
            // that failed to load leaves the right side empty, and can be pasted again.
            const failure = await snapshotLoad.then(
              () => null,
              (error: unknown) => error,
            );
            if (failure !== null) {
              setGameDataError(
                failure instanceof Error ? failure.message : "the game data could not be read",
              );
            }
          }
        })();
      }
    } catch {
      // Malformed session storage — skip.
    } finally {
      for (const key of Object.values(HANDOFF_KEYS)) sessionStorage.removeItem(key);
      draft.markClean(); // fresh-clone from Builder shouldn't start "dirty"
    }
    // Run once on mount, against the mount-time snapshot above.
  }, []);

  // Each side's seed made before live prices arrived is redone once they do, unless that side
  // was edited since. A side's mode is its own: progression with a profile.
  const prices = pricesStatus(livePrices);
  const leftSeed = usePendingSeed({
    mode: draft.state.leftProfile === undefined ? "theorycraft" : "progression",
    prices,
    weaponId: draft.state.left?.weaponId ?? "",
    reseed: (id) => reseed("left", id),
  });
  const rightSeed = usePendingSeed({
    mode: draft.state.rightProfile === undefined ? "theorycraft" : "progression",
    prices,
    weaponId: draft.state.right?.weaponId ?? "",
    reseed: (id) => reseed("right", id),
  });
  function reseed(side: Side, weaponId: string) {
    const build = side === "left" ? draft.state.left : draft.state.right;
    if (build === null) return;
    const profile = side === "left" ? draft.state.leftProfile : draft.state.rightProfile;
    draft.setSide(side, reseedSide(build, weaponId, presets.data?.[weaponId] ?? [], profile));
  }
  const seedOf = (side: Side) => (side === "left" ? leftSeed : rightSeed);
  const editSide = (side: Side, build: BuildV6 | null) => {
    draft.setSide(side, build);
    seedOf(side).clear();
  };

  const diff = useMemo(() => {
    const l =
      draft.state.left && leftTree.data
        ? {
            tree: leftTree.data,
            attachments: draft.state.left.attachments,
          }
        : null;
    const r =
      draft.state.right && rightTree.data
        ? {
            tree: rightTree.data,
            attachments: draft.state.right.attachments,
          }
        : null;
    return slotDiff(l, r);
  }, [draft.state.left, draft.state.right, leftTree.data, rightTree.data]);

  const leftSpec = useMemo(
    () => computeSideSpec(draft.state.left, leftTree.data, weapons.data, mods.data),
    [draft.state.left, leftTree.data, weapons.data, mods.data],
  );
  const rightSpec = useMemo(
    () => computeSideSpec(draft.state.right, rightTree.data, weapons.data, mods.data),
    [draft.state.right, rightTree.data, weapons.data, mods.data],
  );

  // Each side is priced under its own profile, or with every gate open when it has none.
  const byId = useMemo(() => partsById(mods.data ?? []), [mods.data]);
  const leftPrice = useMemo(() => {
    const build = draft.state.left;
    if (!build) return null;
    return priceBuild(
      draft.state.leftProfile ?? null,
      weapons.data?.find((w) => w.id === build.weaponId),
      leftTree.data,
      build.attachments,
      byId,
      presets.data?.[build.weaponId] ?? [],
    );
  }, [draft.state.left, draft.state.leftProfile, weapons.data, leftTree.data, byId, presets.data]);
  const rightPrice = useMemo(() => {
    const build = draft.state.right;
    if (!build) return null;
    return priceBuild(
      draft.state.rightProfile ?? null,
      weapons.data?.find((w) => w.id === build.weaponId),
      rightTree.data,
      build.attachments,
      byId,
      presets.data?.[build.weaponId] ?? [],
    );
  }, [
    draft.state.right,
    draft.state.rightProfile,
    weapons.data,
    rightTree.data,
    byId,
    presets.data,
  ]);

  // A saved side may carry at most ORPHANED_CAP orphans; the user dismisses them, nothing drops.
  const saveBlocked =
    [draft.state.left, draft.state.right]
      .map((side) => (side === null ? null : shareBlockedReason(side)))
      .find((reason) => reason !== null) ?? null;

  const handleSave = useCallback(() => {
    if (saveBlocked !== null) return;
    const pair: BuildPair = {
      v: CURRENT_PAIR_VERSION,
      createdAt: new Date().toISOString(),
      left: draft.state.left,
      right: draft.state.right,
      // A profile is published only when the user opts in, as a Builder share's is.
      ...(draft.state.embedProfiles
        ? { leftProfile: draft.state.leftProfile, rightProfile: draft.state.rightProfile }
        : {}),
      name: draft.state.name,
      description: draft.state.description,
    };
    save.mutate(pair, {
      onSuccess: (res) => {
        draft.markClean();
        setSavedPairId(res.id);
        void navigate({
          to: "/builder/compare/$pairId",
          params: { pairId: res.id },
        });
      },
      // No onError branch: react-query records the rejection on `save.error`, which the
      // toolbar renders. Swallowing it here — or leaving it unread, as this did — is what
      // made a failed save produce no toast, no message and no state change at all.
    });
  }, [draft, save, navigate, saveBlocked]);

  const handleSaveAsNew = useCallback(() => {
    if (initialPairId) {
      fork.mutate(initialPairId, {
        onSuccess: (res) => {
          draft.markClean();
          setSavedPairId(res.id);
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
  const hasProfile =
    draft.state.leftProfile !== undefined || draft.state.rightProfile !== undefined;

  const nameOf = (id: string): string =>
    weapons.data?.find((w) => w.id === id)?.name ?? byId.get(id)?.name ?? id;
  const canClone = canSwap;

  return (
    <QuestNameProvider>
      <div className="flex flex-col gap-4">
        <CompareToolbar
          dirty={draft.state.dirty}
          pairId={pairId}
          canSwap={canSwap}
          canClone={canClone}
          isSaving={save.isPending || fork.isPending}
          saveError={save.error ?? fork.error}
          saveBlocked={saveBlocked}
          onSave={handleSave}
          onSaveAsNew={handleSaveAsNew}
          embedProfiles={hasProfile ? draft.state.embedProfiles : undefined}
          onEmbedProfilesChange={draft.setEmbedProfiles}
          onSwap={() => {
            draft.swap();
            leftSeed.clear();
            rightSeed.clear();
          }}
          onCloneLeftToRight={() => {
            draft.cloneLeftToRight();
            rightSeed.clear();
          }}
          onCloneRightToLeft={() => {
            draft.cloneRightToLeft();
            leftSeed.clear();
          }}
        />

        {gameDataError !== null && (
          <p role="alert" className="text-sm text-[var(--color-destructive)]">
            Failed to load data: {gameDataError}
          </p>
        )}

        <CompareStatDelta left={leftSpec} right={rightSpec} />

        <CompareProgressionRow
          left={{ price: leftPrice, gated: draft.state.leftProfile !== undefined }}
          right={{ price: rightPrice, gated: draft.state.rightProfile !== undefined }}
          prices={prices}
          nameOf={nameOf}
        />

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <CompareSide
            label="A"
            sectionIndex={1}
            build={draft.state.left}
            profile={draft.state.leftProfile}
            diff={diff}
            onBuildChange={(b: BuildV6 | null) => editSide("left", b)}
            onWeaponSeeded={leftSeed.seeded}
          />
          <CompareSide
            label="B"
            sectionIndex={2}
            build={draft.state.right}
            profile={draft.state.rightProfile}
            diff={diff}
            onBuildChange={(b: BuildV6 | null) => editSide("right", b)}
            onWeaponSeeded={rightSeed.seeded}
          />
        </div>
      </div>
    </QuestNameProvider>
  );
}
