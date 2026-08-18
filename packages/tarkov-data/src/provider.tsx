import { createContext, useContext } from "react";
import type { ReactNode } from "react";
import type { TarkovJsonClient } from "./client.js";

const TarkovClientContext = createContext<TarkovJsonClient | null>(null);

export interface TarkovDataProviderProps {
  client: TarkovJsonClient;
  children: ReactNode;
}

/**
 * Plumb the tarkov.dev JSON client down to all `useX` hooks in this package.
 * Wrap your app once near the root.
 */
export function TarkovDataProvider({ client, children }: TarkovDataProviderProps) {
  return <TarkovClientContext.Provider value={client}>{children}</TarkovClientContext.Provider>;
}

/**
 * Read the JSON client from context. Throws if no provider is mounted.
 */
export function useTarkovClient(): TarkovJsonClient {
  const client = useContext(TarkovClientContext);
  if (!client) {
    throw new Error(
      "useTarkovClient must be used inside a <TarkovDataProvider>. Wrap your app or test with one.",
    );
  }
  return client;
}
