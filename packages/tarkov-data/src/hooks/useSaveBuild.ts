import { useMutation } from "@tanstack/react-query";
import type { UseMutationResult } from "@tanstack/react-query";
import { saveBuild, type SaveBuildResponse } from "../buildsApi.js";
import type { Build } from "../build-schema.js";

/**
 * Mutation hook wrapping `saveBuild`. Uses the global `fetch`. Consumers
 * should render a toast on `onSuccess` / `onError`.
 */
export function useSaveBuild(): UseMutationResult<SaveBuildResponse, Error, Build> {
  return useMutation({
    mutationFn: (build: Build) => saveBuild(fetch, build),
  });
}
