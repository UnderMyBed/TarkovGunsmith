# Frontend Pass PR 1 — Design Tokens + `@tarkov/ui` Primitives Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development.

**Goal:** Ship the "Field Ledger" design tokens and an updated `@tarkov/ui` primitive set — fonts, palette, corner-bracketed Card variant, tactical Button variants, ledger-style Input, and new primitives (Pill, Stamp, SectionTitle, StatRow). After this PR merges, every route in `apps/web` picks up the new look automatically (colors + fonts) without code changes to routes. Per-route layout refactors happen in PRs 2–5.

**Architecture:** Tailwind v4 `@theme` token set in `packages/ui/src/styles/index.css` is rewritten with the Field Ledger palette + Bungee / Chivo / Azeret Mono fonts. Existing primitives (`Card`, `Button`, `Input`) are restyled; `Card` gets a new opt-in `bracket` variant for hero panels. Four new primitives (`Pill`, `Stamp`, `SectionTitle`, `StatRow`) land in their own files and are re-exported from `src/index.ts`. No route changes beyond what the compiler forces.

**Tech Stack:** Tailwind v4, React 19, class-variance-authority (already present), Google Fonts via CSS `@import`. No new runtime deps.

---

## Reference material

- **Umbrella spec:** `docs/superpowers/specs/2026-04-20-frontend-design-pass-design.md`.
- **Mood board (source of truth for look):** `docs/design/mood-board.html` — open in a browser while implementing.
- **Package conventions:** `packages/ui/CLAUDE.md` — shadcn-style, one component per file, variants via cva, no tests on pure JSX.
- **Current tokens:** `packages/ui/src/styles/index.css` (pre-this-PR) — all values in `oklch()`, Inter + JetBrains Mono.

## Scope decisions

1. **Keep semantic token names stable** (`--color-primary`, `--color-destructive`, etc.). Routes reference them via `var(--color-*)` in arbitrary Tailwind class values; swapping the values flows through automatically.
2. **Card bracket motif is OPT-IN via a `variant` prop** (`"plain"` default, `"bracket"` new). Existing routes keep the plain variant and so look cleaner but not radically different until PRs 2–5 adopt the bracket variant where appropriate.
3. **Button variants restyled, API unchanged.** `default` / `secondary` / `ghost` / `destructive` all still exist; each gets the new tactical styling (caps, mono letterspacing on primary, sharp corners).
4. **`--radius` drops from `0.5rem` to `0.125rem`** (2px). Field-ledger aesthetic wants sharper corners; we keep a touch of rounding for AA-friendly edges.
5. **Four new primitives, one file each:** `pill.tsx`, `stamp.tsx`, `section-title.tsx`, `stat-row.tsx`. Exported from `src/index.ts`.
6. **No component tests.** Per package convention, pure JSX doesn't get tests.
7. **Google Fonts via `@import`** at the top of `styles/index.css`. Not a separate `<link>` in HTML because consumers import the CSS bundle directly.
8. **Tailwind v4 `@theme` kept intact.** Only token values change, not the theming mechanism.

## File map

```
packages/ui/src/
├── styles/
│   └── index.css                  REWRITTEN — new tokens, fonts, base styles
├── components/
│   ├── button.tsx                 MODIFIED — tactical variants
│   ├── card.tsx                   MODIFIED — add `variant` prop (plain | bracket)
│   ├── input.tsx                  MODIFIED — ledger styling
│   ├── pill.tsx                   NEW
│   ├── stamp.tsx                  NEW
│   ├── section-title.tsx          NEW
│   └── stat-row.tsx               NEW
└── index.ts                       MODIFIED — re-export new primitives
```

No `apps/web` changes expected. Any forced by the compiler (e.g., Card variant prop required where none was before) should not occur because `variant` defaults to `"plain"`.

---

## Task 0: Worktree + baseline

- [ ] **Step 1: Create worktree.**

