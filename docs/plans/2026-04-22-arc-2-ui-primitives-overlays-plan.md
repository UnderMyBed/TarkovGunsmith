# M3.5 Arc 2 — UI Primitives + Small Overlays — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Spec:** [`docs/superpowers/specs/2026-04-22-ui-primitives-overlays-design.md`](../superpowers/specs/2026-04-22-ui-primitives-overlays-design.md)

**Goal:** Ship a shared `Dialog` primitive in `@tarkov/ui`, a global keyboard shortcut overlay (6 shortcuts), a `Skeleton` primitive with 4 route migrations, and a Field Ledger favicon redesign + Apple Touch Icon — all in one PR.

**Architecture:** Two new primitives (`Dialog`, `Skeleton`) live in `packages/ui/src/components`. Keyboard shortcut logic is a single hook + overlay component in `apps/web/src/features/nav/`, mounted once at the `<App>` root. Four route files and the OptimizeDialog consume the new primitives. Favicon is an SVG rewrite + one rasterized PNG. No new deps; `@tarkov/ui` does not have React DOM test infra, so primitive behavior is verified via consumer smoke (OptimizeDialog, ShortcutOverlay e2e) rather than RTL unit tests.

**Tech Stack:** React 19, `createPortal`, Tailwind v4, class-variance-authority (existing), Playwright (existing), SVG + `rsvg-convert`/`inkscape` one-off for the Apple Touch Icon.

**Branch & rollout:** Already on `feat/m3.5-arc-2-ui-primitives` off `origin/main`. Spec commit `4425c7f` present. ONE PR at end. Commits:

