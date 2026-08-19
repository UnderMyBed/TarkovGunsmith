import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

/* Thresholds are a RATCHET, not an aspiration. They are set to the coverage this
 * package actually had when enforcement was switched on (see
 * docs/plans/2026-08-19-pre-refactor-hardening-plan.md for the measured baseline table).
 *
 * Raise them as tests land. NEVER lower one to make CI pass — if a change drops
 * coverage, the change needs tests, not a smaller number. */
export default defineConfig({
  plugins: [react()],
  test: {
    include: ["src/**/*.test.ts", "src/**/*.test.tsx", "functions/lib/**/*.test.ts"],
    environment: "node",
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts", "src/**/*.tsx"],
      // src/routes/** entered measurement in Stage 1.4 of the hardening plan (was excluded —
      // 3,058 lines, 40% of the app, including the 512-line BuilderPage). Test infrastructure
      // for it lives in src/test/ (fixtures.ts, test-client.ts, render-route.tsx): a real
      // TarkovJsonClient test double + a REAL TanStack Router (memory history over the actual
      // generated route tree) so route tests exercise real fetchers, schemas, and navigation
      // rather than a re-implementation of routing.
      exclude: [
        "src/**/*.test.ts",
        "src/**/*.test.tsx",
        "src/main.tsx",
        "src/app.tsx",
        "src/router.ts",
        "src/route-tree.gen.ts",
        "src/test/**",
      ],
      // Measured with src/routes/** in scope (Stage 1.4): 71.69 / 68.82 / 72.55 / 72.47
      // (stmts/branch/funcs/lines) against a 22.11/21.04/15.85/22.64 floor before this PR's
      // route tests landed. Floored per-metric, same convention Stage 1.1 used.
      thresholds: {
        lines: 72,
        functions: 72,
        branches: 68,
        statements: 71,
      },
    },
  },
});
