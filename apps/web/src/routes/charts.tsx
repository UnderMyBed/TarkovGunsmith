import { createFileRoute } from "@tanstack/react-router";
import { redirectToBuilder } from "./-redirect-to-builder.js";

// Parked: the page lives in src/features/ and is not routed. See -redirect-to-builder.ts.
export const Route = createFileRoute("/charts")({
  beforeLoad: redirectToBuilder,
});
