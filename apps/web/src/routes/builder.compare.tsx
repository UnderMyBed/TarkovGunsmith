// apps/web/src/routes/builder.compare.tsx
import { createFileRoute } from "@tanstack/react-router";
import { CompareWorkspace } from "../features/builder/compare/compare-workspace.js";

export const Route = createFileRoute("/builder/compare")({
  component: ComparePage,
});

function ComparePage() {
  return <CompareWorkspace />;
}