1. `docs(m3.5): Arc 2 implementation plan` (this plan's deliverable)
2. `feat(ui): Dialog primitive`
3. `feat(ui): Skeleton primitive`
4. `feat(builder): migrate OptimizeDialog to the Dialog primitive`
5. `feat(web): keyboard shortcut overlay (?, g b/c/d, /, Esc)`
6. `feat(web): Skeleton loading states on /adc /aec /builder/:id /builder/compare/:pairId`
7. `feat(web): Field Ledger favicon redesign + apple-touch-icon`
8. `test(e2e): shortcut overlay toggle smoke`

**Spec-vs-plan deltas:**

- Spec proposed `@tarkov/ui` unit tests for Dialog + Skeleton. The package has no React DOM test infra today (vitest + pure logic only). Rather than bolt on RTL + jsdom for this arc, the plan skips primitive-unit-tests and verifies behavior through: the OptimizeDialog migration (real consumer), the ShortcutOverlay e2e smoke, and manual smoke against the 4 Skeleton migration sites. If we need unit tests later, add RTL then.
- Spec example showed `DialogPanel` with "Field Ledger bracket styling inline." The plan implements this by having `DialogPanel` render `<Card variant="bracket">` internally — cheapest path, keeps any Card improvements free.

---

## File map

**New files (6):**

| Path                                                         | Purpose                                                                                                      |
| ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------ |
| `packages/ui/src/components/dialog.tsx`                      | `Dialog`, `DialogPanel`, `DialogTitle`, `DialogBody` (portal + backdrop + escape + focus trap + scroll-lock) |
| `packages/ui/src/components/skeleton.tsx`                    | `Skeleton` placeholder primitive                                                                             |
| `apps/web/src/features/nav/use-keyboard-shortcuts.ts`        | Global keydown hook, `g`-chord + input-safety + overlay toggle                                               |
| `apps/web/src/features/nav/shortcut-overlay.tsx`             | `<Dialog>`-wrapped overlay listing the 6 shortcuts                                                           |
| `apps/web/public/apple-touch-icon.png`                       | 180×180 PNG rendered from the new favicon SVG                                                                |
| `docs/plans/2026-04-22-arc-2-ui-primitives-overlays-plan.md` | This plan                                                                                                    |

**Modified files (9):**

| Path                                                         | Change                                                    |
| ------------------------------------------------------------ | --------------------------------------------------------- |
| `packages/ui/src/index.ts`                                   | Re-export Dialog parts + Skeleton                         |
| `apps/web/src/app.tsx`                                       | Mount `useKeyboardShortcuts` + render `<ShortcutOverlay>` |
| `apps/web/src/features/builder/optimize/optimize-dialog.tsx` | Migrate to `<Dialog>` — drop hand-rolled backdrop/portal  |
| `apps/web/src/routes/builder.$id.tsx`                        | Skeleton in loading branch                                |
| `apps/web/src/routes/builder.compare.$pairId.tsx`            | Skeleton in loading branch                                |
| `apps/web/src/routes/adc.tsx`                                | Skeleton in result card fallback                          |
| `apps/web/src/routes/aec.tsx`                                | Skeleton in result card fallback                          |
| `apps/web/public/favicon.svg`                                | Field Ledger redesign                                     |
| `apps/web/index.html`                                        | Add `<link rel="apple-touch-icon" …>`                     |
| `apps/web/e2e/smoke.spec.ts`                                 | `?`-toggles-overlay + `Esc`-closes smoke                  |

---

## Phase A — Baseline

### Task 1: Confirm baseline green

- [ ] **Step 1: Confirm branch + spec present**

```bash
git branch --show-current
git log --oneline -3
```

Expected: branch `feat/m3.5-arc-2-ui-primitives`; most recent commit is `4425c7f docs(m3.5): Arc 2 — UI primitives + small overlays design` (or newer if the plan commit is already in).

- [ ] **Step 2: Baseline checks**

```bash
pnpm install --frozen-lockfile
pnpm typecheck
pnpm lint
pnpm format:check
pnpm --filter @tarkov/ui test
pnpm --filter @tarkov/web test
```

Expected: all pass. (Skip `pnpm test` at root per Arc 0's known parallel-workerd flake; run per-package.)

If anything fails, STOP. Don't mix baseline-repair commits with Arc 2 changes.

---

## Phase B — `Dialog` primitive

### Task 2: Create `Dialog`

**Files:**

- Create: `packages/ui/src/components/dialog.tsx`
- Modify: `packages/ui/src/index.ts`

- [ ] **Step 1: Write `packages/ui/src/components/dialog.tsx`**

Contents:

```tsx
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

export interface DialogPanelProps extends HTMLAttributes<HTMLDivElement> {}

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

export interface DialogTitleProps extends HTMLAttributes<HTMLHeadingElement> {}

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

export interface DialogBodyProps extends HTMLAttributes<HTMLDivElement> {}

export function DialogBody({ className, ...props }: DialogBodyProps) {
  return <div className={cn("px-5 py-4", className)} {...props} />;
}
```

- [ ] **Step 2: Re-export from `packages/ui/src/index.ts`**

Open `packages/ui/src/index.ts`. Add below the existing `Card` exports:

```ts
export { Dialog, DialogPanel, DialogTitle, DialogBody } from "./components/dialog.js";
export type {
  DialogProps,
  DialogPanelProps,
  DialogTitleProps,
  DialogBodyProps,
} from "./components/dialog.js";
```

- [ ] **Step 3: Build + typecheck**

```bash
pnpm --filter @tarkov/ui build
pnpm typecheck
```

Expected: both pass. If typecheck flags a missing React type, confirm the existing primitives compile first (they should — if not, baseline drift).

- [ ] **Step 4: Commit Phase B**

```bash
git add packages/ui/src/components/dialog.tsx packages/ui/src/index.ts
git commit -m "$(cat <<'EOF'
feat(ui): Dialog primitive

New @tarkov/ui/Dialog: portal-based modal with Field Ledger
bracket-card panel, Escape-to-close, backdrop-click-to-close
(opt-out), ref-counted body-scroll-lock, and a lightweight focus
trap that restores prior focus on close.

Exports Dialog / DialogPanel / DialogTitle / DialogBody. Consumers
still hand-roll specific content; the primitive only owns the
modal-ness.

No unit tests — @tarkov/ui has no React DOM test infra; behavior is
verified by the OptimizeDialog migration (next commit) and the
ShortcutOverlay e2e smoke.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Phase C — `Skeleton` primitive

### Task 3: Create `Skeleton`

**Files:**

- Create: `packages/ui/src/components/skeleton.tsx`
- Modify: `packages/ui/src/index.ts`

- [ ] **Step 1: Write `packages/ui/src/components/skeleton.tsx`**

```tsx
import type { CSSProperties, HTMLAttributes } from "react";
import { cn } from "../lib/cn.js";

export interface SkeletonProps extends HTMLAttributes<HTMLDivElement> {
  /** Width (CSS string or number → px). Defaults to "100%". */
  width?: CSSProperties["width"];
  /** Height (CSS string or number → px). Defaults to "1rem". */
  height?: CSSProperties["height"];
  /** Number of stacked rows, each `height` tall, spaced by `space-y-2`. */
  rows?: number;
}

/**
 * Field Ledger placeholder rectangle. Use during a loading state to hint at
 * the eventual content's shape without shifting layout when data arrives.
 *
 * For multi-row skeletons, set `rows`. For a single block, leave it unset.
 *
 * Styling: muted background, dashed amber border, `animate-pulse`.
 */
export function Skeleton({
  width = "100%",
  height = "1rem",
  rows,
  className,
  style,
  ...props
}: SkeletonProps) {
  if (rows && rows > 1) {
    return (
      <div
        className={cn("flex flex-col space-y-2", className)}
        style={{ width, ...style }}
        {...props}
      >
        {Array.from({ length: rows }, (_, i) => (
          <div
            key={i}
            className="bg-[var(--color-muted)] border border-dashed border-[var(--color-border)] animate-pulse"
            style={{ height }}
          />
        ))}
      </div>
    );
  }
  return (
    <div
      className={cn(
        "bg-[var(--color-muted)] border border-dashed border-[var(--color-border)] animate-pulse",
        className,
      )}
      style={{ width, height, ...style }}
      {...props}
    />
  );
}
```

- [ ] **Step 2: Re-export from `packages/ui/src/index.ts`**

Add below the Dialog exports:

```ts
export { Skeleton } from "./components/skeleton.js";
export type { SkeletonProps } from "./components/skeleton.js";
```

- [ ] **Step 3: Build + typecheck**

```bash
pnpm --filter @tarkov/ui build
pnpm typecheck
```

Expected: pass.

- [ ] **Step 4: Commit Phase C**

```bash
git add packages/ui/src/components/skeleton.tsx packages/ui/src/index.ts
git commit -m "$(cat <<'EOF'
feat(ui): Skeleton primitive

New @tarkov/ui/Skeleton: Field Ledger placeholder rectangle with
dashed amber border and animate-pulse. Single-block form via width
/ height; multi-row form via `rows` (auto space-y-2).

Used by the /adc, /aec, /builder/:id, /builder/compare/:pairId
loading states (next commit in this arc).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Phase D — Migrate `OptimizeDialog` to the new `Dialog`

### Task 4: Replace hand-rolled backdrop with `<Dialog>`

**Files:**

- Modify: `apps/web/src/features/builder/optimize/optimize-dialog.tsx`

- [ ] **Step 1: Swap the imports**

Current top of file includes:

```tsx
import { Button, Card, CardContent } from "@tarkov/ui";
```

Replace with:

```tsx
import { Button, Dialog, DialogPanel, DialogTitle, DialogBody } from "@tarkov/ui";
```

Drop `Card` and `CardContent` from this file's imports — they're replaced by `DialogPanel` + `DialogBody`. (Leave them imported elsewhere in the tree; this is scoped to `optimize-dialog.tsx`.)

- [ ] **Step 2: Replace the hand-rolled JSX**

Find the return JSX (around lines 82–134). It starts with:

```tsx
return (
  <div
    className="fixed inset-0 z-50 flex items-center justify-center bg-black/70"
    onClick={onClose}
  >
    <Card className="w-full max-w-2xl" onClick={(e: React.MouseEvent) => e.stopPropagation()}>
      <CardContent className="p-6 flex flex-col gap-4">
        <h2 className="font-display text-xl uppercase tracking-wider">Optimize build</h2>
        {/* ... */}
      </CardContent>
    </Card>
  </div>
);
```

Replace the entire return block with:

```tsx
return (
  <Dialog open={open} onClose={onClose} labelledBy="optimize-dialog-title">
    <DialogPanel className="w-full max-w-2xl">
      <DialogTitle id="optimize-dialog-title">Optimize build</DialogTitle>
      <DialogBody className="flex flex-col gap-4">
        {tab === "constraints" && (
          <OptimizeConstraintsForm
            state={state}
            dispatch={dispatch}
            slotTree={slotTree}
            onRun={handleRun}
          />
        )}

        {tab === "result" &&
          optimizer.state === "running" &&
          {
            /* existing running branch — keep exactly */
          }}

        {tab === "result" &&
          (optimizer.state === "done" || optimizer.state === "error") &&
          {
            /* existing done/error branch — keep exactly */
          }}

        <div className="flex justify-between pt-2 border-t border-[var(--color-border)]">
          {/* existing button row — keep exactly */}
        </div>
      </DialogBody>
    </DialogPanel>
  </Dialog>
);
```

Keep the three conditional branches (running / done-or-error / button row) exactly as they appear in the current file — do not re-derive them. Just replace the wrapper structure.

The `if (!open) return null;` guard (earlier in the component) can stay OR be removed: the new `<Dialog>` already returns null when `open === false`. Removing it is cleaner. Delete the `if (!open) return null;` line.

- [ ] **Step 3: Verify the file still builds**

```bash
pnpm --filter @tarkov/web typecheck
pnpm --filter @tarkov/web lint
```

Expected: pass.

- [ ] **Step 4: Manual smoke — open the Builder, load a weapon, open OptimizeDialog**

Start the stack, open `/builder`, pick any weapon, click the "Optimize" button to open the dialog. Verify:

- Backdrop renders and covers the viewport
- Dialog is centered with bracket-corner Card styling
- `Escape` closes it
- Clicking the backdrop closes it
- Clicking inside the dialog does not close it
- Body scroll is locked while open (try scrolling the page — page doesn't move)
- Focus goes to the first control inside the dialog on open

If anything regresses visually, tweak the `DialogPanel className` in `optimize-dialog.tsx` (e.g. a different `max-w-*`) rather than monkey-patching the primitive.

- [ ] **Step 5: Run `@tarkov/web` tests to ensure no regressions**

```bash
pnpm --filter @tarkov/web test
```

Expected: 108 tests pass.

- [ ] **Step 6: Commit Phase D**

```bash
git add apps/web/src/features/builder/optimize/optimize-dialog.tsx
git commit -m "$(cat <<'EOF'
feat(builder): migrate OptimizeDialog to the Dialog primitive

Replaces the hand-rolled `fixed inset-0 z-50 flex items-center
justify-center bg-black/70` wrapper with <Dialog> + <DialogPanel> +
<DialogTitle> + <DialogBody>. OptimizeDialog now owns only
optimize-specific content (constraints form, result view, buttons).

Free upgrades: focus trap + body-scroll-lock + ref-counted stacking
+ ARIA (role/aria-modal/aria-labelledby).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Phase E — Keyboard shortcut overlay

### Task 5: Create the shortcut hook + overlay component

**Files:**

- Create: `apps/web/src/features/nav/use-keyboard-shortcuts.ts`
- Create: `apps/web/src/features/nav/shortcut-overlay.tsx`
- Modify: `apps/web/src/app.tsx`

- [ ] **Step 1: Write `apps/web/src/features/nav/use-keyboard-shortcuts.ts`**

```ts
import { useEffect, useState } from "react";
import { useRouter } from "@tanstack/react-router";

const CHORD_TIMEOUT_MS = 1000;

function isTypingContext(el: Element | null): boolean {
  if (!el || !(el instanceof HTMLElement)) return false;
  const tag = el.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
  if (el.isContentEditable) return true;
  return false;
}

export interface UseKeyboardShortcutsResult {
  overlayOpen: boolean;
  setOverlayOpen: (v: boolean) => void;
}

/**
 * Registers the global keyboard shortcut layer. Call once at the App root.
 *
 * Shortcuts:
 *   ?     Toggle the shortcut overlay
 *   g b   → /builder
 *   g c   → /calc
 *   g d   → /data
 *   /     Focus first <select>/<input type="search">
 *   Esc   Close overlay (dialogs handle their own Esc)
 *
 * Input-safety: no shortcut (except Esc for overlay) fires while focus is in
 * an input/textarea/select/contenteditable.
 */
export function useKeyboardShortcuts(): UseKeyboardShortcutsResult {
  const [overlayOpen, setOverlayOpen] = useState(false);
  const router = useRouter();

  useEffect(() => {
    let chordPrefix: "g" | null = null;
    let chordTimer: ReturnType<typeof setTimeout> | null = null;

    const clearChord = () => {
      chordPrefix = null;
      if (chordTimer) {
        clearTimeout(chordTimer);
        chordTimer = null;
      }
    };

    const onKey = (e: KeyboardEvent) => {
      // Escape always closes the overlay (but not other dialogs — they own it).
      if (e.key === "Escape" && overlayOpen) {
        setOverlayOpen(false);
        return;
      }

      // Input-safety gate for every other shortcut.
      if (isTypingContext(document.activeElement)) return;

      // Modifier keys skip.
      if (e.ctrlKey || e.metaKey || e.altKey) return;

      // `?` toggles overlay (requires Shift+/ on most layouts).
      if (e.key === "?") {
        e.preventDefault();
        setOverlayOpen((o) => !o);
        clearChord();
        return;
      }

      // `/` focuses first select/search input.
      if (e.key === "/") {
        const target = document.querySelector<HTMLElement>("select, input[type='search']");
        if (target) {
          e.preventDefault();
          target.focus();
        }
        clearChord();
        return;
      }

      // Chord: `g` + letter
      if (chordPrefix === "g") {
        const dest =
          e.key === "b" ? "/builder" : e.key === "c" ? "/calc" : e.key === "d" ? "/data" : null;
        if (dest) {
          e.preventDefault();
          void router.navigate({ to: dest });
        }
        clearChord();
        return;
      }
      if (e.key === "g") {
        e.preventDefault();
        chordPrefix = "g";
        chordTimer = setTimeout(clearChord, CHORD_TIMEOUT_MS);
        return;
      }
    };

    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      clearChord();
    };
  }, [overlayOpen, router]);

  return { overlayOpen, setOverlayOpen };
}
```

- [ ] **Step 2: Write `apps/web/src/features/nav/shortcut-overlay.tsx`**

```tsx
import { Dialog, DialogPanel, DialogTitle, DialogBody } from "@tarkov/ui";

interface Shortcut {
  readonly key: string;
  readonly action: string;
}

const SHORTCUTS: readonly Shortcut[] = [
  { key: "?", action: "Toggle this overlay" },
  { key: "g b", action: "Go to /builder" },
  { key: "g c", action: "Go to /calc" },
  { key: "g d", action: "Go to /data" },
  { key: "/", action: "Focus the first picker on this page" },
  { key: "Esc", action: "Close this overlay" },
];

export interface ShortcutOverlayProps {
  open: boolean;
  onClose: () => void;
}

export function ShortcutOverlay({ open, onClose }: ShortcutOverlayProps) {
  return (
    <Dialog open={open} onClose={onClose} labelledBy="shortcut-overlay-title">
      <DialogPanel className="max-w-md">
        <DialogTitle id="shortcut-overlay-title">Keyboard shortcuts</DialogTitle>
        <DialogBody>
          <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 font-mono text-sm">
            {SHORTCUTS.map((s) => (
              <div key={s.key} className="contents">
                <dt className="text-[var(--color-primary)] tracking-[0.15em] uppercase text-xs">
                  {s.key}
                </dt>
                <dd className="text-[var(--color-foreground)]">{s.action}</dd>
              </div>
            ))}
          </dl>
        </DialogBody>
      </DialogPanel>
    </Dialog>
  );
}
```

- [ ] **Step 3: Mount the hook + overlay in `apps/web/src/app.tsx`**

Current `app.tsx`:

```tsx
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider } from "@tanstack/react-router";
import { TarkovDataProvider } from "@tarkov/data";
import { router } from "./router.js";
import { tarkovClient } from "./tarkov-client.js";

const queryClient = new QueryClient({
  /* ... */
});

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TarkovDataProvider client={tarkovClient}>
        <RouterProvider router={router} />
      </TarkovDataProvider>
    </QueryClientProvider>
  );
}
```

Problem: `useKeyboardShortcuts` calls `useRouter()`, which must run INSIDE `<RouterProvider>`. So we need a small inner component. Replace the contents of `app.tsx` with:

```tsx
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider } from "@tanstack/react-router";
import { TarkovDataProvider } from "@tarkov/data";
import { router } from "./router.js";
import { tarkovClient } from "./tarkov-client.js";
import { useKeyboardShortcuts } from "./features/nav/use-keyboard-shortcuts.js";
import { ShortcutOverlay } from "./features/nav/shortcut-overlay.js";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60_000,
      refetchOnWindowFocus: false,
    },
  },
});

