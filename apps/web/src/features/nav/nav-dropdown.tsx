// apps/web/src/features/nav/nav-dropdown.tsx
import { useEffect, useRef, useState, type ReactElement } from "react";
import { Link } from "@tanstack/react-router";

export interface NavDropdownItem {
  readonly to: string;
  readonly label: string;
}

export interface NavDropdownProps {
  readonly label: string;
  readonly items: readonly NavDropdownItem[];
}

/**
 * Click-open dropdown trigger with a menu panel below it. Closes on Escape,
 * click outside the trigger+menu, click on a link (navigation dismisses),
 * or click on the trigger itself while open.
 *
 * Matches the flat-nav link styling (Azeret Mono 11px, 0.18em tracking,
 * uppercase, amber on hover). The menu panel uses the Field Ledger
 * amber-top-border + warm-black card pattern.
 */
export function NavDropdown({ label, items }: NavDropdownProps): ReactElement {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;

    const handleClickOutside = (e: MouseEvent): void => {
      const root = rootRef.current;
      if (root === null) return;
      if (e.target instanceof Node && root.contains(e.target)) return;
      setOpen(false);
    };
    const handleEscape = (e: KeyboardEvent): void => {
      if (e.key === "Escape") setOpen(false);
    };

    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [open]);

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        aria-expanded={open}
        aria-haspopup="menu"
        onClick={() => setOpen((v) => !v)}
        className="font-mono text-[11px] tracking-[0.18em] uppercase text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)] border-b-[1.5px] border-transparent pb-[2px] transition-colors inline-flex items-center gap-1.5"
      >
        <span>{label}</span>
        <span
          aria-hidden
          className={`text-[8px] leading-none transition-transform ${open ? "rotate-180" : ""}`}
        >
          ▾
        </span>
      </button>
      {open && (
        <div
          role="menu"
          className="absolute left-0 top-full z-50 mt-2 min-w-[220px] border border-[var(--color-border)] border-t-[3px] border-t-[var(--color-primary)] bg-[var(--color-card)] py-2 shadow-lg"
        >
          {items.map((item) => (
            <Link
              key={item.to}
              to={item.to}
              role="menuitem"
              onClick={() => setOpen(false)}
              activeProps={{
                className:
                  "block px-4 py-1.5 font-mono text-[11px] tracking-[0.18em] uppercase text-[var(--color-primary)] hover:bg-[var(--color-muted)]",
              }}
              className="block px-4 py-1.5 font-mono text-[11px] tracking-[0.18em] uppercase text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)] hover:bg-[var(--color-muted)] transition-colors"
            >
              {item.label}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
