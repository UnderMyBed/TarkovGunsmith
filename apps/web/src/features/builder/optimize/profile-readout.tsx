import type { ReactElement } from "react";
import type { PriceGate } from "@tarkov/data";
import { Button, SectionTitle } from "@tarkov/ui";
import type { UseTarkovTrackerSyncResult } from "../useTarkovTrackerSync.js";

export interface ProfileReadoutProps {
  /**
   * The gate the optimizer searches under (`useBuilderState`'s `gate`): the profile in
   * progression, `null` in theorycraft. Read here so the readout names what the search used.
   */
  gate: PriceGate;
  sync: UseTarkovTrackerSyncResult;
  onEditProfile: () => void;
}

const TRADER_KEYS = [
  "prapor",
  "therapist",
  "skier",
  "peacekeeper",
  "mechanic",
  "ragman",
  "jaeger",
] as const;

const TRADER_LABEL: Record<(typeof TRADER_KEYS)[number], string> = {
  prapor: "Prapor",
  therapist: "Thera",
  skier: "Skier",
  peacekeeper: "Peace",
  mechanic: "Mech",
  ragman: "Ragman",
  jaeger: "Jaeger",
};

function formatRelativeTime(then: number, now = Date.now()): string {
  const ms = Math.max(0, now - then);
  const hours = Math.floor(ms / 3_600_000);
  if (hours < 1) {
    const minutes = Math.max(1, Math.floor(ms / 60_000));
    return `${minutes}m ago`;
  }
  if (hours < 48) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export function ProfileReadout({ gate, sync, onEditProfile }: ProfileReadoutProps): ReactElement {
  if (gate === null) {
    return (
      <div className="flex flex-col gap-2">
        <SectionTitle index={3} title="Profile" />
        <div className="text-11 text-[var(--color-muted-foreground)]">Theorycraft</div>
        <p className="text-11 text-[var(--color-foreground)]">
          Every trader, flea offer and quest open
        </p>
        <Button size="sm" variant="ghost" onClick={onEditProfile}>
          Set progression ▸
        </Button>
      </div>
    );
  }
  return <ProgressionReadout profile={gate} sync={sync} onEditProfile={onEditProfile} />;
}

function ProgressionReadout({
  profile,
  sync,
  onEditProfile,
}: Omit<ProfileReadoutProps, "gate"> & { profile: NonNullable<PriceGate> }): ReactElement {
  const isSynced = sync.detail.state === "synced";
  const isSyncing = sync.detail.state === "syncing";
  // RE-IMPORT calls `sync.reSync()`, which needs a stored token — every state except
  // `disconnected` has one, including `connected` (a returning visitor who hasn't imported
  // yet this session) and `error` (a fetch that failed and is worth retrying). Gating on
  // `synced` instead would leave exactly those two users looking at a dead button.
  const canReSync = sync.detail.state !== "disconnected";

  const meta = isSynced
    ? `TarkovTracker · ${formatRelativeTime((sync.detail as Extract<typeof sync.detail, { state: "synced" }>).lastSyncedAt)}`
    : "Manual";

  return (
    <div className="flex flex-col gap-2">
      <SectionTitle index={3} title="Profile" />
      <div className="text-11 text-[var(--color-muted-foreground)]">{meta}</div>
      <div className="grid grid-cols-2 gap-1">
        <div className="flex items-center justify-between border border-[var(--color-border)] px-1.5 py-0.5">
          <span className="text-11 text-[var(--color-muted-foreground)]">PMC level</span>
          <span className="font-mono text-11 font-semibold text-[var(--color-foreground)]">
            {profile.level}
          </span>
        </div>
        {/* Level only gates anything while flea access is on, so the two read together. */}
        <div className="flex items-center justify-between border border-[var(--color-border)] px-1.5 py-0.5">
          <span className="text-11 text-[var(--color-muted-foreground)]">Flea</span>
          <span
            className={`text-11 font-semibold ${
              profile.flea
                ? "text-[var(--color-primary-text)]"
                : "text-[var(--color-muted-foreground)]"
            }`}
          >
            {profile.flea ? "On" : "Off"}
          </span>
        </div>
      </div>
      <div className="grid grid-cols-3 gap-1">
        {TRADER_KEYS.map((key) => {
          const level = (profile.traders as Record<string, number>)?.[key] ?? 1;
          const colour =
            level >= 3 ? "text-[var(--color-primary-text)]" : "text-[var(--color-foreground)]";
          return (
            <div
              key={key}
              className="flex items-center justify-between border border-[var(--color-border)] px-1.5 py-0.5"
            >
              <span className="text-11 text-[var(--color-muted-foreground)]">
                {TRADER_LABEL[key]}
              </span>
              <span className={`font-mono text-11 font-semibold ${colour}`}>L{level}</span>
            </div>
          );
        })}
      </div>
      <div className="flex gap-1">
        <Button
          size="sm"
          variant="secondary"
          onClick={() => {
            void sync.reSync();
          }}
          disabled={!canReSync || isSyncing}
          className="flex-1"
        >
          Re-import
        </Button>
        <Button size="sm" variant="ghost" onClick={onEditProfile}>
          Edit profile ▸
        </Button>
      </div>
    </div>
  );
}
