import { useMutation } from "@tanstack/react-query";
import type { UseMutationResult } from "@tanstack/react-query";
import { saveBuild, type SaveBuildResponse } from "../buildsApi.js";
import type { BuildV1 } from "../build-schema.js";

/**
 * Mutation hook wrapping `saveBuild`. Uses the global `fetch`. Consumers
 * should render a toast on `onSuccess` / `onError`.
 */
export function useSaveBuild(): UseMutationResult<SaveBuildResponse, Error, BuildV1> {
  return useMutation({
    mutationFn: (build: BuildV1) => saveBuild(fetch, build),
  });
}
