/**
 * Test helpers for asserting on a rendered element's classes WITHOUT naming design tokens.
 *
 * These component tests used to assert Tailwind class strings directly —
 * `expect(el.className).toContain("before:border-[var(--color-primary)]")`. That did two
 * bad things. It passed straight through GitHub issue #162, because the class genuinely was
 * on the node and only the CSS rule was missing (whether the rule exists is now checked by
 * `apps/web/src/styles.test.ts`, against the compiled stylesheet). And it welded ~35
 * assertions to specific token names, so renaming one token during a redesign broke a green
 * suite for no behavioural reason — with a 100% coverage ratchet forbidding their deletion.
 *
 * What is left here is the part a unit test can honestly own: that a variant prop produces
 * an observably different class set, and that a caller's `className` merges on top of the
 * component's own rather than replacing it. Neither mentions a token.
 *
 * (Lives under `src/` and therefore compiles into `dist/`, same as
 * `packages/og/src/__test-utils__/svg.ts`. Nothing outside the tests imports it and it is
 * not re-exported from `src/index.ts`.)
 */

/**
 * A rendered element's classes as a stable, order-independent string, so two renders can be
 * compared for "did this prop change what gets applied?".
 */
export function classSignature(el: Element): string {
  return [...el.classList].sort().join(" ");
}

/**
 * The classes on `el`, for spreading into jest-dom's `toHaveClass(...)`.
 */
export function classList(el: Element): string[] {
  return [...el.classList];
}
