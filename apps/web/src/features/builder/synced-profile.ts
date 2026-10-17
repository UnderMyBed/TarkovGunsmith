import type { PlayerProfile, Progression } from "@tarkov/data";
import type { SyncCause } from "./useTarkovTrackerSync.js";

/**
 * Apply a profile TarkovTracker imported. A connect is the user choosing that progression: it
 * is set, in advanced mode (the quests it brings are read only there), which switches the
 * Builder to progression. A re-sync only refreshes the stored profile and leaves the mode as
 * the user last set it, so one that lands after a switch to theorycraft stays in theorycraft.
 */
export function applySyncedProfile(
  progression: Pick<Progression, "setProfile" | "updateProfile">,
  next: PlayerProfile,
  cause: SyncCause,
): void {
  if (cause === "connect") progression.setProfile({ ...next, mode: "advanced" });
  else progression.updateProfile(next);
}
