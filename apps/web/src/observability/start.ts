import { faroUrlFor } from "./faro-guard.js";
import { connectTracking } from "./track.js";

/**
 * Starts Faro after the page has loaded, when this page may report (`faroUrlFor`).
 * Everywhere else tracking is switched off, so `track()` keeps nothing.
 */
export function startObservability(
  origin: string = window.location.origin,
  faroUrl: string | undefined = import.meta.env.VITE_FARO_URL,
  load: () => Promise<{ startFaro: (url: string) => void }> = () => import("./faro.js"),
): void {
  const url = faroUrlFor(origin, faroUrl);
  if (url === null) {
    connectTracking(null);
    return;
  }
  const begin = () => {
    load()
      .then(({ startFaro }) => startFaro(url))
      .catch((error: unknown) => {
        connectTracking(null);
        console.error("Faro failed to start", error);
      });
  };
  if (document.readyState === "complete") begin();
  else window.addEventListener("load", begin, { once: true });
}
