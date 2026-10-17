import { Link } from "@tanstack/react-router";
import { Button, buttonVariants, cn } from "@tarkov/ui";
import { useBottomBarChrome } from "../../site-chrome.js";

export interface PhoneActionBarProps {
  /**
   * Opens the Compare handoff for the build on screen. Without one (no weapon picked) Compare
   * is a plain link to the Compare page, as in the top bar.
   */
  onCompare?: (() => void) | undefined;
  /**
   * The second action: Optimize from the editor, Back to build from the optimizer. Omitted
   * while there is nothing to optimize; Compare then takes the whole bar.
   */
  action?: { readonly label: string; readonly onClick: () => void } | undefined;
}

const BAR_BUTTON = "h-12 w-full text-sm";

/**
 * Compare and Optimize on a phone: a bar fixed to the bottom of the screen, in thumb reach. It is
 * `--phone-bar-height` tall (`styles.css`), and while it is mounted the root layout ends the page
 * with that much room (`useBottomBarChrome`), so the last panel and the footer scroll clear of it.
 */
export function PhoneActionBar({ onCompare, action }: PhoneActionBarProps) {
  useBottomBarChrome();
  const compareClass = cn(BAR_BUTTON, action === undefined && "col-span-2");
  return (
    <nav
      aria-label="Build actions"
      className="fixed inset-x-0 bottom-0 z-40 grid h-(--phone-bar-height) grid-cols-2 content-start gap-2 border-t border-[var(--color-border)] bg-[var(--color-background)] px-4 pt-2.5"
    >
      {onCompare ? (
        <Button variant="secondary" className={compareClass} onClick={onCompare}>
          Compare
        </Button>
      ) : (
        <Link
          to="/builder/compare"
          className={cn(buttonVariants({ variant: "secondary" }), compareClass)}
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
