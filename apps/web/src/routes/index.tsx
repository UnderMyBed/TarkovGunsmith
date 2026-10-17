import { createFileRoute, Link } from "@tanstack/react-router";
import { Pill, Stamp } from "@tarkov/ui";

export const Route = createFileRoute("/")({
  component: HomePage,
});

function HomePage() {
  return (
    <div className="flex flex-col gap-8">
      {/* ─── hero ─── */}
      <section className="grid gap-10 lg:grid-cols-[3fr_2fr] items-end border-b border-[var(--color-border)] pb-12">
        <div>
          <div className="flex gap-4 text-11 text-[var(--color-faint)] mb-6 flex-wrap">
            <span>Weapon · mods · profile</span>
            <span>/ live recompute</span>
            <span>/ shareable URL</span>
            <span>/ quest-gated</span>
          </div>
          <h1 className="font-bold text-88 leading-[0.95]">
            Build the
            <br />
            loadout.
            <br />
            <span className="text-[var(--color-primary-text)]">Know the numbers.</span>
          </h1>
          <p className="mt-6 max-w-[560px] text-lg text-[var(--color-muted-foreground)]">
            Pick a weapon, walk the slot tree, attach mods — ergo, recoil, accuracy and weight
            recompute live, gated by your trader levels and quest progress.{" "}
            <strong className="text-[var(--color-foreground)]">Share any build by URL.</strong>
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link
              to="/builder"
              className="inline-flex items-center gap-2 border border-[var(--color-primary)] bg-[var(--color-primary)] text-[var(--color-primary-foreground)] text-12 font-semibold h-10 px-5 rounded-[var(--radius)] hover:brightness-110 transition-colors"
            >
              Open the Builder ▸
            </Link>
          </div>
          <div className="mt-3">
            <Link
              to="/builder/compare"
              className="text-sm text-[var(--color-muted-foreground)] hover:text-[var(--color-primary-text)] transition-colors"
            >
              or compare two builds →
            </Link>
          </div>
        </div>

        {/* Hero right — sample build readout */}
        <div className="border-l border-[var(--color-border)] pl-8 flex flex-col gap-5">
          <div className="flex items-baseline justify-between">
            <span className="text-11 text-[var(--color-muted-foreground)]">Sample build</span>
            <Stamp tone="accent">Shareable</Stamp>
          </div>
          <div>
            <div className="font-bold text-2xl leading-none text-[var(--color-foreground)]">
              M4A1 · custom
            </div>
            <div className="mt-1 text-11 text-[var(--color-faint)]">
              14 mods · build · abc1-2e4f
            </div>
          </div>
          <dl className="grid grid-cols-2 gap-4">
            <HeroStat label="Ergonomics" value="72" delta="+25" deltaTone="up" />
            <HeroStat label="Recoil V" value="37" delta="−34%" deltaTone="up" />
            <HeroStat label="Weight" value="3.90" suffix="kg" delta="+0.80" deltaTone="down" />
            <HeroStat label="Accuracy" value="2.1" suffix="MoA" />
          </dl>
          <div className="flex gap-3 items-center text-11">
            <Pill tone="accent">LL4</Pill>
            <Pill tone="default">Flea unlocked</Pill>
            <Pill tone="muted">12 quests</Pill>
          </div>
        </div>
      </section>

      {/* ─── optimizer promo strip ─── */}
      <section
        aria-label="Optimizer — new feature"
        className="rounded-[var(--radius-panel)] border border-[var(--color-primary)] bg-[color-mix(in_srgb,var(--color-primary)_6%,transparent)] grid gap-6 px-6 py-5 items-center sm:grid-cols-[auto_1fr_auto]"
      >
        <div className="flex flex-col gap-1">
          <span className="text-11 text-[var(--color-primary-text)]">◇ New · optimizer</span>
          <span className="text-11 text-[var(--color-muted-foreground)]">Exact solver</span>
        </div>
        <div>
          <div className="font-bold text-20 leading-tight text-[var(--color-foreground)]">
            Set a budget. Pick an objective. The solver picks the mods.
          </div>
          <div className="mt-1 text-13 leading-[1.5] text-[var(--color-muted-foreground)]">
            Pin any slot to keep fixed. Respects your trader LLs and flea status. Pure-TS, runs
            client-side.
          </div>
        </div>
        <div className="flex gap-2">
          <Link
            to="/builder"
            search={{ view: "optimize" }}
            className="inline-flex items-center gap-2 border border-[var(--color-primary)] bg-[var(--color-primary)] text-[var(--color-primary-foreground)] text-11 font-semibold h-8 px-3 rounded-[var(--radius)] hover:brightness-110 transition-colors"
          >
            Try Optimizer
          </Link>
          <Link
            to="/builder"
            className="inline-flex items-center gap-2 border border-transparent text-[var(--color-muted-foreground)] text-11 h-8 px-3 hover:text-[var(--color-primary-text)] transition-colors"
          >
            Learn more
          </Link>
        </div>
      </section>

      {/* ─── what it does ─── */}
      <section aria-label="What TarkovGunsmith does">
        <h2 className="mb-5 text-13 font-semibold text-[var(--color-muted-foreground)]">
          What it does
        </h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[
            {
              n: "01",
              title: "Builder",
              body: "Slot tree editor with availability gating and live recompute.",
            },
            {
              n: "02",
              title: "Optimizer",
              body: "Solve for min-recoil, max-ergo or min-weight.",
            },
            {
              n: "03",
              title: "Compare",
              body: "Diff two builds, stat-by-stat, mod-by-mod.",
            },
            {
              n: "04",
              title: "Share",
              body: "Every build lives at a URL. Import on any device.",
            },
          ].map((f) => (
            <div
              key={f.n}
              className="rounded-[var(--radius-panel)] border border-[var(--color-border)] bg-[var(--color-card)] p-5"
            >
              <div className="font-mono text-11 text-[var(--color-primary-text)]">{f.n}</div>
              <div className="font-bold text-20 mt-2">{f.title}</div>
              <div className="mt-3 text-13 leading-[1.5] text-[var(--color-muted-foreground)]">
                {f.body}
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

function HeroStat({
  label,
  value,
  suffix,
  delta,
  deltaTone,
}: {
  readonly label: string;
  readonly value: string;
  readonly suffix?: string;
  readonly delta?: string;
  readonly deltaTone?: "up" | "down";
}) {
  return (
    <div>
      <dt className="text-11 text-[var(--color-muted-foreground)]">{label}</dt>
      <dd className="mt-1 font-mono text-22 leading-none tabular-nums">
        {value}
        {suffix && <span className="ml-1 text-13 text-[var(--color-faint)]">{suffix}</span>}
        {delta && (
          <span
            className={
              "ml-2 text-13 " +
              (deltaTone === "up"
                ? "text-[var(--color-better)]"
                : deltaTone === "down"
                  ? "text-[var(--color-worse)]"
                  : "text-[var(--color-muted-foreground)]")
            }
          >
            {delta}
          </span>
        )}
      </dd>
    </div>
  );
}
