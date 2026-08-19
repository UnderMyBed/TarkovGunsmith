import { useEffect, useState } from "react";
import { useSaveBuild, CURRENT_BUILD_VERSION, type PlayerProfile } from "@tarkov/data";

export interface UseShareBuildArgs {
  /** The weapon id to share, or undefined when no weapon is selected (share is a no-op then). */
  selectedWeaponId: string | undefined;
  attachments: Readonly<Record<string, string>>;
  // Build's `orphaned` field is a mutable `string[]` (the Zod schema doesn't distinguish
  // readonly), so this stays `string[]` rather than `readonly string[]` to keep the payload
  // below assignable without a cast.
  orphaned: string[];
  profile: PlayerProfile;
  embedProfileOnSave: boolean;
  buildName: string;
  buildDescription: string;
}

export interface UseShareBuildResult {
  /** Set for 5s after a successful share; drives the "Build URL copied" toast + BuildHeader's sharedId. */
  shareUrl: string | null;
  share: () => void;
  isSaving: boolean;
  saveFailed: boolean;
}

/**
 * POSTs the current build to the builds-api, copies the resulting share URL to the
 * clipboard, and surfaces it as a toast for 5s. `share()` reads `args` fresh on every call
 * (it's a plain function, not memoized) — same shape as the inline `handleShare` this was
 * extracted from, so no `useCallback` dependency array to keep honest.
 */
export function useShareBuild(args: UseShareBuildArgs): UseShareBuildResult {
  const saveMutation = useSaveBuild();
  const [shareUrl, setShareUrl] = useState<string | null>(null);

  function share() {
    if (!args.selectedWeaponId) return;
    saveMutation.mutate(
      {
        version: CURRENT_BUILD_VERSION,
        weaponId: args.selectedWeaponId,
        attachments: args.attachments,
        orphaned: args.orphaned,
        createdAt: new Date().toISOString(),
        ...(args.embedProfileOnSave ? { profileSnapshot: args.profile } : {}),
        ...(args.buildName.trim().length > 0 ? { name: args.buildName.trim() } : {}),
        ...(args.buildDescription.trim().length > 0
          ? { description: args.buildDescription.trim() }
          : {}),
      },
      {
        onSuccess: (result) => {
          // Build the shareable URL from the SPA origin so it points at the /builder/$id
          // loader route, not the Worker's JSON endpoint.
          const shareableUrl = `${window.location.origin}/builder/${result.id}`;
          void navigator.clipboard.writeText(shareableUrl).catch(() => {
            // Clipboard permission denied — still show the URL so the user can copy manually.
          });
          setShareUrl(shareableUrl);
        },
      },
    );
  }

  useEffect(() => {
    if (!shareUrl) return;
    const id = window.setTimeout(() => setShareUrl(null), 5000);
    return () => window.clearTimeout(id);
  }, [shareUrl]);

  return {
    shareUrl,
    share,
    isSaving: saveMutation.isPending,
    saveFailed: Boolean(saveMutation.error),
  };
}