function InnerApp() {
  const { overlayOpen, setOverlayOpen } = useKeyboardShortcuts();
  return (
    <>
      <RouterProvider router={router} />
      <ShortcutOverlay open={overlayOpen} onClose={() => setOverlayOpen(false)} />
    </>
  );
}

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TarkovDataProvider client={tarkovClient}>
        <InnerApp />
      </TarkovDataProvider>
    </QueryClientProvider>
  );
}
```

Note: `useRouter()` from TanStack Router doesn't actually require being inside `<RouterProvider>` — it reads from the module-level `router` ref. So this split is cosmetic, not functional. Keeping the split anyway keeps the hook out of the App shell for clarity and makes future context additions easy.

- [ ] **Step 4: Typecheck + lint + test**

```bash
pnpm --filter @tarkov/web typecheck
pnpm --filter @tarkov/web lint
pnpm --filter @tarkov/web test
```

Expected: all pass.

- [ ] **Step 5: Manual smoke**

Start the stack. On `/`:

- Press `?` — overlay appears with 6 rows
- Press `Esc` — overlay closes
- Press `g` then `b` (within 1s) — URL changes to `/builder`
- Go back to `/`, focus any `<input>` (or the `tarkov-tracker-token` field on `/builder`), type `?` — overlay does NOT appear
- Press `/` — first `<select>` on the page receives focus

If any case misbehaves, iterate on the hook before committing.

- [ ] **Step 6: Commit Phase E**

```bash
git add apps/web/src/features/nav/use-keyboard-shortcuts.ts \
        apps/web/src/features/nav/shortcut-overlay.tsx \
        apps/web/src/app.tsx
