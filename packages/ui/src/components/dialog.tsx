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
 * body-scroll-lock, and a lightweight focus trap (moves focus to the first
 * focusable child on open; restores previous focus on close).
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

  // Escape key
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  // Body-scroll-lock (ref-counted)
  useEffect(() => {
    if (!open) return;
    acquireScrollLock();
    return releaseScrollLock;
  }, [open]);

  // Focus trap — move focus to first focusable on open; restore on close.
  useEffect(() => {
    if (!open) return;
    previouslyFocused.current = document.activeElement as HTMLElement | null;
    const panel = panelRef.current;
    if (panel) {
      const focusable = panel.querySelector<HTMLElement>(
        'a[href], button, input, textarea, select, [tabindex]:not([tabindex="-1"])',
      );
      (focusable ?? panel).focus();
    }
    return () => {
      previouslyFocused.current?.focus?.();
    };
  }, [open]);

  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div
      role="presentation"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 transition-opacity duration-150"
      onClick={closeOnBackdropClick ? onClose : undefined}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
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

export function DialogTitle({ className, ...props }: DialogTitleProps) {
  return (
    <h2
      className={cn(
        "font-display text-xl uppercase tracking-wider border-b border-dashed border-[var(--color-border)] px-5 py-4",
        className,
      )}
      {...props}
    />
  );
}

export type DialogBodyProps = HTMLAttributes<HTMLDivElement>;

export function DialogBody({ className, ...props }: DialogBodyProps) {
  return <div className={cn("px-5 py-4", className)} {...props} />;
}
