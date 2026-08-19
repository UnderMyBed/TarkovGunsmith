import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { TanStackRouterVite } from "@tanstack/router-plugin/vite";

export default defineConfig({
  plugins: [
    TanStackRouterVite({
      routesDirectory: "src/routes",
      generatedRouteTree: "src/route-tree.gen.ts",
      // Splits each route's `component` (plus its other lazy-eligible route options) into
      // its own chunk at build time, loaded on navigation instead of upfront. Before this,
      // route-tree.gen.ts statically imported every route file, so a visit to any single
      // route (e.g. /calc) paid for the Builder, the optimizer, the compare workspace and
      // the charts in one 937 kB chunk — see Stage 5.3 of
      // docs/plans/2026-08-19-pre-refactor-hardening-plan.md. Router-owned code splitting
      // (not manual `React.lazy`) so route registration stays exactly as it is today —
      // `createFileRoute` per file — with no `.lazy.tsx` split files to hand-maintain.
      autoCodeSplitting: true,
    }),
    react(),
    tailwindcss(),
  ],
  server: {
    port: 5173,
    proxy: {
      "/api/builds": {
        target: "http://localhost:8788",
        changeOrigin: true,
        // Worker routes under `/builds/...` — strip only the `/api` prefix so
        // `/api/builds/abc` becomes `/builds/abc` on the Worker.
        rewrite: (path) => path.replace(/^\/api/, ""),
      },
    },
  },
  build: {
    target: "ES2022",
    sourcemap: true,
    // Vite 8 switched the default CSS minifier to lightningcss, whose target parser only
    // understands browser targets (chrome110, safari16, …) and rejects the ES-year target
    // above with `Unsupported target "ES2022"`, failing the build outright. Pinning CSS
    // minification back to esbuild keeps `target` meaning what it has always meant here for
    // JS, and keeps the emitted CSS byte-for-byte what it was on vite 7. Switching to
    // lightningcss is a deliberate choice about browser support, not a side effect of a
    // dependency bump.
    cssMinify: "esbuild",
  },
});
