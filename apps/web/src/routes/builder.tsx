import { createFileRoute, Outlet, useMatchRoute } from "@tanstack/react-router";
import { z } from "zod";
import { DraftBuilderPage } from "../features/builder/draft-builder-page.js";

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
 * The page (`DraftBuilderPage`, around `BuilderPage`) lives in `features/builder/`, not
 * here — see `builder-page.tsx`'s header comment for why keeping it out of the route file
 * matters for `autoCodeSplitting`.
 */
function BuilderRouteLayout() {
  const matchRoute = useMatchRoute();
  // `fuzzy: false` → only true when the current location is exactly `/builder`
  // with no child segments. Any deeper URL falls through to the `<Outlet />`.
  const isExactBuilder = matchRoute({ to: "/builder" });
  const search = Route.useSearch();
  return isExactBuilder ? <DraftBuilderPage view={search.view} /> : <Outlet />;
}