```bash
cd /mnt/c/Users/Matt/Source/TarkovGunsmith
git fetch origin
git worktree add .worktrees/design-tokens -b feat/design-tokens-primitives origin/main
cd .worktrees/design-tokens
pnpm install --frozen-lockfile
pnpm --filter "./packages/*" build
```

- [ ] **Step 2: Baseline green.**

```bash
pnpm typecheck && pnpm lint && pnpm format:check && pnpm test
```

Expected: all green.

---

## Task 1: Rewrite design tokens (`styles/index.css`)

**Files:**

- Rewrite: `packages/ui/src/styles/index.css`

- [ ] **Step 1: Replace the file contents.**

```css
@import "tailwindcss";
@import url("https://fonts.googleapis.com/css2?family=Bungee&family=Chivo:ital,wght@0,300;0,400;0,500;0,700;0,800;1,400&family=Azeret+Mono:ital,wght@0,400;0,500;0,600;0,700;1,400&display=swap");

@theme {
  /* ───── Field Ledger palette ────────────────────────────────── */
  --color-background: #0e0f0c;
  --color-foreground: #e6e4db;

  /* Surfaces */
  --color-card: #16170f;
  --color-card-foreground: #e6e4db;
  --color-popover: #1f211a;
  --color-popover-foreground: #e6e4db;
  --color-muted: #1f211a;
  --color-muted-foreground: #9a988d;
  --color-accent: #2a2c23;
  --color-accent-foreground: #e6e4db;
  --color-secondary: #2a2c23;
  --color-secondary-foreground: #e6e4db;

  /* Strokes + inputs */
  --color-border: #3a3d33;
  --color-input: #1f211a;
  --color-ring: #f59e0b;

  /* Amber — primary accent */
  --color-primary: #f59e0b;
  --color-primary-foreground: #0e0f0c;

  /* Destructive (blood red) */
  --color-destructive: #b91c1c;
  --color-destructive-foreground: #e6e4db;

  /* Field Ledger — additional palette (not semantic aliases) */
  --color-amber-deep: #b45309;
  --color-olive: #7a8b3f;
  --color-rust: #9c3f1e;
  --color-paper-dim: #6b6a60;
  --color-line-muted: #26291f;

  /* ───── Typography ──────────────────────────────────────────── */
  --font-display: "Bungee", ui-sans-serif, system-ui, sans-serif;
  --font-sans: "Chivo", ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
  --font-mono: "Azeret Mono", ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;

  /* ───── Shape ───────────────────────────────────────────────── */
  --radius: 0.125rem;
}

@layer base {
  * {
    border-color: var(--color-border);
  }

  body {
    background-color: var(--color-background);
    color: var(--color-foreground);
    font-family: var(--font-sans);
    font-weight: 400;
    -webkit-font-smoothing: antialiased;
    -moz-osx-font-smoothing: grayscale;

    /* Subtle atmospheric backlight */
    background-image:
      radial-gradient(ellipse at 15% 0%, rgba(245, 158, 11, 0.05), transparent 55%),
      radial-gradient(ellipse at 85% 100%, rgba(122, 139, 63, 0.04), transparent 55%);
    background-attachment: fixed;
  }

  /* Grain overlay on the body — subtle texture so the dark theme isn't sterile */
  body::before {
    content: "";
    position: fixed;
    inset: 0;
    pointer-events: none;
    z-index: 1;
    mix-blend-mode: overlay;
    opacity: 0.28;
    background-image: url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='200' height='200'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 0.9  0 0 0 0 0.9  0 0 0 0 0.85  0 0 0 0.06 0'/></filter><rect width='200' height='200' filter='url(%23n)'/></svg>");
  }

  /* Ensure app content sits above the grain layer */
  #root,
  #__root,
  main {
    position: relative;
    z-index: 2;
  }

  /* Mono numerics everywhere by default on tabular contexts */
  table,
  pre,
  code,
  kbd,
  samp {
    font-family: var(--font-mono);
  }

  ::selection {
    background-color: var(--color-primary);
    color: var(--color-primary-foreground);
  }

  ::-webkit-scrollbar {
    width: 10px;
    height: 10px;
  }
  ::-webkit-scrollbar-track {
    background: var(--color-background);
  }
  ::-webkit-scrollbar-thumb {
    background: var(--color-border);
    border: 2px solid var(--color-background);
  }
  ::-webkit-scrollbar-thumb:hover {
    background: var(--color-paper-dim);
  }
}
```

