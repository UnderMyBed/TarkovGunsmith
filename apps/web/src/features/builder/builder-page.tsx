// apps/web/src/features/builder/builder-page.tsx
import { useNavigate } from "@tanstack/react-router";
import type React from "react";
import { useProfile, useTasks, type PlayerProfile } from "@tarkov/data";
import { useTarkovTrackerSync } from "./useTarkovTrackerSync.js";
import { Button, Card, CardContent } from "@tarkov/ui";
import { adaptWeapon } from "../data-adapters/adapters.js";
import { ProfileEditor } from "./profile-editor.js";
import { BuildHeader } from "./build-header.js";
import { PresetPicker } from "./preset-picker.js";
import { CompareFromBuildDialog } from "./compare/compare-from-build-dialog.js";
import { OptimizeView } from "./optimize/optimize-view.js";
import { useSaveMetadata } from "./useSaveMetadata.js";
import { useBuilderState } from "./useBuilderState.js";
import { useShareBuild } from "./useShareBuild.js";
import { useCompareHandoff } from "./useCompareHandoff.js";
import { UpstreamDriftBanner } from "./upstream-drift-banner.js";
import { SnapshotBanner } from "./snapshot-banner.js";
import { WeaponPanel } from "./weapon-panel.js";
import { ModsPanel } from "./mods-panel.js";
import { SpecPanel } from "./spec-panel.js";

export interface BuilderPageProps {
  initialWeaponId?: string;
  /** v1 hydration — flat list of mod ids. Will be migrated once the weapon tree loads. */
  initialModIds?: string[];
  /** v2 hydration — slot → item id map. */
  initialAttachments?: Record<string, string>;
  /** v2 hydration — unplaceable mods from an earlier v1 migration. */
  initialOrphaned?: string[];
  /** v3 hydration — profile snapshot embedded in the shared build. */
  initialProfileSnapshot?: PlayerProfile;
  /** v4 hydration — optional build name. */
  initialName?: string;
  /** v4 hydration — optional build description. */
  initialDescription?: string;
  notice?: React.ReactNode;
  view?: "editor" | "optimize";
}

/**
 * The `/builder` page. Composition only — the actual "what is this build" state lives in
 * `useBuilderState`, save metadata in `useSaveMetadata`, the share flow in `useShareBuild`,
 * and the compare handoff in `useCompareHandoff` (all in `features/builder/`). This function
 * used to hold all of that directly (12 `useState`, ~45 hook calls in one body) — see
 * docs/plans/2026-08-19-pre-refactor-hardening-plan.md, Stage 5.1, for why it was split.
 *
 * Lives here rather than in `routes/builder.tsx` (its only caller used to be that route's
 * own `component`) because `routes/builder.$id.tsx` also renders it directly, as a plain
 * function import rather than through the router. TanStack Router's `autoCodeSplitting`
 * (see `vite.config.ts`) can only split a route file's `component` into its own lazy chunk
 * when nothing else statically imports that identifier from the same module — with
 * `BuilderPage` previously defined *in* `routes/builder.tsx` and separately re-exported for
 * `builder.$id.tsx` to import, the splitter had to keep the whole implementation (this
 * component, its panels, `orphaned-banner`, `data-adapters`, …) in the eagerly-loaded entry
 * chunk for every route, including ones with nothing to do with the Builder — see Stage 5.3
 * of the plan doc for the measured before/after. Moving it to a plain feature module lets
 * both route files import it as a normal (non-route) dependency, which the splitter treats
 * like any other lazy-chunk-eligible import.
 */
