import {
  ErrorsInstrumentation,
  NavigationInstrumentation,
  SessionInstrumentation,
  ViewInstrumentation,
  WebVitalsInstrumentation,
  initializeFaro,
} from "@grafana/faro-web-sdk";
import { SAMPLING_RATE } from "./faro-guard.js";
import { scrubUrls } from "./scrub.js";
import { connectTracking } from "./track.js";

/**
 * Starts Faro: errors, web vitals, sessions and page views, nothing else. No tracing, session
 * replay, console capture, resource timings or user actions. Loaded only through the dynamic
 * import in `start.ts`, so the SDK is its own chunk and off the critical path.
 */
export function startFaro(url: string): void {
  const faro = initializeFaro({
    url,
    app: { name: "tarkovgunsmith-web", environment: "production" },
    instrumentations: [
      new ErrorsInstrumentation(),
      new WebVitalsInstrumentation(),
      new SessionInstrumentation(),
      new ViewInstrumentation(),
      new NavigationInstrumentation(),
    ],
    sessionTracking: { samplingRate: SAMPLING_RATE },
    // Every URL leaves without its query string or fragment.
    beforeSend: (item) => scrubUrls(item),
  });
  connectTracking((name, attributes) => faro.api.pushEvent(name, attributes));
}