- [ ] **Step 2: Verify build.**

```bash
pnpm --filter @tarkov/ui build
pnpm --filter @tarkov/web typecheck
```

If typecheck fails with token-shape errors (unlikely — Tailwind v4 tolerates arbitrary tokens), fix by ensuring no token references missing values.

- [ ] **Step 3: Commit.**

```bash
git add packages/ui/src/styles/index.css
git commit -m "feat(ui): Field Ledger design tokens — fonts, palette, grain, shape"
```

---

## Task 2: Update `Card` primitive with `bracket` variant

**Files:**

- Modify: `packages/ui/src/components/card.tsx`

- [ ] **Step 1: Replace the file.**

```tsx
import { forwardRef } from "react";
import type { HTMLAttributes } from "react";
import { cva } from "class-variance-authority";
import type { VariantProps } from "class-variance-authority";
import { cn } from "../lib/cn.js";

const cardVariants = cva(
  "relative rounded-[var(--radius)] border bg-[var(--color-card)] text-[var(--color-card-foreground)]",
  {
    variants: {
      variant: {
        plain: "",
        bracket:
          "before:content-[''] before:absolute before:top-[-1px] before:left-[-1px] before:w-3.5 before:h-3.5 before:border-[2px] before:border-b-0 before:border-r-0 before:border-[var(--color-primary)] after:content-[''] after:absolute after:bottom-[-1px] after:right-[-1px] after:w-3.5 after:h-3.5 after:border-[2px] after:border-t-0 after:border-l-0 after:border-[var(--color-primary)]",
      },
    },
    defaultVariants: { variant: "plain" },
  },
);

export interface CardProps
  extends HTMLAttributes<HTMLDivElement>, VariantProps<typeof cardVariants> {}

export const Card = forwardRef<HTMLDivElement, CardProps>(function Card(
  { className, variant, ...props },
  ref,
) {
  return <div ref={ref} className={cn(cardVariants({ variant }), className)} {...props} />;
});

export const CardHeader = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(
  function CardHeader({ className, ...props }, ref) {
    return (
      <div
        ref={ref}
        className={cn(
          "flex flex-col gap-1.5 border-b border-dashed border-[var(--color-border)] px-5 py-4",
          className,
        )}
        {...props}
      />
    );
  },
);

export const CardTitle = forwardRef<HTMLHeadingElement, HTMLAttributes<HTMLHeadingElement>>(
  function CardTitle({ className, ...props }, ref) {
    return (
      <h3
        ref={ref}
        className={cn(
          "text-lg font-bold tracking-tight leading-tight text-[var(--color-foreground)]",
          className,
        )}
        {...props}
      />
    );
  },
);

export const CardDescription = forwardRef<
  HTMLParagraphElement,
  HTMLAttributes<HTMLParagraphElement>
>(function CardDescription({ className, ...props }, ref) {
  return (
    <p
      ref={ref}
      className={cn(
        "font-mono text-[11px] tracking-[0.18em] uppercase text-[var(--color-muted-foreground)]",
        className,
      )}
      {...props}
    />
  );
});

export const CardContent = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(
  function CardContent({ className, ...props }, ref) {
    return <div ref={ref} className={cn("px-5 py-4", className)} {...props} />;
  },
);

export const CardFooter = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(
  function CardFooter({ className, ...props }, ref) {
    return (
      <div
        ref={ref}
        className={cn(
          "flex items-center border-t border-dashed border-[var(--color-border)] px-5 py-3",
          className,
        )}
        {...props}
      />
    );
  },
);
```

