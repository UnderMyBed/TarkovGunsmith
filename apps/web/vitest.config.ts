import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

/* Thresholds are a RATCHET, not an aspiration. They are set to the coverage this
 * package actually had when enforcement was switched on.
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
      //
      // Raised again fixing the `/builder/compare/$pairId` missing-<Outlet/> bug: wiring the
      // child route up so it actually mounts, plus covering its loading/error/loaded-pair
      // branches (routes/builder.compare.$pairId.test.tsx), moved measured coverage to
      // 73.04 / 70.35 / 73.57 / 73.93. Floored per-metric again.
      thresholds: {
        lines: 73,
        functions: 73,
        branches: 70,
        statements: 73,
      },
    },
  },
});
