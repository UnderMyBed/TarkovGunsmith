import { useId, useState, type ReactElement } from "react";
import { loyaltyProfile, type LoyaltyLevel, type Progression } from "@tarkov/data";
import { Button, Dialog, DialogBody, DialogPanel, DialogTitle } from "@tarkov/ui";
import { ProfileEditor } from "./profile-editor.js";
import { TarkovTrackerConnectPopover } from "./tarkovtracker-connect-popover.js";
import { TarkovTrackerSyncBanner } from "./tarkovtracker-sync-banner.js";
import type { UseTarkovTrackerSyncResult } from "./useTarkovTrackerSync.js";

const LOYALTY_LEVELS: readonly LoyaltyLevel[] = [1, 2, 3, 4];

export interface ProgressionStatusProps {
  progression: Pick<Progression, "hasProfile">;
  sync: UseTarkovTrackerSyncResult;
  onOpenPanel: () => void;
  /** The id the busy note takes while a sync is in flight, or `undefined`. */
  busyId: string | undefined;
}

/**
 * The progression lines under the stat strip.
 *
 * With no profile set, the first visit's prompt: everything is unlocked, and the progression
 * panel is one click away. An import started there and still under way, failed, or left
 * after a reload shows its progress, its error and its Re-sync here too. A failed sync shows
 * here whether or not a profile is set. While any sync is in flight, the note the disabled
 * mode controls point at.
 */
export function ProgressionStatus({
  progression,
  sync,
  onOpenPanel,
  busyId,
}: ProgressionStatusProps): ReactElement | null {
  // A first import shows its progress here. Any failed sync shows here too: with a profile set,
  // a re-sync started in the panel can fail after the panel is closed, and the banner inside the
  // panel would then say so to no one.
  const banner =
    (!progression.hasProfile && sync.state !== "disconnected" && sync.state !== "synced") ||
    sync.state === "error";
  if (progression.hasProfile && busyId === undefined && !banner) return null;
  return (
    <div className="flex flex-col gap-2">
      {!progression.hasProfile && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-[var(--radius-panel)] border border-[var(--color-border)] bg-[var(--color-card)] px-4 py-3">
          <p className="text-sm">
            <span className="font-bold">Set your progression.</span>{" "}
            <span className="text-[var(--color-muted-foreground)]">
              Everything is unlocked. Pick your trader loyalty to see what you can buy right now.
            </span>
          </p>
          <Button
            variant="secondary"
            size="sm"
            disabled={busyId !== undefined}
            aria-describedby={busyId}
            onClick={onOpenPanel}
          >
            Set progression…
          </Button>
        </div>
      )}
      {banner && <TarkovTrackerSyncBanner sync={sync} />}
      {busyId !== undefined && (
        <p id={busyId} role="status" className="text-xs text-[var(--color-muted-foreground)]">
          Importing from TarkovTracker…
        </p>
      )}
    </div>
  );
}

export interface ProgressionPanelProps {
  open: boolean;
  onClose: () => void;
  progression: Pick<Progression, "profile" | "hasProfile" | "setProfile">;
  sync: UseTarkovTrackerSyncResult;
  /** As for {@link ProgressionStatus}: one-click profiles and the import wait on a sync. */
  busyId: string | undefined;
}

/**
 * The progression panel, opened from "My progression…": the profile editor, and, while no
 * profile is set, the one-click profiles.
 *
 * One click sets every trader to a loyalty level, or TarkovTracker imports the profile; either
 * switches to progression, the import only once it succeeds (`applySyncedProfile`), and either
 * closes the panel. With a profile set the one-click profiles are not offered, since one click
 * would overwrite the user's own trader levels with no undo.
 */
export function ProgressionPanel({
  open,
  onClose,
  progression,
  sync,
  busyId,
}: ProgressionPanelProps): ReactElement {
  const titleId = useId();
  const [importOpen, setImportOpen] = useState(false);
  const { profile, hasProfile, setProfile } = progression;
  const busy = busyId !== undefined;

  return (
    <Dialog open={open} onClose={onClose} labelledBy={titleId}>
      <DialogPanel className="max-h-[90vh] overflow-y-auto">
        <DialogTitle id={titleId}>Your progression</DialogTitle>
        <DialogBody className="flex flex-col gap-5">
          {!hasProfile && (
            <section aria-label="One-click profiles" className="flex flex-col gap-2">
              <p className="text-sm text-[var(--color-muted-foreground)]">
                Every trader at one loyalty level, or your progression from TarkovTracker.
              </p>
              <div className="flex flex-wrap items-center gap-2">
                {LOYALTY_LEVELS.map((ll) => (
                  <Button
                    key={ll}
                    size="sm"
                    variant="secondary"
                    disabled={busy}
                    aria-describedby={busyId}
                    onClick={() => {
                      setProfile(loyaltyProfile(ll, profile));
                      onClose();
                    }}
                  >
                    LL{ll}
                  </Button>
                ))}
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={busy}
                  aria-describedby={busyId}
                  onClick={() => setImportOpen(true)}
                >
                  Import from TarkovTracker
                </Button>
              </div>
            </section>
          )}
          <ProfileEditor profile={profile} onChange={setProfile} sync={sync} />
          <div className="flex justify-end">
            <Button size="sm" onClick={onClose}>
              Done
            </Button>
          </div>
        </DialogBody>
        <TarkovTrackerConnectPopover
          open={importOpen}
          onClose={() => setImportOpen(false)}
          onConnect={(token) => {
            setImportOpen(false);
            onClose();
            // Nothing is written until the import succeeds: a bad token leaves a first visit
            // in theorycraft with no profile stored. Its progress shows under the stat strip.
            void sync.connect(token);
          }}
        />
      </DialogPanel>
    </Dialog>
  );
}
