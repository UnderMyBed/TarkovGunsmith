/**
 * The design system's keyboard-focus treatment, as a class string.
 *
 * `<Button>` and the app's raw `<button>` elements share this ONE definition rather than
 * each spelling the five classes out. That matters for two reasons beyond tidiness:
 *
 * 1. `focus-visible:outline-none` suppresses the browser's own focus indicator. It is only
 *    safe when the ring that replaces it ships too. Keeping the pair inseparable in a single
 *    exported constant means no call site can take the suppression without the replacement.
 * 2. The class STRINGS live in `packages/ui/src`, which is the tree Tailwind scans (see the
 *    `@source` header in `src/styles/index.css`). A call site in `apps/web` imports the
 *    identifier, so the rules are emitted from this file's literals no matter how many
 *    consumers there are. `apps/web/src/styles.test.ts` asserts those rules exist in the
 *    compiled stylesheet — see the `button.tsx` entry there, which guards exactly these
 *    classes.
 *
 * Not every focusable control can honestly be a `<Button>`: a table column-sort header, a
 * tab strip, a body-zone hotspot, and a mod-list row all have their own shape and their own
 * place in the layout. They still owe the user the same focus indicator, and this is how
 * they get it without duplicating — or drifting from — the primitive.
 */
export const focusRing =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-ring)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--color-background)]";