- [ ] **Step 2: Typecheck + lint.**

```bash
pnpm --filter @tarkov/ui typecheck && pnpm --filter @tarkov/ui lint
```

- [ ] **Step 3: Commit.**

```bash
git add packages/ui/src/components/card.tsx
git commit -m "feat(ui): Card — add bracket variant, dashed dividers, Azeret Mono descriptions"
```

---

## Task 3: Update `Button` primitive (tactical variants)

**Files:**

- Modify: `packages/ui/src/components/button.tsx`

- [ ] **Step 1: Replace.**

```tsx
import { forwardRef } from "react";
import type { ButtonHTMLAttributes } from "react";
import { cva } from "class-variance-authority";
import type { VariantProps } from "class-variance-authority";
import { cn } from "../lib/cn.js";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-[var(--radius)] font-mono text-[12px] tracking-[0.14em] uppercase font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-ring)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--color-background)] disabled:pointer-events-none disabled:opacity-40 border",
  {
    variants: {
      variant: {
        default:
          "bg-[var(--color-primary)] text-[var(--color-primary-foreground)] border-[var(--color-primary)] hover:bg-[var(--color-amber-deep)] hover:border-[var(--color-amber-deep)] hover:text-[var(--color-foreground)] font-semibold",
        secondary:
          "bg-transparent text-[var(--color-foreground)] border-[var(--color-border)] hover:border-[var(--color-primary)] hover:text-[var(--color-primary)]",
        ghost:
          "bg-transparent text-[var(--color-muted-foreground)] border-transparent hover:text-[var(--color-primary)]",
        destructive:
          "bg-[var(--color-destructive)] text-[var(--color-destructive-foreground)] border-[var(--color-destructive)] hover:opacity-90",
      },
      size: {
        sm: "h-8 px-3",
        md: "h-9 px-4",
        lg: "h-10 px-6",
        icon: "h-9 w-9 p-0",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "md",
    },
  },
);

export interface ButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { className, variant, size, type = "button", ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      className={cn(buttonVariants({ variant, size }), className)}
      {...props}
    />
  );
});

export { buttonVariants };
```

- [ ] **Step 2: Verify + commit.**

```bash
pnpm --filter @tarkov/ui typecheck
git add packages/ui/src/components/button.tsx
git commit -m "feat(ui): Button — tactical variants (mono caps, sharp borders)"
```

---

## Task 4: Update `Input` primitive (ledger style)

**Files:**

- Modify: `packages/ui/src/components/input.tsx`

- [ ] **Step 1: Read the current file.**

```bash
cat packages/ui/src/components/input.tsx
```

- [ ] **Step 2: Replace with the new style.** (Keep the existing export signature — only class strings change.)

```tsx
import { forwardRef } from "react";
import type { InputHTMLAttributes } from "react";
import { cn } from "../lib/cn.js";

export type InputProps = InputHTMLAttributes<HTMLInputElement>;

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { className, type = "text", ...props },
  ref,
) {
  return (
    <input
      ref={ref}
      type={type}
      className={cn(
        "flex h-9 w-full rounded-[var(--radius)] border border-[var(--color-border)] bg-[var(--color-input)] px-3 font-mono text-sm text-[var(--color-foreground)] placeholder:text-[var(--color-paper-dim)] focus-visible:outline-none focus-visible:border-[var(--color-primary)] focus-visible:ring-1 focus-visible:ring-[var(--color-primary)] disabled:cursor-not-allowed disabled:opacity-40 tabular-nums",
        className,
      )}
      {...props}
    />
  );
});
```

- [ ] **Step 3: Commit.**

```bash
git add packages/ui/src/components/input.tsx
git commit -m "feat(ui): Input — ledger styling (mono, tabular, amber focus)"
```

