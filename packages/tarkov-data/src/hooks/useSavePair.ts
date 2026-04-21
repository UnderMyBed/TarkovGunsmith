import { useMutation } from "@tanstack/react-query";
import type { UseMutationResult } from "@tanstack/react-query";
import { savePair, type SavePairResponse } from "../pairsApi.js";
import type { BuildPair } from "../pair-schema.js";

export function useSavePair(): UseMutationResult<SavePairResponse, Error, BuildPair> {
  return useMutation({
    mutationFn: (pair: BuildPair) => savePair(fetch, pair),
  });
}
