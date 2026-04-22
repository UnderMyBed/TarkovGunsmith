// apps/web/src/features/nav/wip-banner.tsx
import type { ReactElement } from "react";
import { Link } from "@tanstack/react-router";

/**
 * Persistent status banner shown at the top of every non-Builder route.
 * Not dismissible — it's a status marker, not a prompt. Design parity with
 * the TarkovTracker sync banner (amber 3px left border, warm-black card).
 */
export function WipBanner(): ReactElement {
  return (
    <div className="mb-6 flex items-baseline gap-3 border border-[var(--color-border)] border-l-[3px] border-l-[var(--color-primary)] bg-[var(--color-card)] px-4 py-2.5">
      <span className="font-mono text-[11px] uppercase tracking-[0.15em] text-[var(--color-primary)]">
        ▲ WIP
      </span>
      <span className="text-sm text-[var(--color-muted-foreground)]">
        Subject to change or removal. Focus is on the{" "}
        <Link
          to="/builder"
          className="text-[var(--color-foreground)] underline decoration-[var(--color-primary)] underline-offset-2"
        >
          Builder
        </Link>
        .
      </span>
    </div>
  );
}
