# `@tarkov/ui`

Design tokens and shared React primitives for TarkovGunsmith. shadcn-style (copy-the-source pattern), built on class-variance-authority, accessible by default.

## What's in this package

- `src/styles/index.css` — Tailwind v4 `@theme` tokens + dark-first base styles. Consumers `@import "@tarkov/ui/styles.css"` from their root CSS. It also carries the `@source` directive that puts `src/` in Tailwind's scan set — without it this package resolves through `node_modules`, which Tailwind never scans, and every class used only by a primitive here is purged from the consumer's stylesheet. Do not remove it; `apps/web/src/styles.test.ts` fails if the classes stop reaching the compiled CSS.
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
- **Render-tested with `@testing-library/react`.** Every component gets a `<kebab-case>.test.tsx`
  that renders it and asserts real DOM output — rendered text/roles, prop passthrough, ref
  forwarding, and that a variant prop makes an observable difference. `environment: "jsdom"` is set package-wide in
  `vitest.config.ts` (this package is entirely components, unlike `apps/web` which sets jsdom
  per-file via a docblock). Pure-function helpers that live alongside a component (`iconUrl`,
  `weaponSilhouetteSrc`, `cardVariants`/`cn`-style `cva` string assertions) keep their own
  `<kebab-case>.test.ts` — both can coexist for the same component.
- **Don't assert Tailwind class strings here.** jsdom runs no stylesheet, so
  `expect(el.className).toContain("before:border-[var(--color-primary)]")` proves only that the
  string is on the node — it passed straight through GitHub issue #162, where none of those
  classes had a CSS rule at all. Whether a class resolves to a real rule is checked against the
  compiled stylesheet in `apps/web/src/styles.test.ts`; add new primitives to its table. Here, use
  `src/__test-utils__/class-set.ts` to assert that a variant changes the class set and that a
  caller's `className` merges through, without naming a token.
- **Coverage is enforced.** `vitest.config.ts` measures all of `src/**` (excluding test files and
  the `src/index.ts` re-export barrel) with ratcheting thresholds — see that file's header comment
  for the current numbers and how to raise them.

## How to add a new component

Use the future `add-ui-primitive` skill (TBD). Until then:

1. Create `src/components/<kebab-case>.tsx` with the component + any variant config.
2. Add `src/components/<kebab-case>.test.tsx` that renders it with `@testing-library/react` and
   asserts real behaviour (not just "renders without throwing"). If it also exports a pure helper
   worth testing in isolation, add a sibling `<kebab-case>.test.ts` for that.
3. Add its ui-only classes to `UI_ONLY_CLASSES` in `apps/web/src/styles.test.ts` — that suite
   fails on any component file it has no entry for.
4. Export from `src/index.ts`.
5. If it depends on a new Radix primitive or other dep, add it to `package.json`.

## Out of scope (deferred to follow-up plans or apps/web)

- `<DataTable>` (TanStack Table integration) — heavy; ship when apps/web `/matrix` route needs it.
- `<Combobox>` (Radix Popover + Command) — heavy; ship when apps/web `/builder` needs it.
- `<Tabs>`, `<Form>`, `<Select>` — add when first consumer needs them.
- Storybook — overkill for MVP.
- Theme switcher (light mode) — tokens are dark-first; light mode is a CSS-var override sheet, ships when apps/web has the toggle UI.
