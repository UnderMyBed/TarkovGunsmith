import { createElement } from "react";
import type { ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { TarkovDataProvider } from "../provider.js";
import type { TarkovJsonClient } from "../client.js";

/**
 * A fresh `QueryClient` per test, retries disabled.
 *
 * TanStack Query retries a failed query 3x with an exponential backoff by default — a
 * rejection-path test would otherwise sit through that backoff (or need fake timers) before
 * `result.current.isError` ever flips.
 */
export function testQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
}

/**
 * `renderHook` wrapper for the `useX` list/detail hooks in `hooks/`, which all read the
 * client via `useTarkovClient()`. Pass a `fixtureClient()` (or a hand-built
 * `TarkovJsonClient` for an error-path test).
 *
 * `createElement` rather than JSX so this file can stay a plain `.ts` module: hook test
 * files never need JSX syntax themselves (they only call `renderHook`), and giving this
 * one helper a `.tsx` extension would be the only thing in the package needing a `.test.tsx`
 * / `.tsx`-aware ESLint project entry — see the root `eslint.config.js` gotcha documented in
 * the repo's top-level CLAUDE.md. Not worth it for one file's worth of JSX.
 */
export function withTarkovProvider(client: TarkovJsonClient) {
  const queryClient = testQueryClient();
  return function Wrapper({ children }: { children: ReactNode }) {
    return createElement(
      QueryClientProvider,
      { client: queryClient },
      createElement(TarkovDataProvider, { client, children }),
    );
  };
}

/**
 * `renderHook` wrapper for hooks that only need TanStack Query — the `buildsApi`/`pairsApi`
 * load and mutation hooks, which read the global `fetch` directly rather than going through
 * `TarkovDataProvider`.
 */
export function withQueryClient() {
  const queryClient = testQueryClient();
  return function Wrapper({ children }: { children: ReactNode }) {
    return createElement(QueryClientProvider, { client: queryClient }, children);
  };
}
