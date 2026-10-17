import { orphanUnknownParts, type BuildPair, type BuilderSnapshot } from "@tarkov/data";

type Side = BuildPair["left"];

function resolveSide(side: Side, snapshot: BuilderSnapshot): Side {
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
    left: resolveSide(pair.left, snapshot),
    right: resolveSide(pair.right, snapshot),
  };
}
