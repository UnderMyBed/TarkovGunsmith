import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { TanStackRouterVite } from "@tanstack/router-plugin/vite";

export default defineConfig({
  plugins: [
    TanStackRouterVite({
      routesDirectory: "src/routes",
      generatedRouteTree: "src/route-tree.gen.ts",
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
