import { useState } from "react";
import { orphanUnknownParts, type BuilderSnapshot } from "@tarkov/data";

/**
 * One-shot resolution of a shared build's attachments against the game data, run as soon as
 * the snapshot has loaded.
 *
 * A part the snapshot no longer holds (upstream removed it since the build was shared) moves
 * from `attachments` into `orphaned`, where the orphan banner lists it and a re-share carries
 * it on — never silently dropped. Set during render rather than in an effect for the same
 * reason as `useV1Migration`: React re-renders with the resolved state before anything paints.
 */
export function useSnapshotOrphans(
  snapshot: BuilderSnapshot | undefined,
  initialAttachments: Readonly<Record<string, string>> | undefined,
  initialOrphaned: readonly string[] | undefined,
  setAttachments: (attachments: Record<string, string>) => void,
  setOrphaned: (orphaned: string[]) => void,
): void {
  const [resolved, setResolved] = useState(false);
  if (!resolved && snapshot !== undefined && initialAttachments !== undefined) {
    setResolved(true);
    const next = orphanUnknownParts(snapshot, initialAttachments, initialOrphaned ?? []);
    setAttachments(next.attachments);
    setOrphaned(next.orphaned);
  }
}
