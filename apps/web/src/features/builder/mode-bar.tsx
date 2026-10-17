import { useState, type ReactElement } from "react";
import {
  loyaltyProfile,
  type BuilderMode,
  type LoyaltyLevel,
  type Progression,
} from "@tarkov/data";
import { Button, Card, CardContent, CardDescription, CardHeader, CardTitle } from "@tarkov/ui";
import { TarkovTrackerConnectPopover } from "./tarkovtracker-connect-popover.js";
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
 * The Builder's mode. In theorycraft, the "Set your progression" prompt: one click sets every
 * trader to a loyalty level, or TarkovTracker imports the profile, and either switches to
 * progression. In progression, the toggle back. The toggle is in both.
 */
export function ModeBar({ progression, sync }: ModeBarProps): ReactElement {
  const { profile, setProfile, mode, setMode } = progression;
  const [popoverOpen, setPopoverOpen] = useState(false);

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
            onClick={() => setProfile(loyaltyProfile(ll, profile))}
          >
            LL{ll}
          </Button>
        ))}
        <Button type="button" size="sm" variant="ghost" onClick={() => setPopoverOpen(true)}>
          ▲ Import from TarkovTracker
        </Button>
      </CardContent>

      <TarkovTrackerConnectPopover
        open={popoverOpen}
        onClose={() => setPopoverOpen(false)}
        onConnect={(token) => {
          setPopoverOpen(false);
          // TarkovTracker brings completed quests, which only advanced mode reads.
          setProfile({ ...profile, mode: "advanced" });
          void sync.connect(token);
        }}
      />
    </Card>
  );
}
