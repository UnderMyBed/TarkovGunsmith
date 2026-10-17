import type { ReactElement } from "react";
import type { Progression } from "@tarkov/data";
import { cn, focusRing } from "@tarkov/ui";

export interface ModeSwitchProps {
  progression: Pick<Progression, "mode" | "hasProfile" | "setMode">;
  /** Opens the progression panel (the profile editor). */
  onOpenPanel: () => void;
  /**
   * The id of the "Importing from TarkovTracker…" note while a sync is in flight, or
   * `undefined`. Both halves are disabled meanwhile and point at the note.
   */
  busyId: string | undefined;
}

/**
 * The workbench's one mode control: Theorycraft, or My progression.
 *
 * "My progression…" switches straight back to a profile the user has set. Otherwise (no profile
 * yet, or already in progression) it opens the progression panel, where a profile is set and
 * edited: the switch alone never sets a profile, since a profile is a set of choices.
 *
 * While a TarkovTracker sync is in flight both halves are disabled: whether it lands as the
 * first import, and so which mode it leaves, is decided when it lands, and a switch made in
 * between would be overwritten by it.
 */
export function ModeSwitch({ progression, onOpenPanel, busyId }: ModeSwitchProps): ReactElement {
  const { mode, hasProfile, setMode } = progression;
  const busy = busyId !== undefined;
  // "My progression…" switches straight back to a profile set aside; otherwise it opens the panel.
  const opensPanel = !(mode === "theorycraft" && hasProfile);
  const half = (pressed: boolean) =>
    cn(
      "h-11 px-3.5 text-sm transition-colors disabled:cursor-not-allowed disabled:opacity-50",
      focusRing,
      pressed
        ? "bg-[var(--color-primary)] font-bold text-[var(--color-primary-foreground)]"
        : "text-[var(--color-muted-foreground)] hover:text-[var(--color-primary-text)]",
    );
  return (
    <div
      role="group"
      aria-label="Builder mode"
      className="flex overflow-hidden rounded-[var(--radius)] border border-[var(--color-border-strong)]"
    >
      <button
        type="button"
        aria-pressed={mode === "theorycraft"}
        disabled={busy}
        aria-describedby={busyId}
        className={half(mode === "theorycraft")}
        onClick={() => setMode("theorycraft")}
      >
        Theorycraft
      </button>
      <button
        type="button"
        aria-pressed={mode === "progression"}
        aria-haspopup={opensPanel ? "dialog" : undefined}
        disabled={busy}
        aria-describedby={busyId}
        className={half(mode === "progression")}
        onClick={() => {
          if (opensPanel) onOpenPanel();
          else setMode("progression");
        }}
      >
        My progression…
      </button>
    </div>
  );
}
