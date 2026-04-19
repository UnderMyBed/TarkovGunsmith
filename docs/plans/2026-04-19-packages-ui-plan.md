# `packages/ui` Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship `packages/ui` — shared design tokens + a focused initial set of shadcn-style React primitives (`Button`, `Card`, `Input`, `TarkovIcon`) plus the `cn()` class-merge utility. Tailwind v4 CSS-first preset that consumers import directly.

**Architecture:** No CSS bundling — source CSS ships as-is and consumers' Tailwind v4 pipeline processes it. Components are thin, accessible, and built on `class-variance-authority` for variant management. Logic-bearing utilities (`cn`, `iconUrl`) get tested in Node env; presentational components are not unit-tested in this package (apps/web Playwright tests cover visual/behavioral). DataTable, Combobox, Tabs, Form helpers ship in a follow-up — apps/web can shadcn-CLI them inline first if needed, then extract.

**Tech Stack:** TypeScript 6, React 19 (peer), Tailwind CSS 4 (peer), `class-variance-authority` v0.7, `clsx` v2, `tailwind-merge` v2. Vitest 4 in Node env.

---

## File map (what exists at the end of this plan)

```
packages/ui/
├── CLAUDE.md
├── README.md
├── package.json
├── tsconfig.json
├── tsconfig.test.json
├── vitest.config.ts
└── src/
    ├── index.ts                    Public barrel
    ├── lib/
    │   ├── cn.ts                   class-merge utility
    │   └── cn.test.ts
    ├── components/
    │   ├── button.tsx              <Button> with variant + size
    │   ├── card.tsx                <Card>, <CardHeader>, <CardTitle>, <CardDescription>, <CardContent>, <CardFooter>
    │   ├── input.tsx               <Input>
    │   └── tarkov-icon.tsx         <TarkovIcon> + iconUrl helper
    ├── components/tarkov-icon.test.ts   Tests the iconUrl helper (no React rendering)
    └── styles/
        └── index.css               Tailwind v4 @theme tokens + base layer
```

---

## Phase 1: Package skeleton

### Task 1: Scaffold `packages/ui/package.json`

**Files:**

- Create: `packages/ui/package.json`

- [ ] **Step 1: Create directory + package.json**

```bash
mkdir -p packages/ui/src/{lib,components,styles}
```

Create `packages/ui/package.json` with EXACTLY:

```json
{
  "name": "@tarkov/ui",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "description": "Design tokens and shared React primitives (shadcn-style) for TarkovGunsmith. Tailwind v4 CSS-first.",
  "license": "MIT",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "import": "./dist/index.js"
    },
    "./styles.css": "./src/styles/index.css"
  },
  "files": ["dist", "src/styles/index.css"],
  "scripts": {
    "build": "tsc -p tsconfig.json",
    "typecheck": "tsc -p tsconfig.json --noEmit",
    "lint": "eslint . --max-warnings 0",
    "test": "vitest run",
    "test:watch": "vitest",
    "test:coverage": "vitest run --coverage"
  },
  "dependencies": {
    "class-variance-authority": "^0.7.0",
    "clsx": "^2.1.0",
    "tailwind-merge": "^2.5.0"
  },
  "peerDependencies": {
    "react": "^19.0.0",
    "tailwindcss": "^4.0.0"
  },
  "devDependencies": {
    "@types/react": "^19.0.0",
    "react": "^19.0.0",
    "tailwindcss": "^4.0.0"
  }
}
```

`./styles.css` is a non-JS subpath export — consumers `@import "@tarkov/ui/styles.css"` from their root CSS and let their own Tailwind v4 pipeline process it.

- [ ] **Step 2: Install**

```bash
pnpm install
```

Expected: pnpm reports new package, installs deps, no errors.

- [ ] **Step 3: Commit**

```bash
git add packages/ui/package.json pnpm-lock.yaml
git commit -m "feat(ui): scaffold @tarkov/ui package"
```

---

### Task 2: TypeScript + Vitest configs

**Files:**

- Create: `packages/ui/tsconfig.json`
- Create: `packages/ui/tsconfig.test.json`
- Create: `packages/ui/vitest.config.ts`