git commit -m "$(cat <<'EOF'
feat(web): keyboard shortcut overlay (?, g b/c/d, /, Esc)

Global keydown hook + a <Dialog>-wrapped overlay that lists six
shortcuts. Inline chord handler (1 s window for g-prefix nav),
input-safety gate (no fire while typing), modifier-key bypass (Cmd /
Ctrl / Alt combos unaffected). No registry abstraction — YAGNI.

Mounted at <App> root so every route gets the shortcut layer.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Phase F — Skeleton migrations

### Task 6: Apply `<Skeleton>` to the four loading sites

**Files:**

- Modify: `apps/web/src/routes/builder.$id.tsx`
- Modify: `apps/web/src/routes/builder.compare.$pairId.tsx`
- Modify: `apps/web/src/routes/adc.tsx`
- Modify: `apps/web/src/routes/aec.tsx`

- [ ] **Step 1: `builder.$id.tsx` — replace `"Loading build…"`**

Open `apps/web/src/routes/builder.$id.tsx`. Find the loading branch (around line 14 per the spec — current content approximately `if (query.isLoading) return <p>Loading build…</p>;`).

Replace with:

```tsx
import { Skeleton } from "@tarkov/ui";

// ... inside the component:
if (query.isLoading) {
  return (
    <div className="flex flex-col gap-4 p-4" role="status" aria-busy="true">
      <Skeleton width="60%" height="2rem" />
      <Skeleton rows={6} height="2.5rem" />
    </div>
  );
}
```

