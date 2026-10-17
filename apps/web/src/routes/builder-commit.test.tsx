// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type * as BuilderState from "../features/builder/useBuilderState.js";
import { renderRoute } from "../test/render-route.js";
import { pickWeapon } from "../test/pick-weapon.js";

/**
 * Sharing a build, or handing it to Compare, commits it: `BuilderPage` calls the Builder's
 * `commit()` first, which drops a seed still waiting for live prices (its behaviour is
 * `useBuilderState.test.tsx`'s), so the build on screen stays the one handed on. This file
 * checks the page makes those two calls, and makes each before the hand-off reads the build.
 *
 * The real `useBuilderState` runs; only its `commit` is wrapped to record the calls.
 */
const calls: string[] = [];
vi.mock("../features/builder/useBuilderState.js", async (importOriginal) => {
  const actual = await importOriginal<typeof BuilderState>();
  return {
    ...actual,
    useBuilderState: (args: BuilderState.UseBuilderStateArgs) => {
      const state = actual.useBuilderState(args);
      return {
        ...state,
        commit: () => {
          calls.push("commit");
          state.commit();
        },
      };
    },
  };
});

// LL1 gating in progression, as `builder.test.tsx` runs, so the fixture weapon is listed.
beforeEach(() => {
  calls.length = 0;
  localStorage.setItem("tg:builder-mode", "progression");
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  localStorage.clear();
  sessionStorage.clear();
});

async function pickFixtureWeapon(user: ReturnType<typeof userEvent.setup>) {
  await screen.findByText("1 weapons available on your profile");
  await pickWeapon(user);
  await screen.findByText("2 attached", { exact: true });
}

describe("/builder commits the build it hands on", () => {
  it("before sharing it", async () => {
    const user = userEvent.setup();
    Object.defineProperty(window.navigator, "clipboard", {
      value: { writeText: vi.fn().mockResolvedValue(undefined) },
      configurable: true,
    });
    vi.stubGlobal(
      "fetch",
      vi.fn(() => {
        calls.push("POST");
        return Promise.resolve(
          new Response(JSON.stringify({ id: "abcdefgh", url: "ignored" }), {
            status: 201,
            headers: { "Content-Type": "application/json" },
          }),
        );
      }),
    );
    await renderRoute("/builder");
    await pickFixtureWeapon(user);

    await user.click(screen.getByRole("button", { name: "Share build" }));
    expect(await screen.findByRole("status")).toHaveTextContent("Build URL copied");
    expect(calls).toEqual(["commit", "POST"]);
  });

  it("before handing it to Compare", async () => {
    const user = userEvent.setup();
    const { router } = await renderRoute("/builder");
    await pickFixtureWeapon(user);

    await user.click(screen.getByRole("button", { name: "Compare" }));
    expect(calls).toEqual([]);
    const dialog = screen.getByRole("dialog", { name: "Compare this build" });
    await user.click(within(dialog).getByRole("button", { name: "Compare" }));

    await waitFor(() => expect(router.state.location.pathname).toBe("/builder/compare"));
    expect(calls).toEqual(["commit"]);
  });
});
