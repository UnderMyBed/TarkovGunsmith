import { cloudflareTest } from "@cloudflare/vitest-pool-workers";
import { defineConfig } from "vitest/config";

/* NO COVERAGE BLOCK HERE — READ BEFORE ADDING ONE.
 *
 * Coverage is not measured for this package for exactly one reason: no provider is
 * installed. There is no upstream blocker. @cloudflare/vitest-pool-workers@0.22.0 runs
 * fine under istanbul instrumentation — verified by installing @vitest/coverage-istanbul
 * and running `vitest run --coverage --coverage.provider=istanbul`, which reported 5 test
 * files, 48 tests passing, 98.51% statements over the four source files it instrumented.
 * Turning it on is a two-line job: add the provider dep, add a coverage block, set
 * thresholds to what it measures that day. Note that istanbul did NOT instrument id.ts or
 * rate-limit.ts in that run, so measure before trusting a headline number.
 *
 * v8 is not an alternative — workerd does not support it, which is why the pool documents
 * istanbul in the first place.
 *
 * IF EVERY TEST FILE FAILS AT IMPORT WITH:
 *   TypeError: Cannot read properties of undefined (reading 'config')
 * it is neither the pool nor coverage. The pool hooks vitest's runner state, so it must
 * load the SAME physical vitest instance the CLI is executing. pnpm keys each instance by
 * its resolved peers, so adding or removing ANY vitest peer — a coverage provider, an
 * @types/node bump — re-keys .pnpm/vitest@<hash> and can leave a stale bin shim at
 * node_modules/.bin/vitest pointing at the previous one. Two instances, and the pool's
 * state lookup returns undefined: zero tests execute and every file reports that error.
 *
 * Fix: `pnpm install`. If it survives that, delete the stale `.bin/vitest` shim and
 * reinstall. This package declares `vitest` as a direct devDependency specifically so pnpm
 * owns that shim and relinks it on every install, rather than leaving an orphan behind.
 *
 * NOTE ON `test:coverage`: this package DOES define that script, and it runs plain
 * `vitest run` with no instrumentation. That looks redundant next to `test`, and it is not.
 * CI runs `pnpm test:coverage`, and turbo silently SKIPS any package that does not define
 * the task — so when coverage enforcement landed, this package's tests stopped running in
 * CI altogether and nothing said so. The alias keeps them in the CI graph while coverage
 * measurement stays off. Do not delete it as dead weight.
 */
export default defineConfig({
  plugins: [
    cloudflareTest({
      wrangler: { configPath: "./wrangler.jsonc" },
    }),
  ],
});