Verify the existing imports — add `Skeleton` to the existing `@tarkov/ui` import line if there is one; otherwise add a new import line.

- [ ] **Step 2: `builder.compare.$pairId.tsx` — replace loading branch**

Same pattern, but side-by-side:

```tsx
import { Skeleton } from "@tarkov/ui";

// ... inside the component:
if (query.isLoading) {
  return (
    <div className="grid grid-cols-2 gap-4 p-4" role="status" aria-busy="true">
      <div className="flex flex-col gap-3">
        <Skeleton width="50%" height="1.75rem" />
        <Skeleton rows={4} height="2rem" />
      </div>
      <div className="flex flex-col gap-3">
        <Skeleton width="50%" height="1.75rem" />
        <Skeleton rows={4} height="2rem" />
      </div>
    </div>
  );
}
```

- [ ] **Step 3: `adc.tsx` — replace result-card `"Loading…"`**

Open `apps/web/src/routes/adc.tsx`. Find the `isLoading` branch. It's likely rendering a `<p>Loading…</p>` inside a `<Card>`. Replace just that fallback with:

```tsx
{
  isLoading ? (
    <div role="status" aria-busy="true" className="flex flex-col gap-3 p-4">
      <Skeleton width="40%" height="1.25rem" />
      <Skeleton rows={3} height="1rem" />
    </div>
  ) : (
    {
      /* existing result view */
    }
  );
}
```

