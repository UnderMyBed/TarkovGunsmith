import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRouter,
} from "@tanstack/react-router";
import type { TarkovJsonClient } from "@tarkov/data";
import { TarkovDataProvider } from "@tarkov/data";
import { render } from "@testing-library/react";
import type { RenderResult } from "@testing-library/react";
import type { ReactElement } from "react";
import { createTestClient } from "./test-client.js";

/**
 * Mount a page component that no longer has a route (the parked features under
 * `src/features/`) under the same providers `renderRoute` uses, inside a one-route memory
 * router so `<Link>` and router hooks inside the page still resolve.
 */
export async function renderPage(
  page: ReactElement,
  options?: { client?: TarkovJsonClient },
): Promise<RenderResult> {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const client = options?.client ?? createTestClient();
  const rootRoute = createRootRoute({ component: () => page });
  const router = createRouter({
    routeTree: rootRoute,
    history: createMemoryHistory({ initialEntries: ["/"] }),
  });
  await router.load();
  return render(
    <QueryClientProvider client={queryClient}>
      <TarkovDataProvider client={client}>
        <RouterProvider router={router} />
      </TarkovDataProvider>
    </QueryClientProvider>,
  );
}
