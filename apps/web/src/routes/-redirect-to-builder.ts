import { redirect } from "@tanstack/react-router";

/**
 * `beforeLoad` for every route whose feature is parked while the site is Builder-only
 * (#210). The page components live on under `src/features/<name>/` untouched; restoring
 * one means giving its route file a `component` again and re-adding a nav entry.
 *
 * Prefixed with `-` so the router plugin does not treat this file as a route.
 */
export function redirectToBuilder(): never {
  // TanStack Router's redirect() is a Response-like control-flow object, not an Error.
  // eslint-disable-next-line @typescript-eslint/only-throw-error
  throw redirect({ to: "/builder", replace: true });
}