---

## Task 5: New primitives — `Pill`, `Stamp`, `SectionTitle`, `StatRow`

**Files:**

- Create: `packages/ui/src/components/pill.tsx`
- Create: `packages/ui/src/components/stamp.tsx`
- Create: `packages/ui/src/components/section-title.tsx`
- Create: `packages/ui/src/components/stat-row.tsx`
- Modify: `packages/ui/src/index.ts`

- [ ] **Step 1: `pill.tsx`.**

```tsx
import { forwardRef } from "react";
import type { HTMLAttributes } from "react";
import { cva } from "class-variance-authority";
import type { VariantProps } from "class-variance-authority";
import { cn } from "../lib/cn.js";

const pillVariants = cva(
  "inline-block font-mono text-[10px] font-semibold tracking-[0.2em] uppercase px-2 py-[2px] border",
  {
    variants: {
      tone: {
        default: "text-[var(--color-foreground)] border-[var(--color-border)]",
        reliable:
          "text-[var(--color-olive)] border-[var(--color-olive)] bg-[color:rgba(122,139,63,0.1)]",
        marginal:
          "text-[var(--color-primary)] border-[var(--color-primary)] bg-[color:rgba(245,158,11,0.08)]",
        ineffective: "text-[var(--color-paper-dim)] border-[var(--color-border)]",
        accent: "text-[var(--color-primary)] border-[var(--color-primary)]",
        muted: "text-[var(--color-paper-dim)] border-[var(--color-border)]",
      },
    },
    defaultVariants: { tone: "default" },
  },
);

export interface PillProps
  extends HTMLAttributes<HTMLSpanElement>, VariantProps<typeof pillVariants> {}

export const Pill = forwardRef<HTMLSpanElement, PillProps>(function Pill(
  { className, tone, ...props },
  ref,
) {
  return <span ref={ref} className={cn(pillVariants({ tone }), className)} {...props} />;
});
```

- [ ] **Step 2: `stamp.tsx`.**

```tsx
import { forwardRef } from "react";
import type { HTMLAttributes } from "react";
import { cva } from "class-variance-authority";
import type { VariantProps } from "class-variance-authority";
import { cn } from "../lib/cn.js";

const stampVariants = cva(
  "inline-block font-mono text-[10px] font-bold tracking-[0.25em] uppercase px-2.5 py-1 border-[1.5px] -rotate-2",
  {
    variants: {
      tone: {
        amber: "text-[var(--color-primary)] border-[var(--color-primary)]",
        red: "text-[var(--color-destructive)] border-[var(--color-destructive)]",
        paper: "text-[var(--color-foreground)] border-[var(--color-foreground)]",
      },
    },
    defaultVariants: { tone: "amber" },
  },
);

export interface StampProps
  extends HTMLAttributes<HTMLSpanElement>, VariantProps<typeof stampVariants> {}

export const Stamp = forwardRef<HTMLSpanElement, StampProps>(function Stamp(
  { className, tone, ...props },
  ref,
) {
  return <span ref={ref} className={cn(stampVariants({ tone }), className)} {...props} />;
});
```

- [ ] **Step 3: `section-title.tsx`.**

```tsx
import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "../lib/cn.js";

export interface SectionTitleProps extends HTMLAttributes<HTMLDivElement> {
  readonly index: string | number;
  readonly title: string;
  readonly meta?: ReactNode;
}

/**
 * Field-ledger section divider: numbered amber label + title + thin rule +
 * right-aligned meta label. Used between content blocks on long pages.
 */
export function SectionTitle({ index, title, meta, className, ...props }: SectionTitleProps) {
  return (
    <div className={cn("flex items-center gap-4 my-8", className)} {...props}>
      <span className="font-mono text-[13px] tracking-[0.2em] text-[var(--color-primary)] uppercase">
        {String(index).padStart(2, "0")} · {title}
      </span>
      <span className="flex-1 h-px bg-[var(--color-border)]" />
      {meta && (
        <span className="font-mono text-[11px] tracking-[0.18em] uppercase text-[var(--color-muted-foreground)]">
          {meta}
        </span>
      )}
    </div>
  );
}
```

