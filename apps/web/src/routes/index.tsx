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
          <div className="flex gap-4 font-mono text-[11px] tracking-[0.22em] uppercase text-[var(--color-paper-dim)] mb-6 flex-wrap">
            <span>WEAPON · MODS · PROFILE</span>
            <span>/ LIVE RECOMPUTE</span>
            <span>/ SHAREABLE URL</span>
            <span>/ QUEST-GATED</span>
          </div>
          <h1 className="font-display text-[clamp(44px,7vw,88px)] leading-[0.95] tracking-tight">
            BUILD THE
            <br />
            LOADOUT.
            <br />
            <span className="text-[var(--color-primary)]">KNOW THE NUMBERS.</span>
          </h1>
          <p className="mt-6 max-w-[560px] text-lg text-[var(--color-muted-foreground)]">
            Pick a weapon, walk the slot tree, attach mods — ergo, recoil, accuracy and weight
            recompute live, gated by your trader levels and quest progress.{" "}
            <strong className="text-[var(--color-foreground)]">Share any build by URL.</strong>
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link
              to="/builder"
              className="inline-flex items-center gap-2 border border-[var(--color-primary)] bg-[var(--color-primary)] text-[var(--color-primary-foreground)] font-mono text-[12px] font-semibold tracking-[0.18em] uppercase h-10 px-5 hover:bg-[var(--color-amber-deep)] hover:border-[var(--color-amber-deep)] hover:text-[var(--color-foreground)] transition-colors"
            >
              Open the Builder ▸
            </Link>
            <Link
              to="/sim"
              className="inline-flex items-center gap-2 border border-[var(--color-border)] text-[var(--color-foreground)] font-mono text-[12px] tracking-[0.18em] uppercase h-10 px-5 hover:border-[var(--color-primary)] hover:text-[var(--color-primary)] transition-colors"
            >
              Run a simulation
            </Link>
          </div>
          <div className="mt-3">
            <Link
              to="/builder/compare"
              className="text-sm text-[var(--color-muted-foreground)] hover:text-[var(--color-primary)] transition-colors"
            >
              or compare two builds →
            </Link>
          </div>
        </div>

        {/* Hero right — sample build readout */}
        <div className="border-l border-[var(--color-border)] pl-8 flex flex-col gap-5">
          <div className="flex items-baseline justify-between">
            <span className="font-mono text-[11px] tracking-[0.2em] uppercase text-[var(--color-muted-foreground)]">
              Sample build
            </span>
            <Stamp tone="amber">SHAREABLE</Stamp>
          </div>
          <div>
            <div className="font-display text-2xl leading-none text-[var(--color-foreground)]">
              M4A1 · CUSTOM
            </div>
            <div className="mt-1 font-mono text-[11px] tracking-[0.18em] uppercase text-[var(--color-paper-dim)]">
              14 MODS · BUILD · abc1-2e4f
            </div>
          </div>
          <dl className="grid grid-cols-2 gap-4">
            <HeroStat label="ERGONOMICS" value="72" delta="+25" deltaTone="up" />
            <HeroStat label="RECOIL V" value="37" delta="−34%" deltaTone="up" />
            <HeroStat label="WEIGHT" value="3.90" suffix="kg" delta="+0.80" deltaTone="down" />
            <HeroStat label="ACCURACY" value="2.1" suffix="MoA" />
          </dl>
          <div className="flex gap-3 items-center text-[11px]">
            <Pill tone="accent">LL4</Pill>
            <Pill tone="reliable">FLEA UNLOCKED</Pill>
            <Pill tone="muted">12 QUESTS</Pill>
          </div>
        </div>
      </section>

      {/* ─── optimizer promo strip ─── */}
      <section
        aria-label="Optimizer — new feature"
        className="border border-[var(--color-primary)] bg-[rgba(245,158,11,0.06)] grid gap-6 px-6 py-5 items-center sm:grid-cols-[auto_1fr_auto]"
      >
        <div className="flex flex-col gap-1">
          <span className="font-mono text-[10px] tracking-[0.2em] uppercase text-[var(--color-primary)]">
            ◇ NEW · OPTIMIZER
          </span>
          <span className="font-mono text-[10px] tracking-[0.2em] uppercase text-[var(--color-muted-foreground)]">
            BRANCH-AND-BOUND · EXACT
          </span>
        </div>
        <div>
          <div className="font-display text-[20px] leading-tight text-[var(--color-foreground)]">
            Set a budget. Pick an objective. The solver picks the mods.
          </div>
          <div className="mt-1 font-mono text-[12px] leading-[1.5] text-[var(--color-muted-foreground)]">
            Pin any slot to keep fixed. Respects your trader LLs and flea status. Pure-TS, runs
            client-side.
          </div>
        </div>
        <div className="flex gap-2">
          <Link
            to="/builder"
            className="inline-flex items-center gap-2 border border-[var(--color-primary)] bg-[var(--color-primary)] text-[var(--color-primary-foreground)] font-mono text-[11px] font-semibold tracking-[0.14em] uppercase h-8 px-3 hover:bg-[var(--color-amber-deep)] hover:border-[var(--color-amber-deep)] hover:text-[var(--color-foreground)] transition-colors"
          >
            Try Optimizer
          </Link>
          <Link
            to="/builder"
            className="inline-flex items-center gap-2 border border-transparent text-[var(--color-muted-foreground)] font-mono text-[11px] tracking-[0.14em] uppercase h-8 px-3 hover:text-[var(--color-primary)] transition-colors"
          >
            Learn More
          </Link>
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
      <dt className="font-mono text-[10px] tracking-[0.18em] uppercase text-[var(--color-muted-foreground)]">
        {label}
      </dt>
      <dd className="mt-1 font-mono text-[22px] leading-none tabular-nums">
        {value}
        {suffix && <span className="ml-1 text-[13px] text-[var(--color-paper-dim)]">{suffix}</span>}
        {delta && (
          <span
            className={
              "ml-2 text-[13px] " +
              (deltaTone === "up"
                ? "text-[var(--color-olive)]"
                : deltaTone === "down"
                  ? "text-[var(--color-destructive)]"
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
