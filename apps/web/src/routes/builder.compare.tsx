// apps/web/src/routes/builder.compare.tsx
import { createFileRoute, Outlet, useMatchRoute } from "@tanstack/react-router";
import { CompareWorkspace } from "../features/builder/compare/compare-workspace.js";

export const Route = createFileRoute("/builder/compare")({
  component: ComparePage,
});

/**
 * Layout wrapper for the `/builder/compare` route tree — same rule as
 * `BuilderRouteLayout` in `builder.tsx`.
 *
 * The child route `/builder/compare/$pairId` is nested under this file in TanStack's
 * file-based routing tree, so this parent must render an `<Outlet />` for it to mount.
 * Without that, `LoadedComparePage` (which owns `useLoadPair`) is unreachable under any
 * URL — the save-then-redirect flow in `compare-workspace.tsx`'s `handleSave`/
 * `handleSaveAsNew` navigates here on success and would land on a blank draft instead of
 * the just-saved pair, and a shared comparison link would do the same for its recipient.
 * For the bare `/builder/compare` URL there is no matching child, so we render the blank
 * draft workspace directly.
 */
function ComparePage() {
  const matchRoute = useMatchRoute();
  // `fuzzy: false` → only true when the current location is exactly `/builder/compare`
  // with no child segments. Any deeper URL falls through to the `<Outlet />`.
  const isExactCompare = matchRoute({ to: "/builder/compare" });
  return isExactCompare ? <CompareWorkspace /> : <Outlet />;
}
