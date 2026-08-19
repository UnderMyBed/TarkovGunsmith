import { useState } from "react";

export interface UseSaveMetadataResult {
  buildName: string;
  setBuildName: (name: string) => void;
  buildDescription: string;
  setBuildDescription: (description: string) => void;
  /** Whether the viewer's current progression snapshot is embedded in the next share/compare. */
  embedProfileOnSave: boolean;
  setEmbedProfileOnSave: (embed: boolean) => void;
}

/**
 * Save-time metadata for a build: the optional name/description shown on `BuildHeader` and
 * persisted into a shared build, plus whether the current profile snapshot rides along.
 * Grouped into one hook because all three are edited independently (three separate inputs)
 * but always read together — `useShareBuild`'s POST payload, `useCompareHandoff`'s left-side
 * prefill, and `useBuilderState`'s `currentBuild` snapshot each spread all three into the
 * same object shape.
 */
export function useSaveMetadata(
  initialName: string | undefined,
  initialDescription: string | undefined,
): UseSaveMetadataResult {
  const [buildName, setBuildName] = useState<string>(initialName ?? "");
  const [buildDescription, setBuildDescription] = useState<string>(initialDescription ?? "");
  const [embedProfileOnSave, setEmbedProfileOnSave] = useState(false);

  return {
    buildName,
    setBuildName,
    buildDescription,
    setBuildDescription,
    embedProfileOnSave,
    setEmbedProfileOnSave,
  };
}
