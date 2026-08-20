import { useEffect, useRef, type HTMLAttributes, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { cn } from "../lib/cn.js";
import { Card } from "./card.js";

/**
 * Reference-counted body-scroll-lock shared across all open <Dialog>s.
 * Ensures two stacked dialogs don't clobber each other's style restoration.
 */
let openDialogCount = 0;
let savedOverflow: string | null = null;

function acquireScrollLock(): void {
  if (openDialogCount === 0 && typeof document !== "undefined") {
    savedOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
  }
  openDialogCount += 1;
}

function releaseScrollLock(): void {
  openDialogCount = Math.max(0, openDialogCount - 1);
  if (openDialogCount === 0 && typeof document !== "undefined" && savedOverflow !== null) {
    document.body.style.overflow = savedOverflow;
    savedOverflow = null;
  }
}

/**
 * Elements that take keyboard focus inside a dialog, in DOM order.
 *
 * `[disabled]` controls are excluded because they are not focusable and would otherwise be
 * mistaken for the cycle's first or last stop, wrapping Tab one element too early.
 * `tabindex="-1"` is excluded because it means "focusable by script, not by Tab" — which
 * includes the dialog panel itself, the fallback target when a dialog has no focusable
 * content at all.
 */
const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

function focusableWithin(panel: HTMLElement): HTMLElement[] {
  return Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR));
}

/**
 * Open dialog panels, outermost first. Only the topmost entry answers Escape or contains
 * focus — without this, two stacked dialogs would both handle one Escape (closing both) and
 * the outer one's containment would keep yanking focus out of the inner one.
 *
 * Same reasoning as the ref-counted scroll lock above: the state that has to be shared
 * between sibling dialogs cannot live in either one's hook.
 */
const dialogStack: HTMLElement[] = [];

export interface DialogProps {
  open: boolean;
  onClose: () => void;
  /** `id` of the element (typically DialogTitle) that labels the dialog. */
  labelledBy?: string;
  /** Close when the backdrop is clicked. Defaults to true. */
  closeOnBackdropClick?: boolean;
  children: ReactNode;
}

/**
 * Portal-based modal dialog. Renders a fixed-position backdrop and centers
 * its children. Handles Escape-to-close, backdrop-click-to-close (opt-out),
 * body-scroll-lock, and real focus containment.
 *
 * The containment is what `aria-modal="true"` on the panel below promises to assistive
 * tech: while this dialog is open, focus cannot reach the page behind it. Tab from the last
 * focusable element wraps to the first, Shift+Tab from the first wraps to the last, focus
 * that lands outside by any other route is pulled back, and the element that was focused
 * before the dialog opened is restored on close.
 *
 * Consumers wrap their content in <DialogPanel> (applies Card.bracket styling)
 * and use <DialogTitle>/<DialogBody> for semantic layout.
 */
