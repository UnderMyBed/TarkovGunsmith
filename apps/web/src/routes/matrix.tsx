import { createFileRoute } from "@tanstack/react-router";
import { redirectToBuilder } from "./-redirect-to-builder.js";

// Restoring /matrix must also restore its single-layer caveat e2e test (smoke.spec.ts
// "matrix accuracy disclosure"), required by docs/adr/0003-model-armor-plates.md until
// plate modelling ships. The caveat component is features/matrix/single-layer-caveat.tsx.
// Parked: the page lives in src/features/ and is not routed. See -redirect-to-builder.ts.
export const Route = createFileRoute("/matrix")({
  beforeLoad: redirectToBuilder,
});
