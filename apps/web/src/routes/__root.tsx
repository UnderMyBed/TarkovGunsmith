import { createRootRoute, Link, Outlet, useRouterState } from "@tanstack/react-router";
import type { ReactNode } from "react";

export const Route = createRootRoute({
  component: RootLayout,
});

const COMPARE_PREFIX = "/builder/compare";

/**
 * Active state is computed from the pathname rather than the router's own `activeOptions`:
 * a shared build lives at `/builder/:id`, which is the Builder (so Builder stays lit there),
 * while `/builder/compare*` is Compare and must not also light Builder.
 */
function NavLink({
  to,
  active,
  children,
}: {
  readonly to: "/builder" | "/builder/compare";
  readonly active: boolean;
  readonly children: ReactNode;
}) {
  return (
    <Link
      to={to}
      // Exact, so the router's own fuzzy active match never lights Builder on /builder/compare*.
      activeOptions={{ exact: true }}
      aria-current={active ? "page" : undefined}
      className={
        "font-mono text-11 tracking-18 uppercase border-b-[1.5px] pb-[2px] transition-colors " +
        (active
          ? "text-[var(--color-primary)] border-[var(--color-primary)]"
          : "text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)] border-transparent")
      }
    >
      {children}
    </Link>
  );
}

function RootLayout() {
  const pathname = useRouterState({ select: (st) => st.location.pathname });
  const compareActive = pathname === COMPARE_PREFIX || pathname.startsWith(COMPARE_PREFIX + "/");
  const builderActive =
    !compareActive && (pathname === "/builder" || pathname.startsWith("/builder/"));
  return (
    <div className="min-h-full bg-[var(--color-background)] text-[var(--color-foreground)]">
      {/* First focusable element on every page: a keyboard user can jump the masthead and
       * the two nav disclosures instead of tabbing through them on every route.
       *
       * Parked off-screen with a transform rather than `sr-only`, and revealed by undoing
       * that transform on focus. `sr-only`/`not-sr-only` both set `position`, as does the
       * `absolute` the revealed state needs — three utilities of equal specificity fighting
       * over one property, settled by whatever order Tailwind happens to emit them in. The
       * transform pair has no such collision, and the `:focus-visible` variant outranks the
       * resting state outright.
       *
       * Styling the appearance behind a focus-visible variant instead would have this file
       * writing one of the primary-border focus classes that `src/styles.test.ts` guards on
       * <Input>'s behalf — and a class apps/web writes itself is emitted by apps/web's own
       * source scan, which silently retires that guard. */}
      <a
        href="#main-content"
        className="absolute left-4 top-4 z-50 -translate-y-[200%] border border-[var(--color-primary)] bg-[var(--color-card)] px-4 py-2 font-mono text-11 tracking-18 uppercase text-[var(--color-primary)] transition-transform focus-visible:translate-y-0"
      >
        Skip to content
      </a>
      <div className="h-[2px] bg-[var(--color-foreground)]" aria-hidden />
      <header className="border-b border-[var(--color-border)]">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-6 py-4">
          <Link to="/" className="flex items-center gap-3">
            <span aria-hidden className="text-[var(--color-primary)] text-lg leading-none">
              ▲
            </span>
            <span className="font-display text-lg leading-none tracking-wide">TARKOVGUNSMITH</span>
            <span className="hidden sm:inline font-mono text-10 tracking-20 uppercase text-[var(--color-paper-dim)]">
              · FIELD LEDGER / v2
            </span>
          </Link>
          <nav className="flex flex-wrap items-center gap-x-6 gap-y-2">
            <NavLink to="/builder" active={builderActive}>
              Builder
            </NavLink>
            <NavLink to="/builder/compare" active={compareActive}>
              Compare
            </NavLink>
          </nav>
        </div>
      </header>
      {/* `tabIndex={-1}` so the skip link above actually MOVES focus here rather than only
       * scrolling: a fragment target that is not focusable leaves focus on the link, and
       * the next Tab resumes in the nav the user just skipped. */}
      <main id="main-content" tabIndex={-1} className="mx-auto max-w-6xl px-6 py-10">
        <Outlet />
      </main>
      <footer className="mt-24 border-t border-[var(--color-border)]">
        <div className="mx-auto max-w-6xl px-6 py-6 flex flex-wrap items-center justify-between gap-3 font-mono text-10 tracking-20 uppercase text-[var(--color-paper-dim)]">
          <span>TARKOVGUNSMITH · REBUILD OF XERXES-17&rsquo;S ORIGINAL</span>
          <span>
            EDITION 2026 ·{" "}
            <a
              href="https://github.com/UnderMyBed/TarkovGunsmith"
              target="_blank"
              rel="noreferrer"
              className="text-[var(--color-primary)] hover:underline"
            >
              GitHub ↗
            </a>
          </span>
        </div>
      </footer>
    </div>
  );
}