export function Dialog({
  open,
  onClose,
  labelledBy,
  closeOnBackdropClick = true,
  children,
}: DialogProps) {
  const previouslyFocused = useRef<HTMLElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);

  /* `onClose` is almost always an inline arrow at the call site, so it is a new function on
   * every parent render. Reading it through a ref keeps the containment effect below
   * depending on `[open]` alone — if it depended on `onClose`, every parent re-render would
   * tear the effect down and set it up again, which re-runs the "focus the first focusable
   * element" step and would bounce focus out of whatever the user was typing in. */
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  // Body-scroll-lock (ref-counted)
  useEffect(() => {
    if (!open) return;
    acquireScrollLock();
    return releaseScrollLock;
  }, [open]);

  // Focus containment — see the component docblock for the contract this upholds.
  useEffect(() => {
    // One guard, not two: while closed there is no portal and so no panel, and every line
    // below needs a panel to talk about.
    const panel = open ? panelRef.current : null;
    if (panel === null) return;

    previouslyFocused.current = document.activeElement as HTMLElement | null;
    dialogStack.push(panel);
    (focusableWithin(panel)[0] ?? panel).focus();

    /** Stacked dialogs: only the innermost one reacts. */
    const isTopmost = (): boolean => dialogStack[dialogStack.length - 1] === panel;

    const onKeyDown = (e: KeyboardEvent): void => {
      if (!isTopmost()) return;
      if (e.key === "Escape") {
        e.stopPropagation();
        onCloseRef.current();
        return;
      }
      if (e.key !== "Tab") return;

      const focusable = focusableWithin(panel);
      // The stop this keystroke must land on if it would otherwise leave: Shift+Tab off the
      // front wraps to the back, Tab off the back wraps to the front.
      const wrapTarget = e.shiftKey ? focusable[focusable.length - 1] : focusable[0];
      if (wrapTarget === undefined) {
        // Nothing inside to cycle between. Tab would walk straight out into the page behind
        // the backdrop, so hold focus on the panel instead.
        e.preventDefault();
        panel.focus();
        return;
      }
      // The panel itself is the active element only when it took the fallback focus above —
      // a dialog that had no focusable content when it opened and gained some since. Treat
      // it as sitting just before the first stop: Shift+Tab from there wraps to the back,
      // and a plain Tab falls through to the browser's own move onto the first stop.
      const leavingDialog = e.shiftKey
        ? document.activeElement === focusable[0] || document.activeElement === panel
        : document.activeElement === focusable[focusable.length - 1];
      if (!leavingDialog) return;
      e.preventDefault();
      wrapTarget.focus();
    };

    const onFocusIn = (): void => {
      if (!isTopmost()) return;
      // Read `document.activeElement` rather than the event target: what matters is where
      // focus actually came to rest. `contains(null)` is false, which is the answer we want.
      if (panel.contains(document.activeElement)) return;
      // Focus reached the page behind the dialog by a route Tab-interception cannot cover —
      // a click on the backdrop when `closeOnBackdropClick` is off, or a programmatic
      // `focus()` somewhere else on the page. `aria-modal` says that cannot happen, so
      // undo it.
      (focusableWithin(panel)[0] ?? panel).focus();
    };

    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("focusin", onFocusIn);
    return () => {
      // Listeners come off BEFORE focus is restored — `previouslyFocused` is by definition
      // outside the panel, and onFocusIn would drag it straight back in.
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("focusin", onFocusIn);
      dialogStack.splice(dialogStack.indexOf(panel), 1);
      previouslyFocused.current?.focus?.();
    };
  }, [open]);

  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div
      role="presentation"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 transition-opacity duration-150"
      onClick={
        closeOnBackdropClick
          ? // Only close when the click lands directly on the backdrop, not when it
            // bubbles up from a click inside the panel. Checking `target ===
            // currentTarget` here (rather than stopping propagation on the panel div
            // below) keeps the panel — which carries `role="dialog"`, a real
            // interactive widget role — free of its own click handler, so there's
            // nothing on it for jsx-a11y's click-events-have-key-events /
            // no-noninteractive-element-interactions checks to (rightly) flag.
            (e) => {
              if (e.target === e.currentTarget) onClose();
            }
          : undefined
      }
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
        tabIndex={-1}
        className="outline-none"
      >
        {children}
      </div>
    </div>,
    document.body,
  );
}

export type DialogPanelProps = HTMLAttributes<HTMLDivElement>;

/**
 * The visible panel inside a <Dialog>. Renders a Field Ledger bracket-card.
 * Consumers pass `className` for sizing (max-w-*, w-full, etc.).
 */
export function DialogPanel({ className, children, ...props }: DialogPanelProps) {
  return (
    <Card variant="bracket" className={cn("w-full max-w-2xl", className)} {...props}>
      {children}
    </Card>
  );
}

export type DialogTitleProps = HTMLAttributes<HTMLHeadingElement>;

export function DialogTitle({ className, children, ...props }: DialogTitleProps) {
  return (
    <h2
      className={cn(
        "font-display text-xl uppercase tracking-wider border-b border-dashed border-[var(--color-border)] px-5 py-4",
        className,
      )}
      {...props}
    >
      {children}
    </h2>
  );
}

export type DialogBodyProps = HTMLAttributes<HTMLDivElement>;

export function DialogBody({ className, ...props }: DialogBodyProps) {
  return <div className={cn("px-5 py-4", className)} {...props} />;
}