- [ ] **Step 1: Create `packages/ui/tsconfig.json`** with EXACTLY:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "dist",
    "rootDir": "src",
    "tsBuildInfoFile": ".tsbuildinfo",
    "jsx": "react-jsx",
    "lib": ["ES2022", "DOM"],
    "types": ["node", "react"]
  },
  "include": ["src/**/*"],
  "exclude": ["dist", "node_modules", "**/*.test.ts", "**/*.test.tsx"]
}
```

- [ ] **Step 2: Create `packages/ui/tsconfig.test.json`** with EXACTLY:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "noEmit": true,
    "rootDir": ".",
    "jsx": "react-jsx",
    "lib": ["ES2022", "DOM"],
    "types": ["node", "react"]
  },
  "include": ["src/**/*", "vitest.config.ts"],
  "exclude": ["dist", "node_modules"]
}
```

- [ ] **Step 3: Create `packages/ui/vitest.config.ts`** with EXACTLY:

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
    environment: "node",
    coverage: {
      provider: "v8",
      include: ["src/lib/**/*.ts", "src/components/tarkov-icon.tsx"],
      exclude: ["src/**/*.test.ts", "src/index.ts"],
      thresholds: {
        lines: 100,
        functions: 100,
        branches: 95,
        statements: 100,
      },
    },
  },
});
```

Coverage scope deliberately limited to logic-bearing files (`lib/` + the icon URL helper). Other components are presentational JSX with no testable runtime logic in this package.

- [ ] **Step 4: Update root `eslint.config.js`** to add this package's test files to `allowDefaultProject`

Read the existing `eslint.config.js`. Find the `allowDefaultProject` array and append:

- `"packages/ui/src/lib/*.test.ts"`
- `"packages/ui/src/components/*.test.ts"`

(`packages/*/vitest.config.ts` glob already covers vitest.config — don't duplicate.)

- [ ] **Step 5: Verify typecheck on the empty package fails clean**

```bash
pnpm --filter @tarkov/ui typecheck
```

Expected: `error TS18003: No inputs were found in config file` because `src/` is empty until next tasks.

- [ ] **Step 6: Commit**

```bash
git add packages/ui/tsconfig.json packages/ui/tsconfig.test.json packages/ui/vitest.config.ts eslint.config.js
git commit -m "feat(ui): add tsconfig, vitest config, and eslint allowDefaultProject entries"
```

---

### Task 3: Per-package `CLAUDE.md` and `README.md`

**Files:**

- Create: `packages/ui/CLAUDE.md`
- Create: `packages/ui/README.md`

- [ ] **Step 1: Create `packages/ui/CLAUDE.md`** with EXACTLY:

```markdown
# `@tarkov/ui`

Design tokens and shared React primitives for TarkovGunsmith. shadcn-style (copy-the-source pattern), built on class-variance-authority, accessible by default.

## What's in this package

- `src/styles/index.css` — Tailwind v4 `@theme` tokens + dark-first base styles. Consumers `@import "@tarkov/ui/styles.css"` from their root CSS.
- `src/lib/cn.ts` — `cn(...inputs)` class-merge utility (clsx + tailwind-merge).
- `src/components/button.tsx` — `<Button>` with `variant` (`default | secondary | ghost | destructive`) and `size` (`sm | md | lg | icon`).
- `src/components/card.tsx` — `<Card>` family: `<CardHeader>`, `<CardTitle>`, `<CardDescription>`, `<CardContent>`, `<CardFooter>`.
- `src/components/input.tsx` — `<Input>` text input with consistent styling.
- `src/components/tarkov-icon.tsx` — `<TarkovIcon itemId="..." />` renders an `<img>` from `assets.tarkov.dev`. Exports an `iconUrl(itemId)` helper.

## Conventions

- **shadcn-style.** Components are owned by this package — copy/paste/edit as needed; don't try to upgrade them via a CLI.
- **One component per file.** `kebab-case.tsx` filenames; PascalCase exports.
- **Variants via `cva`.** New variant? Add to the `cva` call, not new component files.
- **`cn()` for class merging.** Always use it inside `className={cn(...)}` to dedupe Tailwind utilities.
- **Accessible by default.** Forward refs, support `aria-*`/standard HTML props via spread, use semantic HTML.
- **Tested when there's logic.** `cn` and `iconUrl` get tests; pure JSX components don't (apps/web Playwright covers them).
- **No coverage on JSX components** — `vitest.config.ts` excludes them from thresholds.

## How to add a new component

Use the future `add-ui-primitive` skill (TBD). Until then:

1. Create `src/components/<kebab-case>.tsx` with the component + any variant config.
2. If it has runtime logic worth testing, add `<kebab-case>.test.ts` testing pure functions extracted from the component (no React rendering in this package).
3. Export from `src/index.ts`.
4. If it depends on a new Radix primitive or other dep, add it to `package.json`.

## Out of scope (deferred to follow-up plans or apps/web)

- `<DataTable>` (TanStack Table integration) — heavy; ship when apps/web `/matrix` route needs it.
- `<Combobox>` (Radix Popover + Command) — heavy; ship when apps/web `/builder` needs it.
- `<Tabs>`, `<Form>`, `<Select>` — add when first consumer needs them.
- Storybook — overkill for MVP.
- Theme switcher (light mode) — tokens are dark-first; light mode is a CSS-var override sheet, ships when apps/web has the toggle UI.
```

- [ ] **Step 2: Create `packages/ui/README.md`** with EXACTLY:

````markdown
# @tarkov/ui

Design tokens + shared React primitives for TarkovGunsmith.

## Use

```tsx
import { Button, Card, CardHeader, CardTitle, CardContent, TarkovIcon } from "@tarkov/ui";
import "@tarkov/ui/styles.css"; // or @import in your root CSS

function AmmoCard() {
  return (
    <Card>
      <CardHeader>
        <TarkovIcon itemId="5656d7c34bdc2d9d198b4587" alt="5.45 PS" />
        <CardTitle>5.45x39mm PS gs</CardTitle>
      </CardHeader>
      <CardContent>
        <Button>Add to comparison</Button>
      </CardContent>
    </Card>
  );
}
```

See [`CLAUDE.md`](./CLAUDE.md) for conventions.
````

- [ ] **Step 3: Commit**

```bash
git add packages/ui/CLAUDE.md packages/ui/README.md
git commit -m "docs(ui): add per-package CLAUDE.md and README"
```

---

## Phase 2: Utility + tokens

### Task 4: `cn()` utility

**Files:**

- Create: `packages/ui/src/lib/cn.ts`
- Create: `packages/ui/src/lib/cn.test.ts`

- [ ] **Step 1: Write `packages/ui/src/lib/cn.test.ts`** with EXACTLY:

```ts
import { describe, expect, it } from "vitest";
import { cn } from "./cn.js";

describe("cn", () => {
  it("joins multiple class strings", () => {
    expect(cn("foo", "bar")).toBe("foo bar");
  });

  it("dedupes conflicting Tailwind utilities, keeping the last one", () => {
    // tailwind-merge knows that p-2 and p-4 conflict; p-4 wins.
    expect(cn("p-2", "p-4")).toBe("p-4");
  });

  it("handles conditional classes via clsx", () => {
    expect(cn("foo", false && "skip", "bar", null, undefined, { baz: true, qux: false })).toBe(
      "foo bar baz",
    );
  });

  it("returns an empty string for no inputs", () => {
    expect(cn()).toBe("");
  });

  it("preserves non-conflicting Tailwind utilities", () => {
    expect(cn("p-2", "m-4", "text-sm")).toBe("p-2 m-4 text-sm");
  });
});
```

- [ ] **Step 2: Run, verify failure (module not found)**

```bash
pnpm --filter @tarkov/ui test src/lib/cn.test.ts
```

Expected: FAIL.

- [ ] **Step 3: Write `packages/ui/src/lib/cn.ts`** with EXACTLY:

```ts
import { clsx } from "clsx";
import type { ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/**
 * Compose class names with `clsx` and dedupe conflicting Tailwind utilities
 * with `tailwind-merge`. Use inside every `className={cn(...)}` for predictable
 * variant overrides.
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
```

- [ ] **Step 4: Run, verify pass**

```bash
pnpm --filter @tarkov/ui test src/lib/cn.test.ts
```

Expected: 5 passing tests.

- [ ] **Step 5: Commit**

```bash
git add packages/ui/src/lib/cn.ts packages/ui/src/lib/cn.test.ts
git commit -m "feat(ui): add cn class-merge utility"
```

---

### Task 5: Design tokens + Tailwind v4 preset

**Files:**

- Create: `packages/ui/src/styles/index.css`

- [ ] **Step 1: Create `packages/ui/src/styles/index.css`** with EXACTLY:

```css
@import "tailwindcss";

@theme {
  /* Color scale — dark-first, neutral with a muted Tarkov-tan accent */
  --color-background: oklch(0.16 0 0);
  --color-foreground: oklch(0.96 0 0);

  --color-muted: oklch(0.22 0 0);
  --color-muted-foreground: oklch(0.7 0 0);

  --color-card: oklch(0.19 0 0);
  --color-card-foreground: oklch(0.96 0 0);

  --color-popover: oklch(0.18 0 0);
  --color-popover-foreground: oklch(0.96 0 0);

  --color-border: oklch(0.28 0 0);
  --color-input: oklch(0.22 0 0);
  --color-ring: oklch(0.55 0.05 90);

  /* Tarkov-tan accent — muted greenish-brown reminiscent of EFT's UI chrome */
  --color-primary: oklch(0.65 0.06 90);
  --color-primary-foreground: oklch(0.13 0 0);

  --color-secondary: oklch(0.25 0 0);
  --color-secondary-foreground: oklch(0.96 0 0);

  --color-destructive: oklch(0.55 0.18 25);
  --color-destructive-foreground: oklch(0.98 0 0);

  --color-accent: oklch(0.3 0 0);
  --color-accent-foreground: oklch(0.96 0 0);

  /* Spacing/radius/typography */
  --radius: 0.5rem;
  --font-sans:
    "Inter", ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial,
    sans-serif;
  --font-mono:
    "JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono",
    "Courier New", monospace;
}

