import { createRootRoute, Link, Outlet } from "@tanstack/react-router";

export const Route = createRootRoute({
  component: RootLayout,
});

function RootLayout() {
  return (
    <div className="min-h-full bg-[var(--color-background)] text-[var(--color-foreground)]">
      <header className="border-b">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
          <Link to="/" className="text-lg font-semibold tracking-tight">
            TarkovGunsmith
          </Link>
          <nav className="flex gap-4 text-sm">
            <Link
              to="/"
              activeProps={{ className: "font-semibold text-[var(--color-primary)]" }}
              activeOptions={{ exact: true }}
            >
              Home
            </Link>
            <Link
              to="/calc"
              activeProps={{ className: "font-semibold text-[var(--color-primary)]" }}
            >
              Calc
            </Link>
            <Link
              to="/matrix"
              activeProps={{ className: "font-semibold text-[var(--color-primary)]" }}
            >
              Matrix
            </Link>
            <Link
              to="/builder"
              activeProps={{ className: "font-semibold text-[var(--color-primary)]" }}
            >
              Builder
            </Link>
            <Link
              to="/sim"
              activeProps={{ className: "font-semibold text-[var(--color-primary)]" }}
            >
              Sim
            </Link>
            <Link
              to="/adc"
              activeProps={{ className: "font-semibold text-[var(--color-primary)]" }}
            >
              ADC
            </Link>
            <Link
              to="/aec"
              activeProps={{ className: "font-semibold text-[var(--color-primary)]" }}
            >
              AEC
            </Link>
            <Link
              to="/smoke"
              activeProps={{ className: "font-semibold text-[var(--color-primary)]" }}
            >
              Smoke
            </Link>
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-6 py-8">
        <Outlet />
      </main>
    </div>
  );
}
