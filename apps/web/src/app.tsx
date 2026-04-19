import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider } from "@tanstack/react-router";
import { TarkovDataProvider } from "@tarkov/data";
import { router } from "./router.js";
import { tarkovClient } from "./tarkov-client.js";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60_000,
      refetchOnWindowFocus: false,
    },
  },
});

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TarkovDataProvider client={tarkovClient}>
        <RouterProvider router={router} />
      </TarkovDataProvider>
    </QueryClientProvider>
  );
}
