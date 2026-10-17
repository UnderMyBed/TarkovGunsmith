import { useQuery } from "@tanstack/react-query";
import type { UseQueryResult } from "@tanstack/react-query";
import type { BuilderSnapshot } from "../snapshot/types.js";
import { useBuilderData } from "../provider.js";

/**
 * The Builder snapshot itself, for what the narrower hooks do not carry: its `dataAsOf`, and
 * resolving a shared build's ids against it. Never stale within a page — a new snapshot only
 * ships with a new deploy. Cached under `["builderSnapshot"]`.
 */
export function useBuilderSnapshot(): UseQueryResult<BuilderSnapshot, Error> {
  const source = useBuilderData();
  return useQuery({
    queryKey: ["builderSnapshot"],
    queryFn: () => source.snapshot(),
    staleTime: Infinity,
    structuralSharing: false,
  });
}
