import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider } from "@tanstack/react-router";
import { retrySnapshotLoad, TarkovDataProvider } from "@tarkov/data";
import { router } from "./router.js";
import { builderData, tarkovClient } from "./tarkov-client.js";
import { useKeyboardShortcuts } from "./features/nav/use-keyboard-shortcuts.js";
import { ShortcutOverlay } from "./features/nav/shortcut-overlay.js";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60_000,
      refetchOnWindowFocus: false,
      // React Query's default three retries, except for a snapshot from another deploy: no
      // retry fixes that, and the user should see "Reload the page." at once.
      retry: retrySnapshotLoad,
    },
  },
});

function InnerApp() {
  const { overlayOpen, setOverlayOpen } = useKeyboardShortcuts();
  return (
    <>
      <RouterProvider router={router} />
      <ShortcutOverlay open={overlayOpen} onClose={() => setOverlayOpen(false)} />
    </>
  );
}

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TarkovDataProvider client={tarkovClient} builderData={builderData}>
        <InnerApp />
      </TarkovDataProvider>
    </QueryClientProvider>
  );
}
