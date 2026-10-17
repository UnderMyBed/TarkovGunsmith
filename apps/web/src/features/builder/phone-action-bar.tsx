import { Link } from "@tanstack/react-router";
import { Button, buttonVariants, cn } from "@tarkov/ui";

export interface PhoneActionBarProps {
  /**
   * Opens the Compare handoff for the build on screen. Without one (no weapon picked) Compare
   * is a plain link to the Compare page, as in the top bar.
   */
  onCompare?: (() => void) | undefined;
  /**
   * The second action: Optimize from the editor, Back to build from the optimizer. Omitted
   * while there is no weapon to optimize.
   */
  action?: { readonly label: string; readonly onClick: () => void } | undefined;
}

const BAR_BUTTON = "h-12 w-full text-sm";

/**
 * Compare and Optimize on a phone: a bar fixed to the bottom of the screen, in thumb reach,
 * clear of the home indicator. The page ends in a {@link PhoneBarSpacer} so its last row can
 * scroll out from behind it.
 */
export function PhoneActionBar({ onCompare, action }: PhoneActionBarProps) {
  return (
    <nav
      aria-label="Build actions"
      className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-2 gap-2 border-t border-[var(--color-border)] bg-[var(--color-background)] px-4 pb-[calc(1rem+env(safe-area-inset-bottom))] pt-2.5"
    >
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
      {action && (
        <Button
          variant="secondary"
          className={cn(
            BAR_BUTTON,
            "border border-[var(--color-primary)] font-bold text-[var(--color-primary-text)]",
          )}
          onClick={action.onClick}
        >
          {action.label}
        </Button>
      )}
    </nav>
  );
}

/** The room {@link PhoneActionBar} covers, at the end of the page, so nothing stays under it. */
export function PhoneBarSpacer() {
  return <div aria-hidden className="h-[calc(6rem+env(safe-area-inset-bottom))]" />;
}
