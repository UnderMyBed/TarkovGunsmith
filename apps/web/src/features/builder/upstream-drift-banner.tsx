import { Card, CardContent } from "@tarkov/ui";

export interface UpstreamDriftBannerProps {
  /** True when the loaded build's weapon id no longer exists in current game data. */
  missingWeapon: boolean;
  /** Count of attached/legacy mod ids that no longer exist in current game data. */
  missingModCount: number;
}

/**
 * Shown when a build loaded from a shared URL references a weapon or mod id that has since
 * disappeared from the upstream JSON API document (see ADR-0002 — the document has already
 * changed shape once). Only meaningful for loaded builds; a fresh build can't drift because
 * it's built from whatever data is currently loaded.
 */
export function UpstreamDriftBanner({ missingWeapon, missingModCount }: UpstreamDriftBannerProps) {
  return (
    <Card>
      <CardContent className="pt-6">
        <p className="text-sm text-[var(--color-destructive)]">
          Some items in this build are no longer in the current game data.
          {missingWeapon && " The original weapon is missing."}
          {missingModCount > 0 &&
            ` ${missingModCount} mod${missingModCount === 1 ? "" : "s"} couldn't be resolved.`}{" "}
          Viewing what still exists.
        </p>
      </CardContent>
    </Card>
  );
}
