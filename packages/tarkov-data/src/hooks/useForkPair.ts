import { useMutation } from "@tanstack/react-query";
import type { UseMutationResult } from "@tanstack/react-query";
import { forkPair, type SavePairResponse } from "../pairsApi.js";

export function useForkPair(): UseMutationResult<SavePairResponse, Error, string> {
  return useMutation({
    mutationFn: (pairId: string) => forkPair(fetch, pairId),
  });
}