@layer base {
  * {
    border-color: var(--color-border);
  }

  body {
    background-color: var(--color-background);
    color: var(--color-foreground);
    font-family: var(--font-sans);
    -webkit-font-smoothing: antialiased;
    -moz-osx-font-smoothing: grayscale;
  }

  ::selection {
    background-color: var(--color-primary);
    color: var(--color-primary-foreground);
  }
}
```

`@import "tailwindcss"` is the Tailwind v4 entry point — consumers' Tailwind processor expands this into the full utility layer at build time.

- [ ] **Step 2: Verify the file is present and well-formed CSS**

```bash
head -20 packages/ui/src/styles/index.css
```

Expected: shows the imports and tokens.

- [ ] **Step 3: Verify root format check (CSS files are picked up by Prettier)**

```bash
pnpm exec prettier --check packages/ui/src/styles/index.css
```

If it fails, run `pnpm exec prettier --write packages/ui/src/styles/index.css` and re-check.

- [ ] **Step 4: Commit**

```bash
git add packages/ui/src/styles/index.css
git commit -m "feat(ui): add Tailwind v4 theme tokens (dark-first, Tarkov-tan accent)"
```

---

## Phase 3: Components

### Task 6: `<Button>`

**Files:**

- Create: `packages/ui/src/components/button.tsx`

- [ ] **Step 1: Create `packages/ui/src/components/button.tsx`** with EXACTLY:

```tsx
import { forwardRef } from "react";
import type { ButtonHTMLAttributes } from "react";
import { cva } from "class-variance-authority";
import type { VariantProps } from "class-variance-authority";
import { cn } from "../lib/cn.js";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-[var(--radius)] text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-ring)] disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        default:
          "bg-[var(--color-primary)] text-[var(--color-primary-foreground)] hover:opacity-90",
        secondary:
          "bg-[var(--color-secondary)] text-[var(--color-secondary-foreground)] hover:opacity-90",
        ghost:
          "bg-transparent text-[var(--color-foreground)] hover:bg-[var(--color-accent)] hover:text-[var(--color-accent-foreground)]",
        destructive:
          "bg-[var(--color-destructive)] text-[var(--color-destructive-foreground)] hover:opacity-90",
      },
      size: {
        sm: "h-8 px-3",
        md: "h-9 px-4",
        lg: "h-10 px-6",
        icon: "h-9 w-9",
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

- [ ] **Step 2: Verify typecheck + lint**

```bash
pnpm --filter @tarkov/ui typecheck && pnpm exec eslint packages/ui --max-warnings 0
```

Expected: both exit 0.

- [ ] **Step 3: Commit**

```bash
git add packages/ui/src/components/button.tsx
git commit -m "feat(ui): add Button component with variant + size"
```

---

### Task 7: `<Card>` family

**Files:**

- Create: `packages/ui/src/components/card.tsx`

- [ ] **Step 1: Create `packages/ui/src/components/card.tsx`** with EXACTLY:

```tsx
import { forwardRef } from "react";
import type { HTMLAttributes } from "react";
import { cn } from "../lib/cn.js";

export const Card = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(function Card(
  { className, ...props },
  ref,
) {
  return (
    <div
      ref={ref}
      className={cn(
        "rounded-[var(--radius)] border bg-[var(--color-card)] text-[var(--color-card-foreground)] shadow-sm",
        className,
      )}
      {...props}
    />
  );
});

export const CardHeader = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(
  function CardHeader({ className, ...props }, ref) {
    return <div ref={ref} className={cn("flex flex-col gap-1.5 p-6", className)} {...props} />;
  },
);

export const CardTitle = forwardRef<HTMLHeadingElement, HTMLAttributes<HTMLHeadingElement>>(
  function CardTitle({ className, ...props }, ref) {
    return (
      <h3
        ref={ref}
        className={cn("text-lg font-semibold leading-none tracking-tight", className)}
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
      className={cn("text-sm text-[var(--color-muted-foreground)]", className)}
      {...props}
    />
  );
});

export const CardContent = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(
  function CardContent({ className, ...props }, ref) {
    return <div ref={ref} className={cn("p-6 pt-0", className)} {...props} />;
  },
);

export const CardFooter = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(
  function CardFooter({ className, ...props }, ref) {
    return <div ref={ref} className={cn("flex items-center p-6 pt-0", className)} {...props} />;
  },
);
```

- [ ] **Step 2: Verify typecheck + lint**

```bash
pnpm --filter @tarkov/ui typecheck && pnpm exec eslint packages/ui --max-warnings 0
```

Expected: both exit 0.

- [ ] **Step 3: Commit**

```bash
git add packages/ui/src/components/card.tsx
git commit -m "feat(ui): add Card family components"
```

---

### Task 8: `<Input>`

**Files:**

- Create: `packages/ui/src/components/input.tsx`

- [ ] **Step 1: Create `packages/ui/src/components/input.tsx`** with EXACTLY:

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
        "flex h-9 w-full rounded-[var(--radius)] border bg-[var(--color-input)] px-3 py-1 text-sm shadow-sm transition-colors",
        "file:border-0 file:bg-transparent file:text-sm file:font-medium",
        "placeholder:text-[var(--color-muted-foreground)]",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-ring)]",
        "disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
      {...props}
    />
  );
});
```

- [ ] **Step 2: Verify typecheck + lint**

```bash
pnpm --filter @tarkov/ui typecheck && pnpm exec eslint packages/ui --max-warnings 0
```

Expected: both exit 0.

- [ ] **Step 3: Commit**

```bash
git add packages/ui/src/components/input.tsx
git commit -m "feat(ui): add Input component"
```

---

### Task 9: `<TarkovIcon>` + `iconUrl` helper

**Files:**

- Create: `packages/ui/src/components/tarkov-icon.tsx`
- Create: `packages/ui/src/components/tarkov-icon.test.ts`

- [ ] **Step 1: Write `packages/ui/src/components/tarkov-icon.test.ts`** with EXACTLY:

```ts
import { describe, expect, it } from "vitest";
import { iconUrl } from "./tarkov-icon.js";

