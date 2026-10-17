import { useId, useState, type ReactElement } from "react";
import {
  loyaltyProfile,
  type BuilderMode,
  type LoyaltyLevel,
  type Progression,
} from "@tarkov/data";
import { Button, Card, CardContent, CardDescription, CardHeader, CardTitle } from "@tarkov/ui";
import { TarkovTrackerConnectPopover } from "./tarkovtracker-connect-popover.js";
import { TarkovTrackerSyncBanner } from "./tarkovtracker-sync-banner.js";
import type { UseTarkovTrackerSyncResult } from "./useTarkovTrackerSync.js";

export interface ModeBarProps {
  progression: Progression;
  sync: UseTarkovTrackerSyncResult;
}

const LOYALTY_LEVELS: readonly LoyaltyLevel[] = [1, 2, 3, 4];

const MODE_LABEL: Record<BuilderMode, string> = {
  theorycraft: "Theorycraft",
  progression: "Progression",
};

/**
 * The Builder's mode, with the toggle in every state.
 *
 * - Theorycraft with no profile set: the "Set your progression" prompt. One click sets every
 *   trader to a loyalty level, or TarkovTracker imports the profile; either switches to
 *   progression, the import only once it succeeds (`applySyncedProfile`).
 * - Theorycraft with a profile set: the way back to it. The one-click profiles are not offered,
 *   since one click would overwrite the user's own trader levels with no undo.
 * - Progression: the toggle back.
 *
 * While a TarkovTracker sync is in flight, including its wait for the quest list, every
 * control here is disabled and says why. Whether the sync applies as the first import, and so
 * which mode it leaves, is decided when it lands; a one-click profile or a mode switch made in
 * between would be overwritten by it, or overwrite it.
 */
export function ModeBar({ progression, sync }: ModeBarProps): ReactElement {
  const { profile, hasProfile, setProfile, mode, setMode } = progression;
  const [popoverOpen, setPopoverOpen] = useState(false);
  const busy = sync.state === "syncing";
  const busyId = useId();
  const busyProps = { disabled: busy, "aria-describedby": busy ? busyId : undefined };
  const busyNote = busy && (
    <p id={busyId} role="status" className="w-full text-xs text-[var(--color-muted-foreground)]">
      Importing from TarkovTracker…
    </p>
  );

  const toggle = (
    <div
      role="group"
      aria-label="Builder mode"
      className="flex gap-1 rounded-[var(--radius)] border p-1"
    >
      {(["theorycraft", "progression"] as const).map((m) => (
        <Button
          key={m}
          type="button"
          size="sm"
          variant={mode === m ? "default" : "ghost"}
          aria-pressed={mode === m}
          {...busyProps}
          onClick={() => setMode(m)}
        >
          {MODE_LABEL[m]}
        </Button>
      ))}
    </div>
  );

  if (mode === "progression") {
    return (
      <Card data-testid="mode-bar">
        <CardContent className="flex flex-wrap items-center justify-between gap-3 pt-6">
          <p className="text-sm">
            <span className="font-medium">Progression.</span>{" "}
            <span className="text-[var(--color-muted-foreground)]">
              Weapons, parts, presets and prices follow your profile.
            </span>
          </p>
          {toggle}
          {busyNote}
        </CardContent>
      </Card>
    );
  }

  if (hasProfile) {
    return (
      <Card data-testid="mode-bar">
        <CardContent className="flex flex-wrap items-center justify-between gap-3 pt-6">
          <p className="text-sm">
            <span className="font-medium">Theorycraft.</span>{" "}
            <span className="text-[var(--color-muted-foreground)]">
              Everything is unlocked. Your progression is kept.
            </span>
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <Button type="button" size="sm" {...busyProps} onClick={() => setMode("progression")}>
              Back to your progression
            </Button>
            {toggle}
          </div>
          {busyNote}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card data-testid="mode-bar">
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle>Set your progression</CardTitle>
            <CardDescription>
              Everything is unlocked. Pick your trader loyalty to see what you can buy right now.
            </CardDescription>
          </div>
          {toggle}
        </div>
      </CardHeader>
      <CardContent className="flex flex-wrap items-center gap-2">
        {LOYALTY_LEVELS.map((ll) => (
          <Button
            key={ll}
            type="button"
            size="sm"
            variant="secondary"
            {...busyProps}
            onClick={() => setProfile(loyaltyProfile(ll, profile))}
          >
            LL{ll}
          </Button>
        ))}
        <Button
          type="button"
          size="sm"
          variant="ghost"
          {...busyProps}
          onClick={() => setPopoverOpen(true)}
        >
          ▲ Import from TarkovTracker
        </Button>
        {busyNote}
        {/* An import under way, or one that failed or was left after a reload: its progress,
            its error and its Re-sync show here, where it was started. */}
        {sync.state !== "disconnected" && sync.state !== "synced" && (
          <div className="w-full">
            <TarkovTrackerSyncBanner sync={sync} />
          </div>
        )}
      </CardContent>

      <TarkovTrackerConnectPopover
        open={popoverOpen}
        onClose={() => setPopoverOpen(false)}
        onConnect={(token) => {
          setPopoverOpen(false);
          // Nothing is written until the import succeeds: a bad token leaves a first visit
          // in theorycraft with no profile stored.
          void sync.connect(token);
        }}
      />
    </Card>
  );
}