- [ ] **Step 4: `stat-row.tsx`.**

```tsx
import type { HTMLAttributes } from "react";
import { cn } from "../lib/cn.js";

export interface StatRowProps extends HTMLAttributes<HTMLDivElement> {
  /** Uppercase mono label. */
  readonly label: string;
  /** Stock / baseline value (struck-through). */
  readonly stock?: string | number;
  /** Delta vs stock — e.g. "+18", "−34%". */
  readonly delta?: string;
  /** Whether the delta is an improvement (olive) or regression (blood). */
  readonly deltaDirection?: "up" | "down" | "neutral";
  /** Current value (large, amber/paper). */
  readonly value: string | number;
  /** 0–100 value for the trailing bar. Omitted = no bar. */
  readonly percent?: number;
  /** Bar color token. */
  readonly barTone?: "primary" | "olive" | "destructive";
}

/**
 * Horizontal stat row: label → stock (strike) → delta → current → bar.
 * Used by the Builder's stat grid and any "vs. baseline" comparison view.
 */
export function StatRow({
  label,
  stock,
  delta,
  deltaDirection = "neutral",
  value,
  percent,
  barTone = "primary",
  className,
  ...props
}: StatRowProps) {
  const deltaColor =
    deltaDirection === "up"
      ? "text-[var(--color-olive)]"
      : deltaDirection === "down"
        ? "text-[var(--color-destructive)]"
        : "text-[var(--color-muted-foreground)]";
  const barColor =
    barTone === "olive"
      ? "bg-[var(--color-olive)]"
      : barTone === "destructive"
        ? "bg-[var(--color-destructive)]"
        : "bg-[var(--color-primary)]";

  return (
    <div
      className={cn(
        "grid grid-cols-[110px_46px_56px_48px_1fr] items-center gap-2.5 py-1",
        className,
      )}
      {...props}
    >
      <div className="font-mono text-[10px] tracking-[0.18em] uppercase text-[var(--color-muted-foreground)]">
        {label}
      </div>
      <div className="font-mono text-xs text-right text-[var(--color-paper-dim)] line-through decoration-[var(--color-border)]">
        {stock ?? ""}
      </div>
      <div className={cn("font-mono text-[11px] text-right tracking-wide", deltaColor)}>
        {delta ?? ""}
      </div>
      <div className="font-mono text-lg text-right font-semibold text-[var(--color-foreground)] tabular-nums">
        {value}
      </div>
      <div className="h-1 border border-[var(--color-line-muted)] bg-[var(--color-muted)] overflow-hidden">
        {percent !== undefined && (
          <span
            className={cn("block h-full", barColor)}
            style={{ width: `${Math.max(0, Math.min(100, percent))}%` }}
          />
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Export from `src/index.ts`.** Append:

```ts
export { Pill } from "./components/pill.js";
export type { PillProps } from "./components/pill.js";
export { Stamp } from "./components/stamp.js";
export type { StampProps } from "./components/stamp.js";
export { SectionTitle } from "./components/section-title.js";
export type { SectionTitleProps } from "./components/section-title.js";
export { StatRow } from "./components/stat-row.js";
export type { StatRowProps } from "./components/stat-row.js";
```

- [ ] **Step 6: Typecheck + lint.**

```bash
pnpm --filter @tarkov/ui typecheck && pnpm --filter @tarkov/ui lint && pnpm --filter @tarkov/ui build
```

- [ ] **Step 7: Commit.**

```bash
git add packages/ui/src/components/pill.tsx packages/ui/src/components/stamp.tsx packages/ui/src/components/section-title.tsx packages/ui/src/components/stat-row.tsx packages/ui/src/index.ts
git commit -m "feat(ui): Pill + Stamp + SectionTitle + StatRow primitives"
```

---

## Task 6: Full verification + visual check + push + PR

- [ ] **Step 1: CI parity.**

```bash
pnpm typecheck
pnpm lint
pnpm format:check
pnpm test
pnpm -r build
```

All exit 0. The SPA bundle size should shift slightly (new fonts via CDN = no bundle impact; SVG noise + CSS delta is tiny).

- [ ] **Step 2: Visual smoke check.** Start the dev server and walk every route. Nothing should be broken — just newly styled.

```bash
pnpm --filter @tarkov/web dev
```

Checklist (open each in browser):

- `/` — landing (old layout, new palette + fonts)
- `/builder` — mods should render; new Card styling visible
- `/calc` — same
- `/matrix` — same
- `/sim` — body silhouette zones still clickable
- `/adc` — table + summary still render
- `/aec` — ammo ranking still renders; pills still visible
- `/data` — 4 tabs + search still work
- `/charts` — Recharts bars still render (colors may look off — that's PR 5's job)

If anything throws a runtime error, stop and fix. If anything just looks visually rough (expected — we haven't done route-level work), take a note for the PR body.

- [ ] **Step 3: Push + PR.**

```bash
git push -u origin feat/design-tokens-primitives
gh pr create --title "feat(ui): Field Ledger design tokens + primitive redesign (M3 PR 1)" --body "$(cat <<'EOF'
## Summary