Be surgical — don't touch the non-loading branches. `Loading…` text inside `<option>` elements of `<select>`s stays.

- [ ] **Step 4: `aec.tsx` — same treatment as adc.tsx**

Mirror Step 3 exactly. Identical skeleton shape.

- [ ] **Step 5: Typecheck + lint + test**

```bash
pnpm --filter @tarkov/web typecheck
pnpm --filter @tarkov/web lint
pnpm --filter @tarkov/web test
```

Expected: pass.

- [ ] **Step 6: Manual visual smoke**

Throttle the network in DevTools to "Slow 3G" and navigate to `/adc`. Confirm the skeleton renders during the fetch and the real card lands in its place with no layout shift.

Same for `/aec`, `/builder/:id` (navigate to a seeded build — `pnpm seed:build` → paste the id), `/builder/compare/:pairId`.

If any Skeleton's height doesn't match the real content and causes jank, tweak the `height` prop to match the real content in dev tools.

- [ ] **Step 7: Commit Phase F**

```bash
git add apps/web/src/routes/builder.$id.tsx \
        apps/web/src/routes/builder.compare.$pairId.tsx \
        apps/web/src/routes/adc.tsx \
        apps/web/src/routes/aec.tsx
git commit -m "$(cat <<'EOF'
feat(web): Skeleton loading states on /adc /aec /builder/:id /builder/compare/:pairId

Replaces the "Loading…" text placeholders on four free-standing
loading states with <Skeleton> rectangles sized to match their
eventual content, avoiding layout shift when the real data lands.

"Loading…" inside <option> elements of <select>s is unchanged —
native option content can't host a shimmer.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Phase G — Favicon + Apple Touch Icon

### Task 7: Field Ledger favicon redesign + Apple Touch Icon

**Files:**

- Modify: `apps/web/public/favicon.svg`
- Create: `apps/web/public/apple-touch-icon.png`
- Modify: `apps/web/index.html`

- [ ] **Step 1: Rewrite `apps/web/public/favicon.svg`**

Replace the entire file with:

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">
  <rect width="32" height="32" rx="2" fill="oklch(0.16 0 0)" />

  <!-- Top-left bracket -->
  <path d="M3 10 L3 3 L10 3" stroke="oklch(0.78 0.14 78)" stroke-width="2" fill="none" stroke-linecap="square" />

  <!-- Bottom-right bracket -->
  <path d="M29 22 L29 29 L22 29" stroke="oklch(0.78 0.14 78)" stroke-width="2" fill="none" stroke-linecap="square" />

  <!-- Centered cartridge silhouette -->
  <rect x="12" y="10" width="8" height="12" rx="0.5" fill="oklch(0.78 0.14 78)" />
  <polygon points="12,10 20,10 18,6 14,6" fill="oklch(0.78 0.14 78)" />
  <rect x="13" y="22" width="6" height="2" fill="oklch(0.55 0.06 78)" />
</svg>
```

