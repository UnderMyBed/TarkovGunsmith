import {
  createContext,
  useCallback,
  useContext,
  useLayoutEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

/**
 * Which chrome the root layout draws around a page.
 *
 * The site masthead (wordmark and the Builder / Compare nav) frames every page by default. The
 * Builder's workbench draws its own full-width top bar, wordmark included, so while a workbench
 * is mounted the root drops the masthead and the centred frame on `<main>`. A page that is still
 * loading, or failed to load, mounts no workbench and keeps the masthead.
 */
interface SiteChrome {
  /** True while at least one workbench is mounted. */
  readonly workbench: boolean;
  readonly mount: () => () => void;
}

const SiteChromeContext = createContext<SiteChrome | null>(null);

export function SiteChromeProvider({ children }: { children: ReactNode }) {
  // A count rather than a flag, so a workbench unmounting while another mounts (a remount
  // keyed on a new build) never leaves the masthead hidden or shown wrongly.
  const [mounted, setMounted] = useState(0);
  const mount = useCallback(() => {
    setMounted((n) => n + 1);
    return () => setMounted((n) => n - 1);
  }, []);
  const value = useMemo<SiteChrome>(() => ({ workbench: mounted > 0, mount }), [mounted, mount]);
  return <SiteChromeContext.Provider value={value}>{children}</SiteChromeContext.Provider>;
}

/** Whether the page has a workbench, which draws its own top bar. Read by the root layout. */
export function useWorkbenchMounted(): boolean {
  return useContext(SiteChromeContext)?.workbench ?? false;
}

/**
 * Declares the calling page a workbench for as long as it is mounted. A layout effect, so the
 * masthead is gone before the first paint rather than flashing in and out.
 */
export function useWorkbenchChrome(): void {
  const mount = useContext(SiteChromeContext)?.mount;
  useLayoutEffect(() => mount?.(), [mount]);
}
