import { useQuery } from "@tanstack/react-query";
import type { UseQueryResult } from "@tanstack/react-query";
import { loadBuild } from "../buildsApi.js";
import type { Build } from "../build-schema.js";

/**
 * Reactive build-load by id. Cached by TanStack Query under `["build", id]`.
 * Disabled when `id` is empty. Errors (including `LoadBuildError`) are
 * surfaced on the returned `error` field — the UI branches on
 * `error.code` to render the right empty state.
 */
export function useLoadBuild(id: string): UseQueryResult<Build, Error> {
  return useQuery({
    queryKey: ["build", id],
    queryFn: () => loadBuild(fetch, id),
    enabled: id.length > 0,
    retry: false,
  });
}
