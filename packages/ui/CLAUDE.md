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
