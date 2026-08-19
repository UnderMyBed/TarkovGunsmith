import { cloudflareTest } from "@cloudflare/vitest-pool-workers";
import { defineConfig } from "vitest/config";

/* NO COVERAGE BLOCK HERE — DELIBERATE. READ BEFORE ADDING ONE.
 *
 * This package previously declared `coverage.provider: "istanbul"` with 100/100/95/100
 * thresholds. That config had never once executed: `@vitest/coverage-istanbul` was not
 * installed anywhere in the workspace, so the moment anything ran it, it died with
 * MISSING DEPENDENCY. It was decorative, and it hid the fact that coverage does not
 * currently work here at all.
 *
 * Installing the provider does not fix it. @cloudflare/vitest-pool-workers@0.22.0 fails
 * at test-file import under coverage instrumentation with
 *   TypeError: Cannot read properties of undefined (reading 'config')
 * across all four test files. v8 is not an alternative — workerd does not support it,
 * which is why the pool documents istanbul in the first place.
 *
 * So this is an upstream limitation, not a gap in our tests. Timeboxed and deferred per
 * decision D4 of docs/plans/2026-08-19-pre-refactor-hardening-plan.md.
 *
 * Worth keeping in perspective: at 234 source lines against 353 test lines and 29 test
 * cases, this is the best-tested app in the repo by ratio. It is not the risk surface —
 * packages/ui (0.13 test:src) and the apps/web route layer are. Its 29 tests still run
 * in CI on every PR via `vitest run`; only the coverage *measurement* is missing.
 *
 *
 * NOTE ON `test:coverage`: this package DOES define that script, and it runs plain
 * `vitest run` with no instrumentation. That looks redundant next to `test`, and it is not.
 * CI runs `pnpm test:coverage`, and turbo silently SKIPS any package that does not define
 * the task — so when coverage enforcement landed, this package's tests stopped running in
 * CI altogether and nothing said so. The alias keeps them in the CI graph while coverage
 * measurement stays off. Do not delete it as dead weight.
 *
 * Re-check on the next pool upgrade. If it works, add the provider dep and a
 * `test:coverage` script, and set thresholds to whatever it measures that day.
 */
export default defineConfig({
  plugins: [
    cloudflareTest({
      wrangler: { configPath: "./wrangler.jsonc" },
    }),
  ],
});
