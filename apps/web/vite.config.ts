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
  },
});
