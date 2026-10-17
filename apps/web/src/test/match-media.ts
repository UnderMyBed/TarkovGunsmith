/**
 * A `window.matchMedia` for jsdom, which has none: every query answers `matches`, and `set`
 * flips it and tells the listeners, as a window crossing a breakpoint would. `restore` puts
 * jsdom back as it was (no matchMedia at all).
 */
export function stubMatchMedia(matches: boolean): {
  readonly queries: readonly string[];
  set: (next: boolean) => void;
  restore: () => void;
} {
  let current = matches;
  const listeners = new Set<() => void>();
  const queries: string[] = [];
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    writable: true,
    value: (query: string): MediaQueryList => {
      queries.push(query);
      return {
        get matches() {
          return current;
        },
        media: query,
        onchange: null,
        addEventListener: (_: string, fn: () => void) => listeners.add(fn),
        removeEventListener: (_: string, fn: () => void) => listeners.delete(fn),
        addListener: () => {},
        removeListener: () => {},
        dispatchEvent: () => false,
      } as unknown as MediaQueryList;
    },
  });
  return {
    queries,
    set: (next) => {
      current = next;
      listeners.forEach((fn) => fn());
    },
    restore: () => {
      delete (window as { matchMedia?: unknown }).matchMedia;
    },
  };
}
