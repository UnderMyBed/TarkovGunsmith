import { orphanUnknownParts, type BuildPair, type BuilderSnapshot } from "@tarkov/data";

type Side = BuildPair["left"];

/**
 * One build with its parts resolved against the game data: a part the snapshot does not hold
 * moves into `orphaned`. The same rule the Builder applies on load.
 */
export function withKnownSide<S extends Side>(side: S, snapshot: BuilderSnapshot): S {
  if (side === null || side.version !== 6) return side;
  return { ...side, ...orphanUnknownParts(snapshot, side.attachments, side.orphaned) };
}

/**
 * A loaded comparison with each side's parts resolved against the game data: a part the
 * snapshot no longer holds moves into that side's `orphaned`, which its orphan banner lists
 * and a re-save carries on.
 */
export function withKnownParts(pair: BuildPair, snapshot: BuilderSnapshot): BuildPair {
  return {
    ...pair,
    left: withKnownSide(pair.left, snapshot),
    right: withKnownSide(pair.right, snapshot),
  };
}
