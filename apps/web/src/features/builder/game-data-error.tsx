import { SnapshotVersionError } from "@tarkov/data";
import { Button, Card, CardContent, CardDescription, CardHeader, CardTitle } from "@tarkov/ui";

/**
 * The game data could not be loaded, so no build can be shown. Mounts no data hooks of its own:
 * a card that did would refetch on mount, fail, and be replaced by the loading state, over and
 * over. Retrying is the reader's call. Data from another deploy cannot be retried into shape,
 * so for it the action reloads the page.
 */
export function GameDataErrorCard({ error, onRetry }: { error: Error; onRetry: () => void }) {
  const stale = error instanceof SnapshotVersionError;
  return (
    <Card>
      <CardHeader>
        <CardTitle>Game data couldn&apos;t be loaded</CardTitle>
        <CardDescription>{error.message}</CardDescription>
      </CardHeader>
      <CardContent>
        {stale ? (
          <Button onClick={() => window.location.reload()} size="sm">
            Reload
          </Button>
        ) : (
          <Button onClick={onRetry} size="sm">
            Try again
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
