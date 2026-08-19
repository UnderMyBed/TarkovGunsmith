import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider, createRouter, createMemoryHistory } from "@tanstack/react-router";
import type { TarkovJsonClient } from "@tarkov/data";
import { TarkovDataProvider } from "@tarkov/data";
import { render } from "@testing-library/react";
import type { RenderResult } from "@testing-library/react";
import { routeTree } from "../route-tree.gen.js";
import { createTestClient } from "./test-client.js";

/** The concrete router type `createRouter({ routeTree, history })` below always produces. */
type TestRouter = ReturnType<typeof createRouter<typeof routeTree>>;

/**
 * Mount the REAL route tree (the same `routeTree` `src/router.ts` uses) at `initialPath`,
 * under `QueryClientProvider` + `TarkovDataProvider`, so route tests exercise actual
 * `createFileRoute` components, `Route.useParams`/`useSearch`, and `<Link>` navigation —
 * not a re-implementation of routing.
 *
 * Data hooks go through a real `TarkovJsonClient` test double (`createTestClient` by
 * default) rather than being mocked hook-by-hook, so the real fetchers and Zod schemas in
 * `@tarkov/data` run too. Pass a custom `client` to exercise an error path
 * (`createTestClient({ errorResources: ["items"] })`) or an empty-data path.
 *
 * `router.load()` is awaited before `render` so the initial route match is resolved before
 * assertions run — otherwise the first render can catch the router mid-transition.
 */
export async function renderRoute(
  initialPath: string,
  options?: { client?: TarkovJsonClient },
): Promise<RenderResult & { router: TestRouter; queryClient: QueryClient }> {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const client = options?.client ?? createTestClient();
  const history = createMemoryHistory({ initialEntries: [initialPath] });
  const router = createRouter({ routeTree, history });
  await router.load();

  const utils = render(
    <QueryClientProvider client={queryClient}>
      <TarkovDataProvider client={client}>
        <RouterProvider router={router} />
      </TarkovDataProvider>
    </QueryClientProvider>,
  );

  return { ...utils, router, queryClient };
}