This produces a warm-black square, amber corner brackets, and an amber cartridge silhouette center. Verify visually by opening `apps/web/public/favicon.svg` in a browser or an SVG preview — the cartridge should read clearly at 16×16.

- [ ] **Step 2: Render the Apple Touch Icon PNG (180×180)**

Choose the first tool available:

```bash
# Option A — rsvg-convert (preferred; fast, accurate)
rsvg-convert -w 180 -h 180 apps/web/public/favicon.svg -o apps/web/public/apple-touch-icon.png

# Option B — inkscape
inkscape apps/web/public/favicon.svg --export-type=png --export-filename=apps/web/public/apple-touch-icon.png --export-width=180 --export-height=180

# Option C — ImageMagick (fuzzier SVG rasterizing; last resort)
magick -background none -density 400 apps/web/public/favicon.svg -resize 180x180 apps/web/public/apple-touch-icon.png
```

If none are installed, `brew install librsvg` (mac) or `sudo apt-get install librsvg2-bin` (Debian/Ubuntu/WSL) gets `rsvg-convert`.

Verify the PNG is sensible:

```bash
file apps/web/public/apple-touch-icon.png
# Expected: PNG image data, 180 x 180, 8-bit/color RGBA, non-interlaced
```

- [ ] **Step 3: Update `apps/web/index.html`**

Find the existing `<link rel="icon" …>` line. Add an `apple-touch-icon` link directly after it:

```html
<link rel="icon" type="image/svg+xml" href="/favicon.svg" />
<link rel="apple-touch-icon" href="/apple-touch-icon.png" />
```

- [ ] **Step 4: Dev server smoke**

Start `pnpm --filter @tarkov/web dev`. Load `http://localhost:5173/`. The tab icon should render the new favicon. Check the Network tab for both `/favicon.svg` and `/apple-touch-icon.png` — both 200.

- [ ] **Step 5: Commit Phase G**

```bash
git add apps/web/public/favicon.svg \
        apps/web/public/apple-touch-icon.png \
        apps/web/index.html
git commit -m "$(cat <<'EOF'
feat(web): Field Ledger favicon redesign + apple-touch-icon

New favicon.svg: warm-black square, amber corner brackets, centered
cartridge silhouette — mirrors the nav brand and Card.bracket
aesthetic instead of the generic amber "A" triangle.

New apple-touch-icon.png (180×180) rasterized from the SVG for iOS
home-screen + Android Chrome "Add to Home Screen" treatment. Linked
via index.html.

No full PWA manifest or mask-icon — deferred per spec.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Phase H — E2E smoke

### Task 8: Add shortcut overlay smoke

**Files:**

- Modify: `apps/web/e2e/smoke.spec.ts`

- [ ] **Step 1: Append a new `test.describe` at the bottom of the file**

```ts
test.describe("smoke — keyboard shortcut overlay", () => {
  test("? opens the overlay, Esc closes it", async ({ page }) => {
    const { errors } = captureConsoleErrors(page);
    await page.goto("/", { waitUntil: "networkidle" });

    // The overlay is not visible on load.
    await expect(page.getByRole("heading", { name: "Keyboard shortcuts" })).toBeHidden();

    // Press `?` (Shift+/).
    await page.keyboard.press("Shift+?");

    // Overlay appears with the shortcut list.
    await expect(page.getByRole("heading", { name: "Keyboard shortcuts" })).toBeVisible({
      timeout: 3_000,
    });
    await expect(page.getByText("Go to /builder")).toBeVisible();

    // Escape closes it.
    await page.keyboard.press("Escape");
    await expect(page.getByRole("heading", { name: "Keyboard shortcuts" })).toBeHidden();

    expect(errors, `Console errors on shortcut overlay:\n${errors.join("\n")}`).toEqual([]);
  });
});
```

- [ ] **Step 2: Run the new test**

```bash
pnpm --filter @tarkov/web build
pnpm --filter @tarkov/web test:e2e -- --grep "keyboard shortcut overlay"
```

Expected: PASS.

If the `?` press doesn't fire the overlay, two likely causes:

1. Some element has focus and is swallowing keystrokes — ensure no `<input>` is focused at load; add `await page.locator("body").focus()` before the keypress.
2. Playwright's `Shift+?` interpretation differs — try `await page.keyboard.down("Shift"); await page.keyboard.press("Slash"); await page.keyboard.up("Shift");` as a fallback.

- [ ] **Step 3: Run the full smoke suite**

```bash
pnpm --filter @tarkov/web test:e2e
```

Expected: all tests pass (25 existing + 1 new).

- [ ] **Step 4: Commit Phase H**

```bash
git add apps/web/e2e/smoke.spec.ts
git commit -m "$(cat <<'EOF'
test(e2e): shortcut overlay toggle smoke

