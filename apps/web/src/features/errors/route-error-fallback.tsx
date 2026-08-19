// apps/web/src/features/errors/route-error-fallback.tsx
import { Link } from "@tanstack/react-router";
import type { ErrorComponentProps } from "@tanstack/react-router";
import { Button, Card, CardContent, CardDescription, CardHeader, CardTitle } from "@tarkov/ui";

/**
 * Wired as `defaultErrorComponent` in `../../router-options.ts`, consumed by both
 * `src/router.ts` (the real app router) and `src/test/render-route.tsx` (the route test
 * helper), so production and tests share one router config.
 *
 * TanStack Router only wraps a route match in a `CatchBoundary` when that route (or the
 * router's `defaultErrorComponent`) declares an `errorComponent` — see
 * `@tanstack/react-router`'s `Match.js`: `ResolvedCatchBoundary = routeErrorComponent ?
 * CatchBoundary : SafeFragment`. Before this file existed apps/web set neither, so
 * `SafeFragment` (a no-op) stood in for every route: a render throw anywhere had nothing to
 * catch it and unmounted the whole React tree, white-screening the entire site. Registering
 * this as the router-wide default gives every route — present and future — the boundary in
 * one place, rather than hoping each new route file remembers to opt in.
 *
 * The boundary is per-match, not per-app: `__root.tsx`'s header/nav/footer live in the
 * parent match and stay mounted, so only the failed route's content is replaced by this
 * panel — a broken panel with a way out, not a blank document. That matters most for the
 * data layer, which consumes a third-party document from json.tarkov.dev that has already
 * changed shape once without warning (see docs/adr/0002-json-api-migration.md); an
 * unannounced field rename or type change downstream should degrade gracefully here rather
 * than take out the whole app.
 *
 * The error's raw `message` is deliberately never shown — per this repo's copy voice
 * (directive, no machinery narration), a stack trace or upstream schema diagnostic is not
 * a curated user-facing message. `reset()` re-renders the failed match in place (TanStack
 * Router clears the boundary's error state); "Back to home" is the same escape hatch the
 * root nav's brand link offers, for when the route itself is unrecoverable.
 */
export function RouteErrorFallback({ reset }: ErrorComponentProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>This page failed to render</CardTitle>
        <CardDescription>Something in this view threw an unexpected error.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col items-start gap-3">
        <p className="text-sm text-[var(--color-muted-foreground)]">
          Try again, or head back to home. If it keeps happening, the upstream data feed may have
          changed shape.
        </p>
        <div className="flex gap-2">
          <Button onClick={reset}>Try again</Button>
          <Link to="/">
            <Button variant="secondary">Back to home</Button>
          </Link>
        </div>
      </CardContent>
    </Card>
  );
}
