import { z } from "zod";
import { PlayerProfile } from "@tarkov/data";

/**
 * The viewer's side profiles, kept across the navigation a save makes when they were not
 * published with the pair. The saved pair's route reads them once, so the view after a save is
 * the view before it. They are the viewer's own, never part of the pair.
 */
const KEY = "compare:viewerProfiles";

const Carried = z.object({
  pairId: z.string(),
  leftProfile: PlayerProfile.optional(),
  rightProfile: PlayerProfile.optional(),
});

export interface ViewerProfiles {
  readonly leftProfile?: PlayerProfile;
  readonly rightProfile?: PlayerProfile;
}

/** Keep `profiles` for the pair just saved as `pairId`; with none to keep, drop any held. */
export function keepViewerProfiles(pairId: string, profiles: ViewerProfiles): void {
  if (profiles.leftProfile === undefined && profiles.rightProfile === undefined) {
    sessionStorage.removeItem(KEY);
    return;
  }
  sessionStorage.setItem(KEY, JSON.stringify({ pairId, ...profiles }));
}

/**
 * The profiles kept for `pairId`, or `null`. Leaves the key in place: React may run a state
 * initializer twice, so the caller drops it with {@link dropViewerProfiles} once mounted. A
 * value that does not parse is no carry-over.
 */
export function peekViewerProfiles(pairId: string): ViewerProfiles | null {
  const raw = sessionStorage.getItem(KEY);
  if (raw === null) return null;
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return null;
  }
  const parsed = Carried.safeParse(value);
  if (!parsed.success || parsed.data.pairId !== pairId) return null;
  return { leftProfile: parsed.data.leftProfile, rightProfile: parsed.data.rightProfile };
}

export function dropViewerProfiles(): void {
  sessionStorage.removeItem(KEY);
}
