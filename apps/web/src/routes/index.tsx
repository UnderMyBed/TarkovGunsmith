import { createFileRoute, Link } from "@tanstack/react-router";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Pill,
  SectionTitle,
  Stamp,
} from "@tarkov/ui";

export const Route = createFileRoute("/")({
  component: HomePage,
});

interface ToolCard {
  readonly to: string;
  readonly title: string;
  readonly description: string;
  readonly meta: string;
}

const BALLISTICS_CARDS: readonly ToolCard[] = [
  {
    to: "/calc",
    title: "Ballistic Calculator",
    description: "One round, one armor, one distance. Deterministic shot outcome.",
    meta: "FORWARD / SINGLE",
  },
  {
    to: "/sim",
    title: "Ballistics Simulator",
    description: "Full engagement — multi-shot, multi-zone, kill detection.",
    meta: "FORWARD / SCENARIO",
  },
  {
    to: "/adc",
    title: "Armor Damage Calc",
    description: "Burst against one armor. Per-shot pen, damage, durability.",
    meta: "FORWARD / BURST",
  },
  {
    to: "/aec",
    title: "Armor Effectiveness",
    description: "Pick an armor. Every ammo ranked by shots-to-break.",
    meta: "INVERSE / RANKING",
  },
];

const DATA_CARDS: readonly ToolCard[] = [
  {
    to: "/matrix",
    title: "AmmoVsArmor Matrix",
    description: "Full ammo × armor grid. Color-coded shots-to-break.",
    meta: "DATA / MATRIX",
  },
  {
    to: "/data",
    title: "DataSheets",
    description: "Ammo, armor, weapons, modules. Sort and filter.",
    meta: "DATA / TABLES",
  },
  {
    to: "/charts",
    title: "Effectiveness Charts",
    description: "Visual shots-to-break per armor for a chosen ammo.",
    meta: "DATA / CHARTS",
  },
];

function HomePage() {
  return (
    <div className="flex flex-col gap-8">
      {/* ─── hero ─── */}
      <section className="grid gap-10 lg:grid-cols-[3fr_2fr] items-end border-b border-[var(--color-border)] pb-12">
        <div>
          <div className="flex gap-4 font-mono text-[11px] tracking-[0.22em] uppercase text-[var(--color-paper-dim)] mb-6 flex-wrap">
            <span>WEAPON · MODS · PROFILE</span>
            <span>/ LIVE RECOMPUTE</span>
            <span>/ SHARE URL</span>
          </div>
          <h1 className="font-display text-[clamp(44px,7vw,88px)] leading-[0.95] tracking-tight">
            BUILD THE
            <br />
            LOADOUT.
            <br />
            <span className="text-[var(--color-primary)]">KNOW THE NUMBERS.</span>
          </h1>
          <p className="mt-6 max-w-[560px] text-lg text-[var(--color-muted-foreground)]">
            TarkovGunsmith rebuilds the defunct community tool for Escape from Tarkov ballistics.
            The <strong className="text-[var(--color-foreground)]">Weapon Builder</strong> is the
            core: pick a weapon, walk the slot tree, attach mods, watch ergo / recoil / accuracy /
            weight recompute live — gated by your trader LLs and quest progress, and shareable by
            URL.
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
            <HeroStat label="ERGONOMICS" value="72" delta="+18" deltaTone="up" />
            <HeroStat label="RECOIL V" value="151" delta="−34%" deltaTone="up" />
            <HeroStat label="WEIGHT" value="3.24" suffix="kg" delta="+0.80" deltaTone="down" />
            <HeroStat label="ACCURACY" value="2.1" suffix="MoA" />
          </dl>
          <div className="flex gap-3 items-center text-[11px]">
            <Pill tone="accent">LL4</Pill>
            <Pill tone="reliable">FLEA UNLOCKED</Pill>
            <Pill tone="muted">12 QUESTS</Pill>
          </div>
        </div>
      </section>

      {/* ─── ballistics tools ─── */}
      <SectionTitle index={1} title="BALLISTICS TOOLS" meta="FORWARD + INVERSE" />
      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {BALLISTICS_CARDS.map((card) => (
          <ToolCardView key={card.to} card={card} />
        ))}
      </section>

      {/* ─── data + charts ─── */}
      <SectionTitle index={2} title="REFERENCE + DATA" meta="BROWSE · FILTER · CHART" />
      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {DATA_CARDS.map((card) => (
          <ToolCardView key={card.to} card={card} />
        ))}
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

function ToolCardView({ card }: { card: ToolCard }) {
  return (
    <Link to={card.to} className="block group">
      <Card className="h-full transition-colors group-hover:border-[var(--color-primary)]">
        <CardHeader>
          <div className="flex items-start justify-between gap-2">
            <CardTitle>{card.title}</CardTitle>
            <span className="font-mono text-[10px] tracking-[0.18em] uppercase text-[var(--color-paper-dim)]">
              {card.meta}
            </span>
          </div>
          <CardDescription>{card.description}</CardDescription>
        </CardHeader>
        <CardContent className="font-mono text-[11px] tracking-[0.18em] uppercase text-[var(--color-muted-foreground)] group-hover:text-[var(--color-primary)] transition-colors">
          OPEN ▸
        </CardContent>
      </Card>
    </Link>
  );
}