describe("iconUrl", () => {
  it("builds a CDN URL from an item id with default size", () => {
    expect(iconUrl("5656d7c34bdc2d9d198b4587")).toBe(
      "https://assets.tarkov.dev/5656d7c34bdc2d9d198b4587-icon.webp",
    );
  });

  it("supports the grid-image variant", () => {
    expect(iconUrl("5656d7c34bdc2d9d198b4587", "grid-image")).toBe(
      "https://assets.tarkov.dev/5656d7c34bdc2d9d198b4587-grid-image.webp",
    );
  });

  it("supports the base-image variant", () => {
    expect(iconUrl("5656d7c34bdc2d9d198b4587", "base-image")).toBe(
      "https://assets.tarkov.dev/5656d7c34bdc2d9d198b4587-base-image.webp",
    );
  });

  it("throws on empty itemId", () => {
    expect(() => iconUrl("")).toThrow(/itemId/);
  });
});
```

- [ ] **Step 2: Run, verify failure (module not found)**

```bash
pnpm --filter @tarkov/ui test src/components/tarkov-icon.test.ts
```

Expected: FAIL.

- [ ] **Step 3: Create `packages/ui/src/components/tarkov-icon.tsx`** with EXACTLY:

```tsx
import { forwardRef } from "react";
import type { ImgHTMLAttributes } from "react";
import { cn } from "../lib/cn.js";

