import { Card, CardContent } from "@tarkov/ui";

export interface UpstreamDriftBannerProps {
  /** True when the loaded build's weapon id no longer exists in current game data. */
  missingWeapon: true;
}

/**
 * Shown when a build loaded from a shared URL names a weapon that has since left the game
 * data. Parts that have gone are listed by the orphan banner instead, which keeps them on the
 * build. Only meaningful for loaded builds; a fresh build is made from the data on hand.
 */
export function UpstreamDriftBanner(_props: UpstreamDriftBannerProps) {
  return (
    <Card>
      <CardContent className="pt-6">
        <p className="text-sm text-[var(--color-destructive)]">
          This build&apos;s weapon is no longer in the current game data. Pick a weapon to keep
          building.
        </p>
      </CardContent>
    </Card>
  );
}