First PR of the M3 Frontend Design Pass ("Field Ledger" aesthetic). Ships the foundation: design tokens, typography, and a refreshed `@tarkov/ui` primitive set. Routes pick up the new palette + fonts automatically; layouts unchanged until subsequent PRs.

- **Tokens:** `packages/ui/src/styles/index.css` rewritten — new Field Ledger palette (warm-black + paper + amber + olive + blood), Google Fonts (Bungee / Chivo / Azeret Mono), SVG grain overlay, 2px radius, custom scrollbar.
- **Card:** new `variant` prop. `"plain"` (default, no visual regression) + `"bracket"` (amber corner L-marks for feature panels). Header/footer gain dashed dividers; description is now Azeret Mono caps.
- **Button:** tactical styling — mono caps, 0.14em tracking, sharp borders, amber hover. API unchanged.
- **Input:** ledger style — mono tabular, amber focus ring, muted paper placeholders.
- **New primitives:** `Pill` (tone=default|reliable|marginal|ineffective|accent|muted), `Stamp` (rotated -2°, amber|red|paper), `SectionTitle` (numbered amber label + rule + meta), `StatRow` (label → stock strike → delta → current → bar).
- Spec: `docs/superpowers/specs/2026-04-20-frontend-design-pass-design.md`.
- Plan: `docs/plans/2026-04-20-design-tokens-and-primitives-plan.md`.
- Mood board reference: `docs/design/mood-board.html`.

## Test plan

- [x] `pnpm typecheck && pnpm lint && pnpm format:check && pnpm test && pnpm -r build` — all exit 0.
- [x] Test count unchanged (no logic changes).
- [ ] Visual smoke check: walked /, /builder, /calc, /matrix, /sim, /adc, /aec, /data, /charts in dev; no runtime errors. Route-level layout polish lands in PRs 2–5.
- [ ] CI green on this PR.

## Notes for reviewers

- Existing routes will look different (palette + fonts) but should still function identically. The bracket Card variant is opt-in so no routes visually change structure yet.
- Chart colors on `/charts` and `/matrix` may look off relative to the rest of the page — PR 5 aligns them to the new tokens.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- [ ] **Step 4: Merge + cleanup.**

```bash
gh pr checks --watch
gh pr merge --squash --auto
cd /mnt/c/Users/Matt/Source/TarkovGunsmith
git worktree remove .worktrees/design-tokens
git branch -D feat/design-tokens-primitives
git fetch origin --prune
```
