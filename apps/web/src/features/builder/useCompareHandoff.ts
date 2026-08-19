import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { CURRENT_BUILD_VERSION, type PlayerProfile } from "@tarkov/data";
import type { CompareFromBuildConfirm } from "./compare/compare-from-build-dialog.js";

export interface UseCompareHandoffArgs {
  weaponId: string;
  attachments: Readonly<Record<string, string>>;
  orphaned: string[];
  profile: PlayerProfile;
  embedProfileOnSave: boolean;
  buildName: string;
  buildDescription: string;
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
    const leftBuild = {
      version: CURRENT_BUILD_VERSION,
      weaponId: args.weaponId,
      attachments: args.attachments,
      orphaned: args.orphaned,
      createdAt: new Date().toISOString(),
      ...(args.embedProfileOnSave ? { profileSnapshot: args.profile } : {}),
      ...(args.buildName.trim().length > 0 ? { name: args.buildName.trim() } : {}),
      ...(args.buildDescription.trim().length > 0
        ? { description: args.buildDescription.trim() }
        : {}),
    };
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
