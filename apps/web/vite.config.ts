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
      // Forward /api/data/* to the local data-proxy Worker (run wrangler dev separately).
      // Switches to Pages Functions or a service binding in prod.
      "/api/data": {
        target: "http://localhost:8787",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/data/, ""),
      },
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
  },
});
