import { createFileRoute, Outlet, useMatchRoute, useNavigate } from "@tanstack/react-router";
import { z } from "zod";
import type React from "react";
import { useProfile, useTasks, type PlayerProfile } from "@tarkov/data";
import { useTarkovTrackerSync } from "../features/builder/useTarkovTrackerSync.js";
import { Button, Card, CardContent } from "@tarkov/ui";
import { adaptWeapon } from "../features/data-adapters/adapters.js";
import { ProfileEditor } from "../features/builder/profile-editor.js";
import { BuildHeader } from "../features/builder/build-header.js";
import { PresetPicker } from "../features/builder/preset-picker.js";
import { CompareFromBuildDialog } from "../features/builder/compare/compare-from-build-dialog.js";
import { OptimizeView } from "../features/builder/optimize/optimize-view.js";
import { useSaveMetadata } from "../features/builder/useSaveMetadata.js";
import { useBuilderState } from "../features/builder/useBuilderState.js";
import { useShareBuild } from "../features/builder/useShareBuild.js";
import { useCompareHandoff } from "../features/builder/useCompareHandoff.js";
import { UpstreamDriftBanner } from "../features/builder/upstream-drift-banner.js";
import { SnapshotBanner } from "../features/builder/snapshot-banner.js";
import { WeaponPanel } from "../features/builder/weapon-panel.js";
import { ModsPanel } from "../features/builder/mods-panel.js";
import { SpecPanel } from "../features/builder/spec-panel.js";

const builderSearchSchema = z.object({
  view: z.enum(["editor", "optimize"]).optional(),
});

export const Route = createFileRoute("/builder")({
  component: BuilderRouteLayout,
  validateSearch: (s) => builderSearchSchema.parse(s),
});

/**
 * Layout wrapper for the `/builder` route tree.
 *
 * Child routes (`/builder/$id`, `/builder/compare`, `/builder/compare/$pairId`)
 * are nested under this file in TanStack's file-based routing tree, so the
 * parent must render an `<Outlet />` for them to mount. For the bare
 * `/builder` URL there is no matching child and we render the page itself.
 */
function BuilderRouteLayout() {
  const matchRoute = useMatchRoute();
  // `fuzzy: false` → only true when the current location is exactly `/builder`
  // with no child segments. Any deeper URL falls through to the `<Outlet />`.
  const isExactBuilder = matchRoute({ to: "/builder" });
  const search = Route.useSearch();
  return isExactBuilder ? <BuilderPage view={search.view} /> : <Outlet />;
}

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
