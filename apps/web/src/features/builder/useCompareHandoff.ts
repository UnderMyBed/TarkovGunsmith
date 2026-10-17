import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import type { BuildV6, PriceGate } from "@tarkov/data";
import type { CompareFromBuildConfirm } from "./compare/compare-from-build-dialog.js";

export interface UseCompareHandoffArgs {
  /** The current build (`toBuildPayload`), handed to Compare as its left side. */
  build: BuildV6;
  /**
   * The Builder's gate: the profile in progression, `null` in theorycraft. Compare puts a
   * profile on both sides, so it prices and gates them as the Builder did.
   */
  gate: PriceGate;
}

export interface UseCompareHandoffResult {
  isOpen: boolean;
  open: () => void;
  close: () => void;
  /** Persists the current build as the compare "left" prefill, then navigates to /builder/compare. */
  confirm: (result: CompareFromBuildConfirm) => void;
}

/**
 * The `sessionStorage` keys of the handoff, read once and cleared by `CompareWorkspace`.
 * `profile` is absent for a theorycraft handoff.
 */
export const HANDOFF_KEYS = {
  left: "compare:leftPrefill",
  mode: "compare:mode",
  rightBuildId: "compare:rightBuildId",
  profile: "compare:profile",
} as const;

/**
 * Owns the compare-from-build dialog's open state and the handoff to `/builder/compare`:
 * the current build is serialized into `sessionStorage` (small blob, cleared on consumption
 * by the compare route) rather than passed via router state, then the router navigates.
 */
export function useCompareHandoff(args: UseCompareHandoffArgs): UseCompareHandoffResult {
  const navigate = useNavigate();
  const [isOpen, setIsOpen] = useState(false);

  function confirm(result: CompareFromBuildConfirm) {
    const leftBuild: BuildV6 = { ...args.build, createdAt: new Date().toISOString() };
    sessionStorage.setItem(HANDOFF_KEYS.left, JSON.stringify(leftBuild));
    sessionStorage.setItem(HANDOFF_KEYS.mode, result.mode);
    if (result.mode === "paste-url") {
      sessionStorage.setItem(HANDOFF_KEYS.rightBuildId, result.rightBuildId);
    } else {
      sessionStorage.removeItem(HANDOFF_KEYS.rightBuildId);
    }
    // Removed in theorycraft, so a profile from an earlier handoff never consumed cannot leak in.
    if (args.gate !== null) {
      sessionStorage.setItem(HANDOFF_KEYS.profile, JSON.stringify(args.gate));
    } else {
      sessionStorage.removeItem(HANDOFF_KEYS.profile);
    }
    void navigate({ to: "/builder/compare" });
  }

  return {
    isOpen,
    open: () => setIsOpen(true),
    close: () => setIsOpen(false),
    confirm,
  };
}
