import { createRouter } from "@tanstack/react-router";
import { routeTree } from "./route-tree.gen.js";
import { routerOptions } from "./router-options.js";

export const router = createRouter({ routeTree, ...routerOptions });

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
