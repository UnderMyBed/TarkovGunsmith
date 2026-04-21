// apps/web/src/routes/builder.compare.$pairId.tsx
import { createFileRoute, Link } from "@tanstack/react-router";
import { useLoadPair, LoadPairError } from "@tarkov/data";
import { Button, Card, CardContent, CardDescription, CardHeader, CardTitle } from "@tarkov/ui";
import { CompareWorkspace } from "../features/builder/compare/compare-workspace.js";

export const Route = createFileRoute("/builder/compare/$pairId")({
  component: LoadedComparePage,
});

function LoadedComparePage() {
  const { pairId } = Route.useParams();
  const query = useLoadPair(pairId);

  if (query.isLoading) {
    return (
      <Card>
        <CardContent className="pt-6">Loading comparison…</CardContent>
      </Card>
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

  return <CompareWorkspace initialPair={query.data} initialPairId={pairId} />;
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
          body: "This comparison has expired (30-day lifetime) or never existed.",
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
