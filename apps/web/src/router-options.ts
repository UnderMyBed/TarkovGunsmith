// apps/web/src/router-options.ts
import { RouteErrorFallback } from "./features/errors/route-error-fallback.js";

/**
 * Shared `createRouter()` options, spread into both the real app router (`router.ts`) and
 * the route-test helper (`test/render-route.tsx`) so tests exercise the exact same wiring
 * production uses — see `route-error-fallback.tsx`'s header comment for why
 * `defaultErrorComponent` is what actually installs the per-route `CatchBoundary`.
 */
export const routerOptions = {
  defaultErrorComponent: RouteErrorFallback,
} as const;
