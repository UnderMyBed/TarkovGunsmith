# M3.5 Arc 2 — UI Primitives + Small Overlays

**Status:** design approved 2026-04-22. Writing-plans is next.

**Context:** Third arc of M3.5 "Depth & Polish." Arc 0 (local dev tooling, v1.12.0 / PR #100) and Arc 1 (Builder slot-tree, PR #102) shipped. Arc 2 bundles four UI primitives / overlays: a `Dialog` primitive in `@tarkov/ui`, a keyboard shortcut overlay, loading `Skeleton` shimmers, and a Field Ledger–styled favicon upgrade. All four cohere around the existing Field Ledger aesthetic (amber-on-paper, Azeret Mono accents, bracket corners, dashed dividers). Zero new deps.

## Goal

- Replace the hand-rolled backdrop + centering in `OptimizeDialog` with a shared `<Dialog>` primitive other features can consume going forward.
- Give users a discoverable keyboard shortcut layer — `?` opens an overlay listing them all.
- Replace text `"Loading…"` placeholders on the four most-visible loading states with skeleton rectangles that hint at the final layout.
- Upgrade the favicon from a generic amber "A" square to a Field-Ledger-distinctive mark; add an Apple Touch Icon for proper mobile home-screen treatment.

## Non-goals

- Full command palette (fuzzy search across items/routes/actions).
- Per-route / contextual keyboard shortcuts.
- Shortcut customization UI (rebinding, disabling).
- Full PWA manifest, `mask-icon.svg` for Safari, multi-size PNG icon pack. Keeps the favicon story to one SVG + one Apple Touch Icon.
- Shimmer on every route that renders a `<select>`-embedded "Loading…" — those stay as native-option text. Only free-standing loading states get skeletons.
- Animation polish beyond `animate-pulse`.
- Portal escape-key chord sequences or multi-step shortcut grammars beyond the `g <letter>` prefix nav chord.

## Design

### 1. Dialog primitive (`@tarkov/ui/Dialog`)

**API:**

```tsx
<Dialog open={open} onClose={onClose} labelledBy="optimize-title">
  <DialogPanel className="max-w-xl w-full">
    <DialogTitle id="optimize-title">Optimize build</DialogTitle>
    <DialogBody>{/* arbitrary content */}</DialogBody>
  </DialogPanel>
</Dialog>
```

**Behavior:**

- Renders to `document.body` via `createPortal` — sidesteps any stacking-context problems caused by ancestor transforms.
- Backdrop: `fixed inset-0 z-50 bg-black/70`. Click-to-close is on by default; disable via `closeOnBackdropClick={false}`.
- `Escape` key closes the dialog.
- Focus trap: on open, move focus to the first focusable element inside `<DialogPanel>` (fallback: the panel itself with `tabIndex={-1}`). On close, restore focus to the element that held it prior.
- Body-scroll-lock: set `document.body.style.overflow = "hidden"` while open; restore on close. Handles the case where multiple dialogs stack by reference-counting.
- No animation library — `transition-opacity duration-150` on backdrop, `transition-transform` on panel is enough.
- `DialogPanel` applies the Field Ledger `Card variant="bracket"` styling inline (corner brackets, dashed body divider) — consumers pass `className` for sizing only.

**Migration target:** `apps/web/src/features/builder/optimize/optimize-dialog.tsx`. The current implementation hand-rolls:

- `fixed inset-0 z-50 flex items-center justify-center bg-black/70` wrapper
- no focus trap
- no body-scroll-lock
- its own Escape handler inside `OptimizeDialog`

After migration, `OptimizeDialog` holds only the optimize-specific content (constraints form → result view).

**Rejected:** pulling in Radix Dialog / shadcn Dialog. We already control the aesthetic tightly; the ~150 LOC of primitive code is cheaper than a new dep + theming adapter.

### 2. Keyboard shortcut overlay

**Shortcuts registered (6):**

| Key             | Action                                                                                                                        |
| --------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `?` (shift+`/`) | Toggle the shortcut overlay                                                                                                   |
| `Esc`           | Close overlay / close an open `<Dialog>` (the Dialog primitive handles its own Escape; the overlay handles its own)           |
| `g b`           | Navigate to `/builder`                                                                                                        |
| `g c`           | Navigate to `/calc`                                                                                                           |
| `g d`           | Navigate to `/data`                                                                                                           |
| `/`             | Focus the first `<select>` or visible `<input type="search">` on the page (weapon/ammo/armor picker). If none present, no-op. |

**Chord semantics:** `g`-prefix chords use a 1-second timeout window. Press `g`, then within 1s press `b`/`c`/`d`; any other key during the window aborts the chord silently.

**Input-safety:** while the user is typing in an `<input>`, `<textarea>`, or `[contenteditable]`, shortcuts DO NOT fire (except `Esc`, which universally closes overlays/dialogs). Check `document.activeElement` on keydown.

**Implementation:**

- `apps/web/src/features/nav/use-keyboard-shortcuts.ts` — hook mounted once at `<App>` root. Registers a global `keydown` listener. Contains the switch-on-key inline; no registry abstraction.
- `apps/web/src/features/nav/shortcut-overlay.tsx` — renders a `<Dialog>`-wrapped reference card listing all 6 shortcuts in Field Ledger styling. The hook owns `const [overlayOpen, setOverlayOpen] = useState(false)` and passes that + the shortcut table to `<ShortcutOverlay>`.
- `apps/web/src/app.tsx` — mounts the hook; renders `<ShortcutOverlay>` inside the provider stack so it's available on every route.

**Rejected alternatives:**

- A separate `KeyboardContext` + registry API (`registerShortcut(…)` from arbitrary components). YAGNI — the 6 shortcuts are global-only.
- A library like `react-hotkeys-hook`. The chord semantics are simple; avoiding another dep keeps the bundle smaller.

### 3. Skeleton shimmers

**Primitive (`@tarkov/ui/Skeleton`):**

```tsx
<Skeleton width="100%" height="1.25rem" />
<Skeleton rows={5} height="1rem" className="space-y-2" />
```

Styling: `bg-[var(--color-muted)] border border-dashed border-[var(--color-border)] animate-pulse`. `rows` renders N stacked `<div>`s with the same height. No ARIA — callers wrap with `role="status" aria-busy="true"` if they want.

**Migration targets (four loading states):**

| Site                                                 | Current text                         | Skeleton shape                                                                |
| ---------------------------------------------------- | ------------------------------------ | ----------------------------------------------------------------------------- |
| `apps/web/src/routes/builder.$id.tsx:14`             | `"Loading build…"`                   | Header block (1 large `Skeleton` for title, 5-row set for slot-tree scaffold) |
| `apps/web/src/routes/builder.compare.$pairId.tsx:15` | similar                              | Two side-by-side header blocks (mirrors the final compare layout)             |
| `apps/web/src/routes/adc.tsx`                        | `"Loading…"` in result card fallback | One card-sized Skeleton (height matches real ADC result card)                 |
| `apps/web/src/routes/aec.tsx`                        | same                                 | Same as ADC                                                                   |

**Not migrated:** `"Loading…"` strings inside `<option>` elements in `<select>`s (builder weapon picker, compare-side.tsx dropdowns). Native-option content can't host a shimmer.

### 4. Custom favicon

**Design:** replace `apps/web/public/favicon.svg`. Current:

```svg
<svg viewBox="0 0 32 32">
  <rect width="32" height="32" rx="4" fill="oklch(0.16 0 0)" />
  <path d="M6 22 L16 6 L26 22 M11 16 H21"
        stroke="oklch(0.65 0.06 90)" .../>
</svg>
```

New: a bracket-cornered square (top-left + bottom-right corner brackets in amber, matching the Field Ledger `Card variant="bracket"` aesthetic) with a centered bullet silhouette (a tiny rifle cartridge stroke). Single-file SVG, oklch colors pulled from the Field Ledger palette (`--color-paper`, `--color-primary`).

**Added asset:** `apps/web/public/apple-touch-icon.png` at 180×180. Rendered once from the new SVG via `rsvg-convert` (preferred — lightweight, available via `apt` on dev machines) or `inkscape` as a fallback. The PNG is committed. Plan step documents the one-off command.

**HTML head:**

```html
<link rel="icon" type="image/svg+xml" href="/favicon.svg" />
<link rel="apple-touch-icon" href="/apple-touch-icon.png" />
```

The first line already exists in `apps/web/index.html`; the second is new.

**Rejected:** full PWA manifest, `<link rel="mask-icon" color="…">` for pinned Safari tabs, multiple raster sizes. YAGNI — we haven't had a user complaint about PWA installability or pinned-tab rendering.

## Architecture

```
Tarkov Gunsmith Arc 2
    │
    ├─ packages/ui/src/components
    │   ├─ dialog.tsx          ← NEW primitive (Dialog, DialogPanel, DialogTitle, DialogBody)
    │   └─ skeleton.tsx        ← NEW primitive (Skeleton)
    │
    └─ apps/web/src
        ├─ features/nav
        │   ├─ use-keyboard-shortcuts.ts  ← NEW hook
        │   └─ shortcut-overlay.tsx       ← NEW component (uses Dialog)
        ├─ app.tsx                        ← mount the hook + overlay
        ├─ features/builder/optimize/optimize-dialog.tsx  ← migrate to Dialog
        └─ routes/{builder.$id,builder.compare.$pairId,adc,aec}.tsx
                                          ← Skeleton migrations
```

## File map

**New files (5):**

| Path                                                  | Purpose                                   |
| ----------------------------------------------------- | ----------------------------------------- |
| `packages/ui/src/components/dialog.tsx`               | Dialog primitive                          |
| `packages/ui/src/components/skeleton.tsx`             | Skeleton primitive                        |
| `apps/web/src/features/nav/use-keyboard-shortcuts.ts` | Global shortcut handler hook              |
| `apps/web/src/features/nav/shortcut-overlay.tsx`      | Overlay component listing all 6 shortcuts |
| `apps/web/public/apple-touch-icon.png`                | 180×180 PNG rendered from favicon.svg     |

**Modified files (7):**

| Path                                                         | Change                                             |
| ------------------------------------------------------------ | -------------------------------------------------- |
| `packages/ui/src/index.ts`                                   | Re-export Dialog + its sub-parts + Skeleton        |
| `apps/web/src/app.tsx`                                       | Mount `useKeyboardShortcuts` + `<ShortcutOverlay>` |
| `apps/web/src/features/builder/optimize/optimize-dialog.tsx` | Migrate to `<Dialog>`                              |
| `apps/web/src/routes/builder.$id.tsx`                        | Skeleton loading                                   |
| `apps/web/src/routes/builder.compare.$pairId.tsx`            | Skeleton loading                                   |
| `apps/web/src/routes/adc.tsx`                                | Skeleton result placeholder                        |
| `apps/web/src/routes/aec.tsx`                                | Skeleton result placeholder                        |
| `apps/web/public/favicon.svg`                                | Field Ledger redesign                              |
| `apps/web/index.html`                                        | Add `apple-touch-icon` link                        |
| `apps/web/e2e/smoke.spec.ts`                                 | Shortcut overlay smoke (`?` opens, `Esc` closes)   |

## Testing

**Unit (`@tarkov/ui`):**

- `packages/ui/src/components/dialog.test.tsx` (NEW) — renders children only when `open`; Escape calls `onClose`; backdrop click calls `onClose`; `closeOnBackdropClick={false}` suppresses backdrop close.
- `packages/ui/src/components/skeleton.test.tsx` (NEW) — renders `rows` children when set; applies `width`/`height` inline styles; passes `className` through.

(The `@tarkov/ui` package doesn't have React Testing Library wired up today — if not, tests use `ReactDOMServer.renderToStaticMarkup` or a minimal DOM-snapshot approach consistent with the rest of the package. Plan picks the style on first test-file write.)

**Unit (`apps/web`):**

- `apps/web/src/features/nav/use-keyboard-shortcuts.test.tsx` (NEW) — mount the hook, fire `keydown` events, assert navigation / overlay toggling. `g` chord timeout. Input-safety (no fire when focus is in `<input>`).

**E2E (`apps/web/e2e/smoke.spec.ts`):**

- Open `/`, press `?`, assert the overlay appears with the shortcut-listing text visible. Press `Esc`, assert it closes. Ensures the global hook is actually mounted and wired.

No visual-regression tests. No explicit skeleton-timing test — the existing routes already cover "page loads without error" via smoke.

## Rollout

One PR on `feat/m3.5-arc-2-ui-primitives`. Five commits:

1. `feat(ui): Dialog primitive`
2. `feat(ui): Skeleton primitive`
3. `feat(builder): migrate OptimizeDialog to the new Dialog primitive`
4. `feat(web): keyboard shortcut overlay (?, g b/c/d, /, Esc)`
5. `feat(web): Field Ledger favicon redesign + apple-touch-icon`
6. `feat(web): Skeleton loading states on /adc /aec /builder/:id /builder/compare/:pairId`
7. `test(e2e): shortcut overlay toggle smoke`

(Plan may merge commits 3+6 or 1+2 if the diff stays focused. Final call in the plan.)

Squash-merge. Each `feat(ui):` and `feat(web):` drives a minor bump under release-please.

## Risks & open questions

- **Focus-trap edge cases.** If no focusable element is inside the DialogPanel, the fallback focuses the panel with `tabIndex={-1}`. If that happens for a dialog that legitimately needs keyboard interaction (e.g. a form), the consumer must include at least one focusable input — documented in the Dialog component's JSDoc.
- **Body-scroll-lock ref-counting.** Two stacked dialogs (e.g. OptimizeDialog opens the ShortcutOverlay somehow) — both need to release the lock in reverse order. The Dialog's `useEffect` cleanup reads a global counter; tests cover the double-open case.
- **`?` chord vs. text input.** Shift+`/` is a common keystroke when typing. Input-safety check (don't fire when typing) is load-bearing. Covered by the hook test suite.
- **Favicon rendering tool.** `rsvg-convert` is the first choice. If unavailable, fallback to `inkscape --export-type=png --export-width=180`. If neither is on the dev machine, the plan's step proposes `ImageMagick convert` with the caveat that rasterizing SVG in IM can look fuzzy. The plan writer installs whichever tool works first and commits the resulting PNG.
- **Skeleton width/height variation across routes.** The skeleton heights need to match the real content to avoid layout shift when the real content lands. The plan measures each real content height in dev tools and hard-codes those heights in the skeleton call.

## Follow-ups outside this arc

- Full command palette (fuzzy search, keybind customization) — Arc-sized, separate.
- Route-specific shortcuts (e.g. `Cmd+K` on `/builder` opens weapon picker; `Cmd+Enter` submits Optimize).
- PWA manifest + multi-size icon pack + `mask-icon.svg`. Defer until actual PWA installability requests or Safari pinned-tab complaints.
- Shimmer on every loading state across the app (datasheets, charts). Defer until loading-feel consistency matters.
