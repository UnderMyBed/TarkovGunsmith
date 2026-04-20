import { createRootRoute, Link, Outlet } from "@tanstack/react-router";

export const Route = createRootRoute({
  component: RootLayout,
});

const NAV_ITEMS: ReadonlyArray<{ to: string; label: string; exact?: boolean }> = [
  { to: "/builder", label: "Builder" },
  { to: "/calc", label: "Calc" },
  { to: "/matrix", label: "Matrix" },
  { to: "/sim", label: "Sim" },
  { to: "/adc", label: "ADC" },
  { to: "/aec", label: "AEC" },
  { to: "/data", label: "Data" },
  { to: "/charts", label: "Charts" },
];

function RootLayout() {
  return (
    <div className="min-h-full bg-[var(--color-background)] text-[var(--color-foreground)]">
      <div className="h-[2px] bg-[var(--color-foreground)]" aria-hidden />
      <header className="border-b border-[var(--color-border)]">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-6 py-4">
          <Link to="/" className="flex items-center gap-3">
            <span aria-hidden className="text-[var(--color-primary)] text-lg leading-none">
              ▲
            </span>
            <span className="font-display text-lg leading-none tracking-wide">TARKOVGUNSMITH</span>
            <span className="hidden sm:inline font-mono text-[10px] tracking-[0.2em] uppercase text-[var(--color-paper-dim)]">
              · FIELD LEDGER / v2
            </span>
          </Link>
          <nav className="flex flex-wrap gap-x-6 gap-y-2">
            {NAV_ITEMS.map((item) => (
              <Link
                key={item.to}
                to={item.to}
                activeProps={{
                  className:
                    "text-[var(--color-primary)] border-b-[1.5px] border-[var(--color-primary)]",
                }}
                activeOptions={item.exact ? { exact: true } : undefined}
                className="font-mono text-[11px] tracking-[0.18em] uppercase text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)] border-b-[1.5px] border-transparent pb-[2px] transition-colors"
              >
                {item.label}
              </Link>
            ))}
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-6 py-10">
        <Outlet />
      </main>
      <footer className="mt-24 border-t border-[var(--color-border)]">
        <div className="mx-auto max-w-6xl px-6 py-6 flex flex-wrap items-center justify-between gap-3 font-mono text-[10px] tracking-[0.2em] uppercase text-[var(--color-paper-dim)]">
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
