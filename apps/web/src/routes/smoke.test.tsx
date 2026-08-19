// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, it, expect } from "vitest";
import { cleanup, screen } from "@testing-library/react";
import { renderRoute } from "../test/render-route.js";
import { createTestClient } from "../test/test-client.js";

afterEach(() => cleanup());

describe("/smoke", () => {
  it("loads the fixture ammo list and lists each entry", async () => {
    await renderRoute("/smoke");

    // "Loaded " / <strong>2</strong> / " ammo entries from " / <code>api.tarkov.dev</code> / "."
    // is split across inline nodes, so match the whole paragraph rather than one exact string.
    const paragraph = await screen.findByText((_content, node) => {
      if (node?.tagName.toLowerCase() !== "p") return false;
      return (node.textContent ?? "").includes("Loaded 2 ammo entries from api.tarkov.dev.");
    });
    expect(paragraph).toBeInTheDocument();

    expect(screen.getByText("5.56x45mm M855")).toBeInTheDocument();
    expect(screen.getByText("5.56x45mm M995")).toBeInTheDocument();
    expect(screen.getByText(/pen 31 · dmg 63/)).toBeInTheDocument();
  });

  it("shows the error block when the items resource fails to load", async () => {
    await renderRoute("/smoke", { client: createTestClient({ errorResources: ["items"] }) });

    expect(await screen.findByText(/^Error:/)).toBeInTheDocument();
  });
});
