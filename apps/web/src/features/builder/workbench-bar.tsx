import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { Button, Stamp, buttonVariants, cn } from "@tarkov/ui";

export interface WorkbenchBarProps {
  /** The weapon picker. */
  picker: ReactNode;
  /** The Theorycraft / My progression switch. */
  modeSwitch?: ReactNode;
  /**
   * Opens the Compare handoff for the build on screen. Without one (no weapon picked) Compare
   * is a plain link to the Compare page.
   */
  onCompare?: (() => void) | undefined;
  /** The share action; omitted while there is no weapon to share. */
  share?:
    | {
        onShare: () => void;
        isSaving: boolean;
        saveFailed: boolean;
        /** Why the build cannot be shared as it stands, or `null`. */
        blocked: string | null;
        /** The saved build's id once shared, for the "Shared" stamp. */
        sharedId: string | null;
      }
    | undefined;
}

const BAR_BUTTON = "h-11 px-4";

/**
 * The workbench's top bar: the wordmark, the weapon picker, the mode switch, Compare and Share.
 * It stands in for the site masthead on the Builder (`site-chrome.tsx`). It wraps rather than
 * scrolls: at phone width the picker takes a row of its own.
 */
export function WorkbenchBar({ picker, modeSwitch, onCompare, share }: WorkbenchBarProps) {
  return (
    <section
      aria-label="Workbench"
      className="border-b border-[var(--color-border)] bg-[var(--color-muted)] px-4 py-3 sm:px-6"
    >
      <div className="flex flex-wrap items-center gap-x-5 gap-y-3">
        <Link
          to="/"
          className="flex items-center gap-2 font-display text-base leading-none text-[var(--color-foreground)]"
        >
          <svg aria-hidden width="14" height="12" viewBox="0 0 14 12">
            <path d="M7 0 14 12H0z" className="fill-[var(--color-primary)]" />
          </svg>
          TarkovGunsmith
        </Link>
        <div className="w-full sm:w-auto sm:min-w-64 sm:flex-[0_1_420px]">{picker}</div>
        {modeSwitch}
        <div className="flex flex-1 flex-wrap items-center justify-end gap-2">
          {share?.sharedId && <Stamp tone="accent">Shared</Stamp>}
          {onCompare ? (
            <Button variant="secondary" className={BAR_BUTTON} onClick={onCompare}>
              Compare
            </Button>
          ) : (
            <Link
              to="/builder/compare"
              className={cn(buttonVariants({ variant: "secondary" }), BAR_BUTTON)}
            >
              Compare
            </Link>
          )}
          {share && (
            <Button
              className={BAR_BUTTON}
              onClick={share.onShare}
              disabled={share.isSaving || share.blocked !== null}
            >
              {share.isSaving ? "Saving…" : "Share build"}
            </Button>
          )}
        </div>
      </div>
      {share && (share.blocked !== null || share.saveFailed) && (
        <p role="alert" className="mt-2 text-right text-sm text-[var(--color-destructive)]">
          {share.blocked ?? "Couldn't save the build. Share it again."}
        </p>
      )}
    </section>
  );
}
