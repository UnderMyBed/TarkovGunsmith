import { useEffect, useState } from "react";
import { useSaveBuild, ORPHANED_CAP, type BuildV6 } from "@tarkov/data";

/** Why a build cannot be shared as it stands, or `null` when it can. */
export function shareBlockedReason(build: Pick<BuildV6, "orphaned">): string | null {
  return build.orphaned.length > ORPHANED_CAP ? "Dismiss orphaned parts to share this build" : null;
}

export interface UseShareBuildArgs {
  /** The build to share (`toBuildPayload`), or `null` when no weapon is selected. */
  build: BuildV6 | null;
}

export interface UseShareBuildResult {
  /** Set for 5s after a successful share; drives the "Build URL copied" toast and the workbench bar's "Shared" stamp. */
  shareUrl: string | null;
  share: () => void;
  isSaving: boolean;
  saveFailed: boolean;
  /** Why sharing is refused right now ({@link shareBlockedReason}), or `null`. */
  blocked: string | null;
}

/**
 * POSTs the current build to the builds-api, copies the resulting share URL to the
 * clipboard, and surfaces it as a toast for 5s. `share()` reads `args` fresh on every call
 * (it's a plain function, not memoized), and stamps the build with the time it is shared.
 *
 * A build holding more orphaned ids than a saved build may carry is not sent: the orphans are
 * the saved build's own data, so the user dismisses them rather than the share dropping some.
 */
export function useShareBuild(args: UseShareBuildArgs): UseShareBuildResult {
  const saveMutation = useSaveBuild();
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const blocked = args.build === null ? null : shareBlockedReason(args.build);

  function share() {
    if (args.build === null || blocked !== null) return;
    saveMutation.mutate(
      { ...args.build, createdAt: new Date().toISOString() },
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
    blocked,
  };
}
