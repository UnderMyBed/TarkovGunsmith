// apps/web/src/features/nav/nav-dropdown.tsx
import { useEffect, useId, useRef, useState, type ReactElement } from "react";
import { Link } from "@tanstack/react-router";
import { focusRing } from "@tarkov/ui";

export interface NavDropdownItem {
  readonly to: string;
  readonly label: string;
}

export interface NavDropdownProps {
  readonly label: string;
  readonly items: readonly NavDropdownItem[];
}

/**
 * Click-open disclosure holding a short list of navigation links. Closes on Escape
 * (returning focus to the trigger), on click outside the trigger+panel, on click of a link
 * (navigation dismisses it), on the trigger itself while open, and when focus leaves the
 * whole control by any route.
 *
 * Deliberately NOT an ARIA menu. `role="menu"`/`role="menuitem"` describe a set of
 * COMMANDS driven by arrow keys, and putting `role="menuitem"` on a `<Link>` replaces the
 * native link role — a screen-reader user is told these are menu items, loses the "link"
 * announcement, and is led to expect Up/Down navigation. These are plain navigation links
 * that load a route, so they are exposed as what they are: a list of links inside a
 * disclosure, with `aria-expanded` + `aria-controls` on the trigger and Tab as the
 * traversal key. That contract the component actually keeps.
 *
 * Matches the flat-nav link styling (Azeret Mono 11px, 0.18em tracking,
 * uppercase, amber on hover). The panel uses the Field Ledger
 * amber-top-border + warm-black card pattern.
 */
export function NavDropdown({ label, items }: NavDropdownProps): ReactElement {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelId = useId();

  useEffect(() => {
    if (!open) return;

    const handleClickOutside = (e: MouseEvent): void => {
      const root = rootRef.current;
      if (root === null) return;
      if (e.target instanceof Node && root.contains(e.target)) return;
      setOpen(false);
    };
    const handleEscape = (e: KeyboardEvent): void => {
      if (e.key !== "Escape") return;
      setOpen(false);
      // Escape must not strand focus on a panel that no longer exists — send it back to
      // the control the user opened, which is where they expect to resume tabbing.
      triggerRef.current?.focus();
    };

    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [open]);

  return (
    <div
      ref={rootRef}
      className="relative"
      onBlur={(e) => {
        // Tabbing past the last link leaves the panel open behind the user, so the visible
        // state stops matching where focus actually is. `relatedTarget` is the element
        // receiving focus — null when focus left the document entirely.
        if (e.relatedTarget instanceof Node && e.currentTarget.contains(e.relatedTarget)) return;
        setOpen(false);
      }}
    >
      <button
        ref={triggerRef}
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((v) => !v)}
        className={`font-mono text-11 tracking-18 uppercase text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)] border-b-[1.5px] border-transparent pb-[2px] transition-colors inline-flex items-center gap-1.5 ${focusRing}`}
      >
        <span>{label}</span>
        <span
          aria-hidden
          className={`text-8 leading-none transition-transform ${open ? "rotate-180" : ""}`}
        >
          ▾
        </span>
      </button>
      {open && (
        <ul
          id={panelId}
          className="absolute left-0 top-full z-50 mt-2 min-w-[220px] border border-[var(--color-border)] border-t-[3px] border-t-[var(--color-primary)] bg-[var(--color-card)] py-2 shadow-lg"
        >
          {items.map((item) => (
            <li key={item.to}>
              <Link
                to={item.to}
                onClick={() => setOpen(false)}
                /* Merged on top of `className` below, which already carries the focus ring
                 * — no need to repeat it here. */
                activeProps={{
                  className:
                    "block px-4 py-1.5 font-mono text-11 tracking-18 uppercase text-[var(--color-primary)] hover:bg-[var(--color-muted)]",
                }}
                className={`block px-4 py-1.5 font-mono text-11 tracking-18 uppercase text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)] hover:bg-[var(--color-muted)] transition-colors ${focusRing}`}
              >
                {item.label}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
