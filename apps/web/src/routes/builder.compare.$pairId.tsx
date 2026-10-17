// apps/web/src/routes/builder.compare.$pairId.tsx
import { createFileRoute, Link } from "@tanstack/react-router";
import { useBuilderSnapshot, useLoadPair, LoadPairError } from "@tarkov/data";
import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Skeleton,
} from "@tarkov/ui";
import { CompareWorkspace } from "../features/builder/compare/compare-workspace.js";
import { loadPair } from "../features/builder/compare/known-parts.js";

export const Route = createFileRoute("/builder/compare/$pairId")({
  component: LoadedComparePage,
});

function LoadedComparePage() {
  const { pairId } = Route.useParams();
  const query = useLoadPair(pairId);
  // The pair's parts are resolved against the game data before the workspace takes them as
  // its initial state, so a part that has left the game starts out orphaned.
  const snapshot = useBuilderSnapshot();

  if (query.isLoading || snapshot.isLoading) {
    return (
      <div className="grid grid-cols-2 gap-4 p-4" role="status" aria-busy="true">
        <div className="flex flex-col gap-3">
          <Skeleton width="50%" height="1.75rem" />
          <Skeleton rows={4} height="2rem" />
        </div>
        <div className="flex flex-col gap-3">
          <Skeleton width="50%" height="1.75rem" />
          <Skeleton rows={4} height="2rem" />
        </div>
      </div>
    );
  }

  if (query.error) {
    return <LoadErrorCard error={query.error} id={pairId} onRetry={() => void query.refetch()} />;
  }

  if (!query.data) {
    return (
      <LoadErrorCard
        error={new Error("No data")}
        id={pairId}
        onRetry={() => void query.refetch()}
      />
    );
  }

  if (!snapshot.data) {
    // The pair itself loaded; its sides cannot be read without the game data.
    return (
      <Card>
        <CardHeader>
          <CardTitle>Game data couldn&apos;t be loaded</CardTitle>
          <CardDescription>{snapshot.error?.message ?? "No game data"}</CardDescription>
        </CardHeader>
        <CardContent>
          <Button onClick={() => void snapshot.refetch()} size="sm">
            Try again
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <CompareWorkspace initialPair={loadPair(query.data, snapshot.data)} initialPairId={pairId} />
  );
}

function LoadErrorCard({ error, id, onRetry }: { error: Error; id: string; onRetry: () => void }) {
  const code = error instanceof LoadPairError ? error.code : "unreachable";
  const { title, body } = (() => {
    switch (code) {
      case "invalid-id":
        return {
          title: "Invalid comparison id",
          body: `The id "${id}" doesn't match the comparison-id format.`,
        };
      case "not-found":
        return {
          title: "Comparison not found",
          body: "This comparison doesn't exist. Comparisons saved under the old 30-day policy may have expired; new ones never do.",
        };
      case "invalid-schema":
        return {
          title: "Corrupted comparison",
          body: "The stored comparison failed schema validation.",
        };
      default:
        return {
          title: "Couldn't reach comparison storage",
          body: "The request failed. Check your connection and retry.",
        };
    }
  })();

  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{body}</CardDescription>
      </CardHeader>
      <CardContent className="flex gap-2">
        <Button onClick={onRetry}>Retry</Button>
        <Link to="/builder/compare">
          <Button variant="secondary">Start a new comparison</Button>
        </Link>
      </CardContent>
    </Card>
  );
}
