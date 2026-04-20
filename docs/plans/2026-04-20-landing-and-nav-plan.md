# Frontend Pass PR 2 — Landing + Top Nav Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development.

**Goal:** Rewrite `__root.tsx` (top nav + brand lockup) and `index.tsx` (landing page) in the Field Ledger aesthetic, with the Builder placed front-and-center. Everything else stays visible but demoted. Single PR.

**Architecture:** `__root.tsx` gets a new brand lockup (`▲ TARKOVGUNSMITH` + edition label), Builder-first nav, bordered top/bottom rules. `index.tsx` replaces the flat 8-card grid with: (1) tall Builder-forward hero, (2) a compact grid of ballistics / data tools as supporting entries. Heavy use of PR 1's new primitives (`Pill`, `Stamp`, `SectionTitle`, `StatRow`).

---

## Reference

- **Umbrella spec:** `docs/superpowers/specs/2026-04-20-frontend-design-pass-design.md`.
- **Mood board:** `docs/design/mood-board.html` — hero + nav are directly inspired by its layout. Open side-by-side while implementing.
- **PR 1 shipped:** new `@tarkov/ui` primitives (`Card`'s `variant` prop, `Pill`, `Stamp`, `SectionTitle`, `StatRow`), new tokens, new fonts.

## Scope decisions

1. **Builder hero is centered on the landing** — big Bungee headline + lead copy + primary CTA (Open the Builder) + secondary CTA (Load a preset, links to /builder).
2. **Supporting tools in 2-column grid below the hero.** 7 entries: Calc, Matrix, Sim, ADC, AEC, Data, Charts. Each as a Card with title + description. No TarkovIcon imagery in v1.
3. **Top nav: Builder leads**, then Calc, Matrix, Sim, ADC, AEC, Data, Charts. Smoke removed from nav (dev-only).
4. **Brand lockup:** `▲ TARKOVGUNSMITH` with a tiny Azeret Mono edition label `· FIELD LEDGER / v2` to the right.
5. **Full-bleed top rule** above the header (2px solid paper) and thin line below (1px border) — signals "document / manual" framing.
6. **No new primitives.** Reuses everything from PR 1. If something's missing, add it to the plan's scope — don't invent in the route file.

## File map

```
apps/web/src/routes/
├── __root.tsx                      REWRITTEN — Field Ledger nav + brand
└── index.tsx                        REWRITTEN — Builder-forward landing
```

No other files.

---

## Task 0: Worktree + baseline

- [ ] **Step 1: Worktree.**

```bash
cd /mnt/c/Users/Matt/Source/TarkovGunsmith
git fetch origin
git worktree add .worktrees/landing-nav -b feat/landing-nav origin/main
cd .worktrees/landing-nav
pnpm install --frozen-lockfile
pnpm --filter "./packages/*" build
pnpm --filter @tarkov/web typecheck && pnpm --filter @tarkov/web lint && pnpm --filter @tarkov/web test
```

Expected: all green.

---

## Task 1: Rewrite `__root.tsx`

**Files:**

- Rewrite: `apps/web/src/routes/__root.tsx`

- [ ] **Step 1: Replace the file.**

```tsx
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
```

Notes on the code:

- **`font-display`** is a Tailwind v4 utility generated from `--font-display` token (Bungee). Same for `font-mono` / `font-sans`. Those utilities are available from PR 1's token rewrite.
- The top 2px solid paper rule sits above the header to signal "document header / official printout." Keep it.
- Nav overflow: on mobile, nav wraps below the brand. Explicit `flex-wrap` + `gap-y-2`.

- [ ] **Step 2: Typecheck.**

```bash
pnpm --filter @tarkov/web typecheck
```

If `route-tree.gen.ts` complains about any route, it doesn't need regen (we haven't added/removed routes — only edited the shell). Skip build regen.

- [ ] **Step 3: Commit.**

```bash
git add apps/web/src/routes/__root.tsx
git commit -m "feat(ui): Field Ledger top nav + brand lockup + footer"
```

---

## Task 2: Rewrite `index.tsx`

**Files:**

- Rewrite: `apps/web/src/routes/index.tsx`

- [ ] **Step 1: Replace the file.**

```tsx
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
```

- [ ] **Step 2: Typecheck + lint.**

```bash
pnpm --filter @tarkov/web typecheck && pnpm --filter @tarkov/web lint
```

- [ ] **Step 3: Commit.**

```bash
git add apps/web/src/routes/index.tsx
git commit -m "feat(ui): Builder-forward landing page with hero + two tool sections"
```

---

## Task 3: Full verification + push + PR

- [ ] **Step 1: CI parity.**

```bash
pnpm typecheck && pnpm lint && pnpm format:check && pnpm test && pnpm -r build
```

All exit 0.

- [ ] **Step 2: Visual smoke check.**

```bash
pnpm --filter @tarkov/web dev
```

Open `/`. Expected:

- Top nav: "BUILDER" first, with active state showing amber underline when on /builder.
- Brand lockup with amber ▲ + Bungee "TARKOVGUNSMITH" + mono edition label.
- Hero: 3-col headline "BUILD THE / LOADOUT. / KNOW THE NUMBERS." (third line amber). Right side shows a mock M4A1 readout with stat grid + LL4 / FLEA / quest pills + SHAREABLE stamp.
- Below: two `SectionTitle` dividers ("01 · BALLISTICS TOOLS" / "02 · REFERENCE + DATA") separating 4-card and 3-card grids.
- Footer: two-line mono caps with GitHub link in amber.
- Hover any tool card → border shifts amber, "OPEN ▸" color shifts amber.

If running headless, skip and note in the PR body.

- [ ] **Step 3: Push + PR.**

```bash
git push -u origin feat/landing-nav
gh pr create --title "feat(ui): Builder-forward landing + Field Ledger nav (M3 PR 2)" --body "$(cat <<'EOF'
## Summary

Second PR of the M3 Frontend Design Pass. Rewrites the landing page and top nav in the Field Ledger aesthetic — Builder front and center, everything else supporting.

- **`__root.tsx`:** new brand lockup (▲ TARKOVGUNSMITH · FIELD LEDGER / v2), Builder-first nav ordering, paper-colored 2px top rule, dashed border separators, mono-caps footer with GitHub link.
- **`index.tsx`:** 2-column Builder-forward hero (big Bungee headline + lead copy + CTAs on left; sample M4A1 build readout with stat deltas + progression pills + SHAREABLE stamp on right), followed by two `SectionTitle`-divided card grids — "01 · Ballistics Tools" (Calc, Sim, ADC, AEC) and "02 · Reference + Data" (Matrix, Data, Charts).
- Plan: `docs/plans/2026-04-20-landing-and-nav-plan.md`.

## Test plan

- [x] `pnpm typecheck && pnpm lint && pnpm format:check && pnpm test && pnpm -r build` — all exit 0.
- [x] Test count unchanged.
- [ ] Visual smoke check: deferred to post-merge manual walk (dev server not opened in this automated run).
- [ ] CI green on this PR.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- [ ] **Step 4: Merge + cleanup.**

```bash
gh pr checks --watch
gh pr merge --squash --auto
cd /mnt/c/Users/Matt/Source/TarkovGunsmith
git worktree remove .worktrees/landing-nav
git branch -D feat/landing-nav
git fetch origin --prune
```