const CDN_BASE = "https://assets.tarkov.dev";

export type IconVariant = "icon" | "grid-image" | "base-image";

/**
 * Build the CDN URL for a tarkov-api item icon.
 *
 * @example
 *   iconUrl("5656d7c34bdc2d9d198b4587"); // → "https://assets.tarkov.dev/5656d7c34bdc2d9d198b4587-icon.webp"
 */
export function iconUrl(itemId: string, variant: IconVariant = "icon"): string {
  if (!itemId) throw new Error("iconUrl: itemId is required");
  return `${CDN_BASE}/${itemId}-${variant}.webp`;
}

export interface TarkovIconProps extends Omit<ImgHTMLAttributes<HTMLImageElement>, "src"> {
  itemId: string;
  variant?: IconVariant;
}

/**
 * Renders an EFT item icon from `assets.tarkov.dev`.
 */
export const TarkovIcon = forwardRef<HTMLImageElement, TarkovIconProps>(function TarkovIcon(
  { itemId, variant = "icon", className, alt = "", loading = "lazy", ...props },
  ref,
) {
  return (
    <img
      ref={ref}
      src={iconUrl(itemId, variant)}
      alt={alt}
      loading={loading}
      className={cn("inline-block", className)}
      {...props}
    />
  );
});
```

- [ ] **Step 4: Run, verify pass**

```bash
pnpm --filter @tarkov/ui test src/components/tarkov-icon.test.ts
```

Expected: 4 passing tests.

- [ ] **Step 5: Commit**

```bash
git add packages/ui/src/components/tarkov-icon.tsx packages/ui/src/components/tarkov-icon.test.ts
git commit -m "feat(ui): add TarkovIcon component and iconUrl helper"
```

---

## Phase 4: Barrel + ship

### Task 10: Public barrel

**Files:**

- Create: `packages/ui/src/index.ts`

- [ ] **Step 1: Create `packages/ui/src/index.ts`** with EXACTLY:

```ts
// Utility
export { cn } from "./lib/cn.js";

