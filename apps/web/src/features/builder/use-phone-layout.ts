import { useSyncExternalStore } from "react";

/**
 * Below Tailwind's `sm` breakpoint (40rem), spelled exactly as the built stylesheet spells
 * `max-sm:` — `@media not all and (min-width:40rem)` — so this hook and the CSS agree on every
 * browser, including Safari releases that predate the `(width < 40rem)` range syntax.
 */
export const PHONE_QUERY = "not all and (min-width: 40rem)";

function queryList(): MediaQueryList | null {
  // jsdom has no matchMedia; there is no phone to detect, and the desktop layout renders.
  return typeof window === "undefined" || typeof window.matchMedia !== "function"
    ? null
    : window.matchMedia(PHONE_QUERY);
}

function subscribe(onChange: () => void): () => void {
  const list = queryList();
  if (list === null) return () => {};
  list.addEventListener("change", onChange);
  return () => list.removeEventListener("change", onChange);
}

function snapshot(): boolean {
  return queryList()?.matches ?? false;
}

/**
 * Whether the Builder is laid out for a phone. It decides what renders where, not how anything
 * looks: the slot inspector as a bottom sheet rather than beside the tree, and Compare and
 * Optimize in a bar fixed to the bottom of the screen. Styling stays in `max-sm:` / `sm:` classes.
 *
 * Read synchronously on the first render, so the desktop layout never flashes on a phone.
 */
export function usePhoneLayout(): boolean {
  return useSyncExternalStore(subscribe, snapshot, () => false);
}
