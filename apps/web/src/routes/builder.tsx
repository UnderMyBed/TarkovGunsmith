import { createFileRoute, Outlet, useMatchRoute } from "@tanstack/react-router";
import { z } from "zod";
import { BuilderPage } from "../features/builder/builder-page.js";

const builderSearchSchema = z.object({
  view: z.enum(["editor", "optimize"]).optional(),
});

export const Route = createFileRoute("/builder")({
  component: BuilderRouteLayout,
  validateSearch: (s) => builderSearchSchema.parse(s),
});

/**
 * Layout wrapper for the `/builder` route tree.
 *
 * Child routes (`/builder/$id`, `/builder/compare`, `/builder/compare/$pairId`)
 * are nested under this file in TanStack's file-based routing tree, so the
 * parent must render an `<Outlet />` for them to mount. For the bare
 * `/builder` URL there is no matching child and we render the page itself.
 *
 * `BuilderPage` itself lives in `features/builder/builder-page.tsx`, not here — see that
 * file's header comment for why keeping it out of the route file matters for
 * `autoCodeSplitting` (Stage 5.3, docs/plans/2026-08-19-pre-refactor-hardening-plan.md).
 */
function BuilderRouteLayout() {
  const matchRoute = useMatchRoute();
  // `fuzzy: false` → only true when the current location is exactly `/builder`
  // with no child segments. Any deeper URL falls through to the `<Outlet />`.
  const isExactBuilder = matchRoute({ to: "/builder" });
  const search = Route.useSearch();
  return isExactBuilder ? <BuilderPage view={search.view} /> : <Outlet />;
}