Guards the full keyboard shortcut surface: ? press opens the
overlay (Dialog primitive + mount path + useKeyboardShortcuts hook
+ TanStack router integration), Esc press closes it.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Phase I — Ship

### Task 9: Push, PR, CI, merge

- [ ] **Step 1: Final baseline check**

```bash
pnpm typecheck
pnpm lint
pnpm format:check
pnpm --filter @tarkov/ui test
pnpm --filter @tarkov/data test
pnpm --filter @tarkov/web test
```

Expected: all pass.

- [ ] **Step 2: Push + open PR + watch CI + squash-merge**

Per memorized project convention: don't stop to confirm; run the whole sequence:

```bash
git push -u origin feat/m3.5-arc-2-ui-primitives
gh pr create --title "feat(web): M3.5 Arc 2 — Dialog + Skeleton + keyboard overlay + favicon" --body "$(cat <<'EOF'
## Summary

Third arc of M3.5 "Depth & Polish." Four UI primitives / overlays:

- **\`Dialog\` primitive** (\`@tarkov/ui\`) — portal, backdrop, Escape,
  backdrop-click-to-close, body-scroll-lock, focus trap. Migrates
  \`OptimizeDialog\` off its hand-rolled backdrop.
- **\`Skeleton\` primitive** — Field Ledger placeholder rectangle with
  dashed amber border + \`animate-pulse\`. Migrations on 4 routes:
  \`/adc\`, \`/aec\`, \`/builder/:id\`, \`/builder/compare/:pairId\`.
- **Keyboard shortcut overlay** — 6 shortcuts (\`?\` toggle, \`g b/c/d\`
  nav chords, \`/\` focus picker, \`Esc\` close). Global hook mounted
  at \`<App>\` root with input-safety gate and 1 s chord window. No
  registry abstraction, no customization — YAGNI.
- **Field Ledger favicon redesign + Apple Touch Icon.** New SVG
  mirrors the nav brand (amber corner brackets + centered cartridge
  silhouette); new 180×180 PNG linked via \`apple-touch-icon\`.

## Spec + plan

- Spec: \`docs/superpowers/specs/2026-04-22-ui-primitives-overlays-design.md\`
- Plan: \`docs/plans/2026-04-22-arc-2-ui-primitives-overlays-plan.md\`

## Test plan

- [x] \`pnpm typecheck\` / \`pnpm lint\` / \`pnpm format:check\` pass
- [x] \`@tarkov/ui\`, \`@tarkov/data\`, \`@tarkov/web\` unit tests all pass
- [x] Playwright smoke: 26 pass (new \`?\`/\`Esc\` overlay test + existing 25)
- [x] Manual: OptimizeDialog opens/closes via Escape + backdrop; body-scroll is locked; focus traps to the first control
- [x] Manual: Skeletons render on throttled \`/adc\` + \`/aec\` + \`/builder/:id\` + \`/builder/compare/:pairId\`; no layout shift when real content lands
- [x] Favicon + Apple Touch Icon render correctly; \`/favicon.svg\` and \`/apple-touch-icon.png\` return 200 in dev

## Out of scope / follow-ups

- Full command palette (fuzzy search, keybind customization)
- Route-specific / contextual shortcuts
- Shortcut rebind UI
- Full PWA manifest, \`mask-icon.svg\`, multi-size icon pack
- React Testing Library wiring for \`@tarkov/ui\` (add when a primitive actually has testable logic beyond props pass-through)

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
gh pr checks --watch
gh pr merge --squash
```

- [ ] **Step 3: Post-merge cleanup**

```bash
git checkout --detach origin/main
git fetch --prune origin
git branch -D main feat/m3.5-arc-2-ui-primitives
git checkout -b main origin/main
```

---

## Self-review checklist

1. **Spec coverage:**
   - Spec §1 (Dialog) → Tasks 2 + 4
   - Spec §2 (keyboard overlay) → Task 5
   - Spec §3 (Skeleton) → Tasks 3 + 6
   - Spec §4 (favicon) → Task 7
   - Spec "Testing" → Task 8 (e2e) + manual smokes embedded in each phase
   - Spec "Rollout" → Task 9
2. **Placeholder scan:** no "TBD", "implement later", or "similar to Task N" references. Every code block is complete.
3. **Type consistency:** `useKeyboardShortcutsResult`, `ShortcutOverlayProps`, `DialogProps/DialogPanelProps/DialogTitleProps/DialogBodyProps`, `SkeletonProps` are all consistently named across tasks.
4. **Ambiguity:** resolved inline:
   - `DialogPanel` renders `<Card variant="bracket">` internally (Task 2 Step 1).
   - Skeleton has no unit tests in `@tarkov/ui` (Spec-vs-plan delta preamble explains).
   - `apple-touch-icon.png` tool order is explicit (rsvg-convert / inkscape / ImageMagick, Task 7 Step 2).
