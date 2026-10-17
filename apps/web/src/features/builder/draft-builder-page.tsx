import { useMemo, useState } from "react";
import { loadSavedBuild, useBuilderSnapshot } from "@tarkov/data";
import { Skeleton } from "@tarkov/ui";
import { BuilderPage } from "./builder-page.js";
import { clearDraft, DRAFT_KEY, readDraft } from "./build-draft.js";

/**
 * `/builder` with no build id: the in-progress build, kept in `DRAFT_KEY` so a reload, back
 * navigation or an evicted tab returns to it. A stored draft is read against the game data by
 * `loadSavedBuild`, the same load a shared build takes, so a draft written against older data
 * keeps every part it no longer places, as orphans. "New build" discards it.
 */
export function DraftBuilderPage({ view }: { view?: "editor" | "optimize" }) {
  // Read once per mount and per "New build": the page owns the build from then on.
  const [stored, setStored] = useState(() => readDraft(DRAFT_KEY));
  const [generation, setGeneration] = useState(0);
  const snapshot = useBuilderSnapshot();
  const initialBuild = useMemo(
    () => (stored && snapshot.data ? loadSavedBuild(stored, snapshot.data) : undefined),
    [stored, snapshot.data],
  );

  if (stored && snapshot.isLoading) {
    return (
      <div className="flex flex-col gap-4 p-4" role="status" aria-busy="true">
        <Skeleton width="60%" height="2rem" />
        <Skeleton rows={6} height="2.5rem" />
      </div>
    );
  }

  const newBuild = () => {
    clearDraft(DRAFT_KEY);
    setStored(null);
    setGeneration((g) => g + 1);
  };

  return (
    <BuilderPage
      // Remounted when the draft arrives late (the game data retried after an error), so the
      // page starts from it rather than from the empty build it mounted with.
      key={`${generation}:${initialBuild ? "draft" : "empty"}`}
      initialBuild={initialBuild}
      view={view}
      // A draft that cannot be read against the game data is kept, not overwritten: without the
      // snapshot the page shows the data error and nothing is persisted.
      draftKey={stored && !initialBuild ? undefined : DRAFT_KEY}
      onNewBuild={newBuild}
    />
  );
}
