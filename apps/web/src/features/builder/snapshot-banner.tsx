import { useState } from "react";
import type { BuilderMode, PlayerProfile } from "@tarkov/data";
import { Button, Card, CardContent } from "@tarkov/ui";

export interface SnapshotBannerProps {
  /** The author's embedded progression snapshot, or undefined if this build didn't carry one. */
  snapshot: PlayerProfile | undefined;
  /**
   * Fires when the viewer chooses to adopt the author's snapshot as their own profile, which
   * also switches to progression.
   */
  onUseSnapshot: (snapshot: PlayerProfile) => void;
  /** The viewer's own mode: what availability uses until they switch. */
  mode: BuilderMode;
}

/**
 * Shown once, at the top of a build loaded from a shared URL that embedded the author's
 * progression snapshot. The viewer stays in their own mode, theorycraft or progression on their
 * own profile; this offers switching to the author's profile instead. Dismissal is local to this component instance — the
 * banner never reappears for this page load, whether dismissed outright or via "Use author's
 * profile", matching the original inline behaviour it replaced.
 */
export function SnapshotBanner({ snapshot, onUseSnapshot, mode }: SnapshotBannerProps) {
  const [dismissed, setDismissed] = useState(false);
  if (!snapshot || dismissed) return null;

  return (
    <Card>
      <CardContent className="flex items-start justify-between gap-3 pt-6">
        <div className="flex-1">
          <p className="text-sm font-medium">
            This build was shared with a progression snapshot ({snapshot.mode} mode).
          </p>
          <p className="mt-1 text-xs text-[var(--color-muted-foreground)]">
            {mode === "theorycraft"
              ? "Everything is unlocked. Use the author's profile to see what they could get."
              : "Availability currently uses your saved profile. Switch to the author's snapshot to see exactly what they had access to."}
          </p>
        </div>
        <div className="flex flex-col gap-2">
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              onUseSnapshot(snapshot);
              setDismissed(true);
            }}
          >
            Use author&apos;s profile
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setDismissed(true)}>
            Dismiss
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
