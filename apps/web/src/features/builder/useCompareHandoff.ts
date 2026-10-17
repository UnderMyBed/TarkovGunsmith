import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import type { BuildV6 } from "@tarkov/data";
import type { CompareFromBuildConfirm } from "./compare/compare-from-build-dialog.js";

export interface UseCompareHandoffArgs {
  /** The current build (`toBuildPayload`), handed to Compare as its left side. */
  build: BuildV6;
}

export interface UseCompareHandoffResult {
  isOpen: boolean;
  open: () => void;
  close: () => void;
  /** Persists the current build as the compare "left" prefill, then navigates to /builder/compare. */
  confirm: (result: CompareFromBuildConfirm) => void;
}

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
    sessionStorage.setItem("compare:leftPrefill", JSON.stringify(leftBuild));
    sessionStorage.setItem("compare:mode", result.mode);
    if (result.mode === "paste-url") {
      sessionStorage.setItem("compare:rightBuildId", result.rightBuildId);
    } else {
      sessionStorage.removeItem("compare:rightBuildId");
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
