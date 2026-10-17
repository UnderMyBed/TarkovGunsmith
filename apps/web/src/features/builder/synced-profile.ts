import type { PlayerProfile, Progression } from "@tarkov/data";
import type { SyncCause } from "./useTarkovTrackerSync.js";

/**
 * Apply a profile TarkovTracker imported.
 *
 * The first import that succeeds is the user choosing that progression: it is set, in advanced
 * mode (the quests it brings are read only there), which switches the Builder to progression.
 * That is a `connect`, or any sync while no profile is set yet: a re-sync after a first import
 * failed (rate-limited, offline, the quest list not loaded), in this page or after a reload,
 * is still that first import.
 *
 * Once a profile is set, a re-sync only refreshes it and leaves the mode as the user last set
 * it, so one that lands after a switch to theorycraft stays in theorycraft.
 */
export function applySyncedProfile(
  progression: Pick<Progression, "hasProfile" | "setProfile" | "updateProfile">,
  next: PlayerProfile,
  cause: SyncCause,
): void {
  if (cause === "connect" || !progression.hasProfile) {
    progression.setProfile({ ...next, mode: "advanced" });
  } else {
    progression.updateProfile(next);
  }
}