export function BuilderPage({
  initialWeaponId = "",
  initialModIds,
  initialAttachments,
  initialOrphaned,
  initialProfileSnapshot,
  initialName,
  initialDescription,
  notice,
  view = "editor",
}: BuilderPageProps = {}) {
  const navigate = useNavigate();

  const [profile, setProfile] = useProfile();
  const tasks = useTasks();
  const sync = useTarkovTrackerSync({ profile, onChange: setProfile, tasks: tasks.data });

  const saveMeta = useSaveMetadata(initialName, initialDescription);

  const builder = useBuilderState({
    initialWeaponId,
    initialModIds,
    initialAttachments,
    initialOrphaned,
    profile,
    buildName: saveMeta.buildName,
    buildDescription: saveMeta.buildDescription,
    embedProfileOnSave: saveMeta.embedProfileOnSave,
  });

  const shareBuild = useShareBuild({
    selectedWeaponId: builder.selectedWeapon?.id,
    attachments: builder.attachments,
    orphaned: builder.orphaned,
    profile,
    embedProfileOnSave: saveMeta.embedProfileOnSave,
    buildName: saveMeta.buildName,
    buildDescription: saveMeta.buildDescription,
  });

  const compareHandoff = useCompareHandoff({
    weaponId: builder.weaponId,
    attachments: builder.attachments,
    orphaned: builder.orphaned,
    profile,
    embedProfileOnSave: saveMeta.embedProfileOnSave,
    buildName: saveMeta.buildName,
    buildDescription: saveMeta.buildDescription,
  });

  const handleOpenOptimizer = () =>
    void navigate({ to: ".", search: (s) => ({ ...s, view: "optimize" as const }) });
  const handleExitOptimizer = () =>
    void navigate({ to: ".", search: (s) => ({ ...s, view: "editor" as const }) });
  const handleEditProfile = () => {
    handleExitOptimizer();
    requestAnimationFrame(() => {
      document
        .querySelector("[data-profile-editor]")
        ?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  };

  return (
    <div className="flex flex-col gap-6">
      <BuildHeader
        name={saveMeta.buildName}
        description={saveMeta.buildDescription}
        onNameChange={saveMeta.setBuildName}
        onDescriptionChange={saveMeta.setBuildDescription}
        currentSpec={builder.spec}
        stockSpec={builder.stockSpec}
        weaponName={builder.selectedWeapon?.shortName ?? builder.selectedWeapon?.name ?? null}
        weaponId={builder.weaponId || null}
        modCount={Object.keys(builder.attachments).length}
        sharedId={shareBuild.shareUrl?.split("/").pop() ?? null}
        onCompare={builder.selectedWeapon ? compareHandoff.open : undefined}
        onOptimize={builder.selectedWeapon ? handleOpenOptimizer : undefined}
      />
      <CompareFromBuildDialog
        open={compareHandoff.isOpen}
        onClose={compareHandoff.close}
        onConfirm={compareHandoff.confirm}
      />

      {view === "editor" ? (
        <>
          {notice}
          {builder.upstreamDriftInfo && <UpstreamDriftBanner {...builder.upstreamDriftInfo} />}

          <SnapshotBanner snapshot={initialProfileSnapshot} onUseSnapshot={setProfile} />

          <div data-profile-editor>
            <ProfileEditor profile={profile} onChange={setProfile} sync={sync} />
          </div>

          {builder.error && (
            <Card>
              <CardContent className="pt-6">
                <p className="text-[var(--color-destructive)]">
                  Failed to load data: {builder.error.message}
                </p>
              </CardContent>
            </Card>
          )}

          <WeaponPanel
            isLoading={builder.isLoading}
            weaponOptions={builder.weaponOptions}
            weaponId={builder.weaponId}
            onWeaponChange={builder.handleWeaponChange}
            showAllWeapons={builder.showAllWeapons}
            onShowAllWeaponsChange={builder.setShowAllWeapons}
            hasSelectedWeapon={Boolean(builder.selectedWeapon)}
            onShare={shareBuild.share}
            isSaving={shareBuild.isSaving}
            saveFailed={shareBuild.saveFailed}
            embedProfileOnSave={saveMeta.embedProfileOnSave}
            onEmbedProfileOnSaveChange={saveMeta.setEmbedProfileOnSave}
          />

          {builder.selectedWeapon && (
            <PresetPicker weaponId={builder.selectedWeapon.id} onApply={builder.applyPreset} />
          )}

          {builder.selectedWeapon && (
            <>
              <ModsPanel
                tree={builder.tree}
                attachments={builder.attachments}
                onAttach={builder.handleAttach}
                getAvailability={(id) => builder.availabilityById.get(id) ?? null}
                getModSources={(id) =>
                  builder.modSourcesById.get(id) ?? { hasCraft: false, hasBarter: false }
                }
                orphaned={builder.orphaned}
                modNames={builder.modNamesById}
                onDismissOrphaned={builder.clearOrphaned}
              />

              {builder.spec && (
                <SpecPanel weaponShortName={builder.selectedWeapon.shortName} spec={builder.spec} />
              )}
            </>
          )}
        </>
      ) : builder.selectedWeapon && builder.tree.data && builder.spec ? (
        <OptimizeView
          weapon={adaptWeapon(builder.selectedWeapon)}
          slotTree={builder.tree.data}
          modList={builder.modList}
          profile={profile}
          sync={sync}
          currentAttachments={builder.attachments}
          currentBuild={builder.currentBuild}
          currentStats={builder.spec}
          currentPrice={builder.currentPrice}
          onAccept={(build) => {
            builder.acceptOptimized(build.attachments, build.orphaned);
            handleExitOptimizer();
          }}
          onExit={handleExitOptimizer}
          onEditProfile={handleEditProfile}
        />
      ) : (
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm">Pick a weapon in the editor before running the optimizer.</p>
            <Button className="mt-3" size="sm" onClick={handleExitOptimizer}>
              ← Back to editor
            </Button>
          </CardContent>
        </Card>
      )}

      {shareBuild.shareUrl && (
        <div
          role="status"
          className="fixed bottom-6 right-6 z-50 rounded-[var(--radius)] border bg-[var(--color-card)] p-4 shadow-lg"
        >
          <div className="text-sm font-medium">Build URL copied</div>
          <code className="mt-1 block max-w-xs truncate text-xs text-[var(--color-muted-foreground)]">
            {shareBuild.shareUrl}
          </code>
        </div>
      )}
    </div>
  );
}
