import { createContext, useContext } from "react";
import type { ReactNode } from "react";
import type { TarkovJsonClient } from "./client.js";
import type { BuilderDataSource } from "./snapshot/source.js";

const TarkovClientContext = createContext<TarkovJsonClient | null>(null);
const BuilderDataContext = createContext<BuilderDataSource | null>(null);

export interface TarkovDataProviderProps {
  client: TarkovJsonClient;
  /**
   * The Builder's game data and prices. Required by the Builder hooks (`useWeaponList`,
   * `usePartCatalog`, `useWeaponTree`, `useTasks`, `useTraders`, `useBuilderSnapshot`); a tree
   * that only reads the ammo and armor lists can leave it out.
   */
  builderData?: BuilderDataSource;
  children: ReactNode;
}

/**
 * Plumb the tarkov.dev JSON client and the Builder data source down to all `useX` hooks in
 * this package. Wrap your app once near the root.
 */
export function TarkovDataProvider({ client, builderData, children }: TarkovDataProviderProps) {
  return (
    <TarkovClientContext.Provider value={client}>
      <BuilderDataContext.Provider value={builderData ?? null}>
        {children}
      </BuilderDataContext.Provider>
    </TarkovClientContext.Provider>
  );
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

/**
 * Read the Builder data source from context. Throws if the provider was given none.
 */
export function useBuilderData(): BuilderDataSource {
  const source = useContext(BuilderDataContext);
  if (!source) {
    throw new Error(
      "useBuilderData needs a <TarkovDataProvider builderData={…}>. Pass the Builder data source.",
    );
  }
  return source;
}
