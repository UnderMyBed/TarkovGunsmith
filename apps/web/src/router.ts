import { createRouter } from "@tanstack/react-router";
import { routeTree } from "./route-tree.gen.js";

export const router = createRouter({ routeTree });

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
