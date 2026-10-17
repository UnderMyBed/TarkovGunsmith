import type { ReactElement, ReactNode } from "react";
import { Button } from "@tarkov/ui";
import type { UseTarkovTrackerSyncResult } from "./useTarkovTrackerSync.js";

function relativeTime(ms: number): string {
  const diff = Math.max(0, Date.now() - ms);
  const sec = Math.round(diff / 1000);
  if (sec < 60) return `${sec}s ago`;
  const min = Math.round(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.round(min / 60);
  return `${hr}h ago`;
}

function Shell({
  tone,
  children,
}: {
  tone: "accent" | "destructive";
  children: ReactNode;
}): ReactElement {
  const borderColor = tone === "accent" ? "var(--color-primary)" : "var(--color-destructive)";
  return (
    <div
      className="flex items-center justify-between gap-3 border bg-[var(--color-background)] p-3"
      style={{ borderLeftWidth: 3, borderLeftColor: borderColor }}
    >
      {children}
    </div>
  );
}

export interface TarkovTrackerSyncBannerProps {
  sync: UseTarkovTrackerSyncResult;
}

const ERROR_COPY: Record<string, string> = {
  "token-invalid":
    'Token rejected — check you copied it correctly and that it has "Get Progression" scope.',
  "rate-limited": "TarkovTracker is rate-limiting us. Try again shortly.",
  network: "Can't reach TarkovTracker. Your local profile is unchanged — try Re-sync in a minute.",
  "shape-mismatch":
    "TarkovTracker changed its API shape. This tool needs an update — please file an issue.",
  "quest-list":
    "The quest list didn't load, so your progression can't be applied. Reload the page.",
};

export function TarkovTrackerSyncBanner({
  sync,
}: TarkovTrackerSyncBannerProps): ReactElement | null {
  const { detail } = sync;
  const handleReSync = (): void => {
    void sync.reSync();
  };
  const handleDisconnect = (): void => {
    sync.disconnect();
  };

  if (detail.state === "disconnected") return null;

  if (detail.state === "connected") {
    return (
      <Shell tone="accent">
        <div className="flex flex-col gap-0.5 text-xs">
          <span className="text-[var(--color-primary-text)]">▲ TarkovTracker · connected</span>
          <span className="text-[var(--color-muted-foreground)]">
            Token stored in this browser. Re-sync to pull your current progression.
          </span>
        </div>
        <div className="flex gap-1">
          <Button size="sm" variant="ghost" onClick={handleReSync}>
            Re-sync
          </Button>
          <Button size="sm" variant="ghost" onClick={handleDisconnect}>
            Disconnect
          </Button>
        </div>
      </Shell>
    );
  }

  if (detail.state === "syncing") {
    return (
      <Shell tone="accent">
        <div className="flex flex-col gap-0.5 text-xs">
          <span className="text-[var(--color-primary-text)]">▲ TarkovTracker · syncing…</span>
          <span className="text-[var(--color-muted-foreground)]">
            Fetching progression from tarkovtracker.io
          </span>
        </div>
      </Shell>
    );
  }

  if (detail.state === "synced") {
    return (
      <Shell tone="accent">
        <div className="flex flex-col gap-0.5 text-xs">
          <span className="text-[var(--color-primary-text)]">
            ▲ TarkovTracker · {detail.questCount}/{detail.questTotal} gear quests · PMC lv{" "}
            {detail.playerLevel}
          </span>
          <span className="text-[var(--color-muted-foreground)]">
            Last sync {relativeTime(detail.lastSyncedAt)}. Trader LLs not synced — set manually.
          </span>
        </div>
        <div className="flex gap-1">
          <Button size="sm" variant="ghost" onClick={handleReSync}>
            Re-sync
          </Button>
          <Button size="sm" variant="ghost" onClick={handleDisconnect}>
            Disconnect
          </Button>
        </div>
      </Shell>
    );
  }

  const copy = ERROR_COPY[detail.kind] ?? detail.message;
  return (
    <Shell tone="destructive">
      <div className="flex flex-col gap-0.5 text-xs">
        <span className="text-[var(--color-destructive)]">▲ TarkovTracker · error</span>
        <span className="text-[var(--color-muted-foreground)]">{copy}</span>
      </div>
      <div className="flex gap-1">
        {detail.kind !== "token-invalid" && (
          <Button size="sm" variant="ghost" onClick={handleReSync}>
            Re-sync
          </Button>
        )}
        <Button size="sm" variant="ghost" onClick={handleDisconnect}>
          Disconnect
        </Button>
      </div>
    </Shell>
  );
}
