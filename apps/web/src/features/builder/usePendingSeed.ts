import { useCallback, useState } from "react";
import type { BuilderMode } from "@tarkov/data";
import type { PricesStatus } from "./build-price.js";

export interface UsePendingSeedArgs {
  /** The mode the build was seeded in: only a progression seed reads live prices. */
  mode: BuilderMode;
  /** Where live prices stand. */
  prices: PricesStatus;
  /** The weapon on the build now. */
  weaponId: string;
  /**
   * Seeds `weaponId` again, now that prices are in. Called during render, so it may only set
   * state owned by the component calling this hook.
   */
  reseed: (weaponId: string) => void;
}

export interface UsePendingSeedResult {
  /** A new weapon was just seeded: if that seed read prices still loading, it is redone. */
  seeded: (weaponId: string) => void;
  /** The build was edited or committed: the seed on it is the user's now, never redone. */
  clear: () => void;
}

/**
 * A progression seed made before live prices arrive is made with every flea price unknown.
 * This redoes it once they arrive, unless the build was edited or committed since. A switch
 * to theorycraft drops it, as that seed reads no prices, and a failed price fetch keeps the
 * seed made without them.
 *
 * Settled during render rather than in an effect, so the redone seed is what first paints with
 * the prices. That is why the hook belongs to the component that owns the build's state: the
 * Builder's `useBuilderState`, and for a Compare side the workspace that holds both sides.
 */
export function usePendingSeed({
  mode,
  prices,
  weaponId,
  reseed,
}: UsePendingSeedArgs): UsePendingSeedResult {
  const [pending, setPending] = useState<string | null>(null);
  // Stable, so a caller's memoized save handler can depend on it.
  const clear = useCallback(() => setPending(null), []);

  if (pending !== null && (mode !== "progression" || prices.state !== "loading")) {
    setPending(null);
    if (mode === "progression" && prices.state === "ready" && weaponId === pending) {
      reseed(pending);
    }
  }

  return {
    seeded: (id) => {
      if (mode === "progression" && prices.state === "loading") setPending(id);
    },
    clear,
  };
}
