import { loadSavedBuild, type BuildPair, type BuildV6, type BuilderSnapshot } from "@tarkov/data";

/** A saved comparison with both sides loaded: current version, read against the game data. */
export type LoadedPair = Omit<BuildPair, "left" | "right"> & {
  readonly left: BuildV6 | null;
  readonly right: BuildV6 | null;
};

/**
 * A saved comparison's two sides through the Builder's own load path (`loadSavedBuild`): a v1
 * or v2 side is migrated forward rather than dropped, and a part not on its weapon moves into
 * that side's `orphaned`, which its orphan banner lists and a re-save carries on.
 */
export function loadPair(pair: BuildPair, snapshot: BuilderSnapshot): LoadedPair {
  return {
    ...pair,
    left: pair.left === null ? null : loadSavedBuild(pair.left, snapshot),
    right: pair.right === null ? null : loadSavedBuild(pair.right, snapshot),
  };
}