// Components
export { Button, buttonVariants } from "./components/button.js";
export type { ButtonProps } from "./components/button.js";
export {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from "./components/card.js";
export { Input } from "./components/input.js";
export type { InputProps } from "./components/input.js";
export { TarkovIcon, iconUrl } from "./components/tarkov-icon.js";
export type { TarkovIconProps, IconVariant } from "./components/tarkov-icon.js";
```

- [ ] **Step 2: Verify the full package gates**

```bash
pnpm --filter @tarkov/ui typecheck
pnpm --filter @tarkov/ui test
pnpm --filter @tarkov/ui build
pnpm exec eslint packages/ui --max-warnings 0
pnpm exec prettier --check packages/ui
```

Expected: all exit 0. Test count: 9 (5 cn + 4 iconUrl).

- [ ] **Step 3: Commit**

```bash
git add packages/ui/src/index.ts
git commit -m "feat(ui): add public barrel"
```

---

### Task 11: Update root `CLAUDE.md`

**Files:**

- Modify: `CLAUDE.md`

- [ ] **Step 1: Update the Status callout**

Find:

```markdown
> **Status:** Foundation + `packages/ballistics` + `packages/tarkov-types` + `packages/tarkov-data` shipped. ...
```

Replace with:

```markdown
> **Status:** Foundation + all four packages shipped (`packages/ballistics`, `packages/tarkov-types`, `packages/tarkov-data`, `packages/ui`). Math, generated types, the data layer, and design tokens + primitives are live. Still pending: `apps/data-proxy`, `apps/builds-api`, `apps/web`. See [`docs/superpowers/specs/2026-04-18-tarkov-gunsmith-rebuild-design.md`](docs/superpowers/specs/2026-04-18-tarkov-gunsmith-rebuild-design.md) for the full design.
```

- [ ] **Step 2: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: note packages/ui shipped in CLAUDE.md status"
```

---

### Task 12: Final verification + PR + merge + release

**Files:** none (operational)

- [ ] **Step 1: Final clean install + all gates**

```bash
rm -rf node_modules packages/*/node_modules packages/*/dist packages/*/.tsbuildinfo
pnpm install --frozen-lockfile
pnpm typecheck && pnpm lint && pnpm format:check && pnpm test && pnpm build
```

Expected: all exit 0.

- [ ] **Step 2: Push branch + open PR**

```bash
git push -u origin feat/packages-ui
gh pr create --base main --head feat/packages-ui --title "feat(ui): add @tarkov/ui package" --body "Implements 0d.3 (ui half). Tailwind v4 design tokens (dark-first, Tarkov-tan accent), \`cn()\` class-merge utility, and 4 shadcn-style primitives (Button, Card, Input, TarkovIcon). DataTable / Combobox / Tabs / Form helpers deferred — apps/web can shadcn-CLI inline first if needed."
```

Capture the PR number.

- [ ] **Step 3: Wait for CI green explicitly**

```bash
sleep 8
RUN_ID=$(gh run list --repo UnderMyBed/TarkovGunsmith --branch feat/packages-ui --limit 1 --json databaseId --jq '.[0].databaseId')
gh run watch $RUN_ID --repo UnderMyBed/TarkovGunsmith
gh run view $RUN_ID --repo UnderMyBed/TarkovGunsmith --json conclusion --jq '.conclusion'
```

Expected: `success`.

- [ ] **Step 4: Squash-merge**

```bash
gh pr merge <pr-number> --repo UnderMyBed/TarkovGunsmith --squash --delete-branch
```

- [ ] **Step 5: Wait for release-please + auto-triggered CI**

```bash
sleep 15
gh pr list --repo UnderMyBed/TarkovGunsmith --state open
RUN_ID=$(gh run list --repo UnderMyBed/TarkovGunsmith --workflow ci.yml --branch release-please--branches--main--components--tarkov-gunsmith --limit 1 --json databaseId --jq '.[0].databaseId')
gh run watch $RUN_ID --repo UnderMyBed/TarkovGunsmith
gh run view $RUN_ID --repo UnderMyBed/TarkovGunsmith --json conclusion --jq '.conclusion'
```

Expected: `success`.

- [ ] **Step 6: Admin-merge release PR**

```bash
gh pr merge <release-pr-number> --repo UnderMyBed/TarkovGunsmith --squash --delete-branch --admin
```

Expected: `v0.5.0` tag and GitHub Release.

- [ ] **Step 7: Cleanup**

```bash
git switch main && git pull --ff-only
git worktree remove ~/.config/superpowers/worktrees/TarkovGunsmith/feat-packages-ui --force
git branch -D feat/packages-ui
git remote prune origin
```

---

## Done — what's true after this plan

- `packages/ui` exists at workspace `0.0.0`; repo released as `v0.5.0`.
- `cn()` utility (5 tests) + `iconUrl` helper (4 tests).
- 4 React primitives: `Button`, `Card` (+ subcomponents), `Input`, `TarkovIcon`.
- Tailwind v4 theme tokens at `src/styles/index.css`, exported as `@tarkov/ui/styles.css`.
- All 4 dependency-tier packages (ballistics, types, data, ui) live. **Ready to start on Workers + Web app.**

## What's NOT true yet (intentionally deferred)

- `<DataTable>`, `<Combobox>`, `<Tabs>`, `<Form>`, `<Select>` — add when consumers need them.
- Light-mode token override sheet — add when apps/web has the toggle UI.
- Storybook / visual regression tests — add post-MVP if useful.
- Component snapshot tests — Playwright in apps/web is the better tool for visual + behavioral coverage.
- An `add-ui-primitive` skill — add after the 5th component when the pattern is settled.
