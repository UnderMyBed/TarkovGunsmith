// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, it, expect, vi } from "vitest";
import { cleanup, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderRoute } from "../../../test/render-route.js";

/**
 * The save path on `/builder/compare`, driven through the REAL route tree, the real
 * `useSavePair` mutation and the real `pairsApi` client — only `globalThis.fetch` is
 * stubbed, the same seam `builder.compare.$pairId.test.tsx` uses. Two regressions live
 * here:
 *
 * 1. A failed save produced no toast, no message and no state change — `save.mutate` was
 *    called with an `onSuccess` and nothing else, and the toolbar had no `isPending` /
 *    `error` prop to render with. The button simply did nothing.
 * 2. Issue #163 — after a successful save the toolbar kept reading "Save comparison" even
 *    though the URL already carried the new pair id, offering a button that would POST a
 *    duplicate pair.
 */

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const NEW_ID = "abcd2345";

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

/** POST /api/pairs → `status`; GET /api/pairs/:id → an empty saved pair. */
function stubPairsFetch(post: () => Promise<Response>) {
  const mock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    const url = input instanceof URL ? input.href : typeof input === "string" ? input : input.url;
    if (init?.method === "POST") return post();
    if (url.includes("/api/pairs/")) {
      return Promise.resolve(
        jsonResponse({ v: 1, createdAt: new Date().toISOString(), left: null, right: null }, 200),
      );
    }
    return Promise.reject(new Error(`unexpected fetch: ${url}`));
  });
  vi.stubGlobal("fetch", mock);
  return mock;
}

async function clickSave() {
  const button = await screen.findByRole("button", { name: "Save comparison" });
  await userEvent.setup().click(button);
  return button;
}

describe("compare save — failures are visible", () => {
  it("names the daily write limit on a 429 instead of doing nothing", async () => {
    stubPairsFetch(() => Promise.resolve(new Response("Rate limited", { status: 429 })));
    await renderRoute("/builder/compare");
    await clickSave();

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(/save limit reached for today/i);
    expect(alert).toHaveTextContent(/00:00 UTC/);
  });

  it("tells the user to shrink the comparison on a 413", async () => {
    stubPairsFetch(() => Promise.resolve(new Response("Payload too large", { status: 413 })));
    await renderRoute("/builder/compare");
    await clickSave();

    expect(await screen.findByRole("alert")).toHaveTextContent(/too big to store/i);
  });

  it("points at the connection when the request never reaches storage", async () => {
    stubPairsFetch(() => Promise.reject(new TypeError("Failed to fetch")));
    await renderRoute("/builder/compare");
    await clickSave();

    expect(await screen.findByRole("alert")).toHaveTextContent(/can't reach comparison storage/i);
  });

  it("stays on the draft after a failed save — nothing is lost and no id is invented", async () => {
    stubPairsFetch(() => Promise.resolve(new Response("Bad request", { status: 400 })));
    const { router } = await renderRoute("/builder/compare");
    await clickSave();

    await screen.findByRole("alert");
    expect(router.state.location.pathname).toBe("/builder/compare");
    // Still the pairId-less toolbar: no "Save as new", and the label hasn't flipped.
    expect(screen.getByRole("button", { name: "Save comparison" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Save as new" })).not.toBeInTheDocument();
  });

  it("disables the save button while the POST is in flight", async () => {
    // A never-settling POST holds the mutation pending so the disabled state is observable.
    stubPairsFetch(() => new Promise<Response>(() => {}));
    await renderRoute("/builder/compare");
    const button = await clickSave();

    await waitFor(() => expect(button).toBeDisabled());
    expect(button).toHaveTextContent("Saving…");
  });
});

describe("compare save — issue #163", () => {
  it("flips the toolbar to Save changes as soon as the pair has an id", async () => {
    const fetchMock = stubPairsFetch(() =>
      Promise.resolve(jsonResponse({ id: NEW_ID, url: `/builder/compare/${NEW_ID}` }, 201)),
    );
    const { router } = await renderRoute("/builder/compare");
    await clickSave();

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    await waitFor(() => expect(router.state.location.pathname).toBe(`/builder/compare/${NEW_ID}`));

    expect(await screen.findByRole("button", { name: "Save changes" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Save comparison" })).not.toBeInTheDocument();
    // "Save as new" is the only way to branch off a stored pair, so it has to be reachable
    // the moment one exists.
    expect(screen.getByRole("button", { name: "Save as new" })).toBeInTheDocument();
  });
});

/**
 * A progression handoff from the Builder (#258) puts the viewer's profile on both sides.
 * Saving publishes it only when the user opts in, as a Builder share does.
 */
describe("compare handoff profile, and saving it", () => {
  // The route fixtures' one weapon (`src/test/fixtures.ts`).
  const M4A1 = "w-m4a1";
  const PROFILE = {
    mode: "basic",
    traders: {
      prapor: 4,
      therapist: 4,
      skier: 4,
      peacekeeper: 4,
      mechanic: 4,
      ragman: 4,
      jaeger: 4,
    },
    flea: true,
    level: 40,
  };

  function handOff(profile: string | null) {
    sessionStorage.setItem(
      "compare:leftPrefill",
      JSON.stringify({
        version: 6,
        weaponId: M4A1,
        attachments: {},
        orphaned: [],
        createdAt: "2026-10-16T00:00:00.000Z",
      }),
    );
    sessionStorage.setItem("compare:mode", "clone-both");
    if (profile !== null) sessionStorage.setItem("compare:profile", profile);
  }

  afterEach(() => sessionStorage.clear());

  /** The pair the last POST sent. */
  function postedPair(fetchMock: ReturnType<typeof stubPairsFetch>): Record<string, unknown> {
    const post = fetchMock.mock.calls.filter(([, init]) => init?.method === "POST").at(-1);
    const body = post?.[1]?.body;
    if (typeof body !== "string") throw new Error("no JSON POST body was sent");
    return JSON.parse(body) as Record<string, unknown>;
  }

  it("gates both sides under the handed-off profile", async () => {
    stubPairsFetch(() => new Promise<Response>(() => {}));
    handOff(JSON.stringify(PROFILE));
    await renderRoute("/builder/compare");
    expect(await screen.findAllByText("Reachable")).toHaveLength(2);
  });

  it("keeps a handoff with no profile, as one written before the key existed, theorycraft", async () => {
    stubPairsFetch(() => new Promise<Response>(() => {}));
    handOff(null);
    await renderRoute("/builder/compare");
    await waitFor(() => expect(screen.getAllByText(/^₽/)).toHaveLength(2));
    expect(screen.queryByText("Reachable")).not.toBeInTheDocument();
    expect(
      screen.queryByLabelText("Embed the progression snapshots in the shared URL"),
    ).not.toBeInTheDocument();
  });

  it("drops a handoff whose profile does not parse", async () => {
    stubPairsFetch(() => new Promise<Response>(() => {}));
    handOff(JSON.stringify({ mode: "basic" }));
    await renderRoute("/builder/compare");
    expect(await screen.findAllByText("empty")).toHaveLength(2);
    expect(sessionStorage.getItem("compare:profile")).toBeNull();
  });

  it("saves no profile unless the user opts in", async () => {
    const fetchMock = stubPairsFetch(() =>
      Promise.resolve(jsonResponse({ id: NEW_ID, url: `/builder/compare/${NEW_ID}` }, 201)),
    );
    handOff(JSON.stringify(PROFILE));
    await renderRoute("/builder/compare");
    const optIn = await screen.findByLabelText("Embed the progression snapshots in the shared URL");
    expect(optIn).not.toBeChecked();
    await clickSave();

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const pair = postedPair(fetchMock);
    expect(pair).not.toHaveProperty("leftProfile");
    expect(pair).not.toHaveProperty("rightProfile");
  });

  it("saves both sides' profiles once the user opts in", async () => {
    const fetchMock = stubPairsFetch(() =>
      Promise.resolve(jsonResponse({ id: NEW_ID, url: `/builder/compare/${NEW_ID}` }, 201)),
    );
    handOff(JSON.stringify(PROFILE));
    await renderRoute("/builder/compare");
    const optIn = await screen.findByLabelText("Embed the progression snapshots in the shared URL");
    await userEvent.setup().click(optIn);
    await clickSave();

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const pair = postedPair(fetchMock);
    expect(pair.leftProfile).toEqual(PROFILE);
    expect(pair.rightProfile).toEqual(PROFILE);
  });
});

/**
 * Saving a loaded pair, and what a save leaves on screen. A stub pair store: GET serves the
 * stored pairs, POST /api/pairs stores the body under a new id, POST …/fork copies one.
 */
describe("compare save — loaded pairs and the viewer's profiles", () => {
  const STORED = "stra2345";
  const PROFILE = {
    mode: "basic",
    traders: {
      prapor: 4,
      therapist: 4,
      skier: 4,
      peacekeeper: 4,
      mechanic: 4,
      ragman: 4,
      jaeger: 4,
    },
    flea: true,
    level: 40,
  };
  // The sides differ by an orphan, which a load keeps as it is.
  const side = (orphaned: string[]) => ({
    version: 6,
    weaponId: "w-m4a1",
    attachments: {},
    orphaned,
    createdAt: "2026-10-16T00:00:00.000Z",
  });
  const LEFT = side([]);
  const RIGHT = side(["gone-part"]);

  afterEach(() => sessionStorage.clear());

  /** The stub store; `posts` lists every POST as [url, parsed body or null]. */
  function stubStore(initial: Record<string, unknown>) {
    const pairs = new Map(Object.entries(initial));
    const posts: [string, Record<string, unknown> | null][] = [];
    let n = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
        const url =
          input instanceof URL ? input.href : typeof input === "string" ? input : input.url;
        if (init?.method === "POST") {
          const body =
            typeof init.body === "string"
              ? (JSON.parse(init.body) as Record<string, unknown>)
              : null;
          posts.push([url, body]);
          const id = `neww${++n + 2}aaa`;
          const fork = /\/api\/pairs\/([a-z0-9]+)\/fork$/.exec(url);
          pairs.set(id, fork ? pairs.get(fork[1]!) : body);
          return Promise.resolve(jsonResponse({ id, url: `/builder/compare/${id}` }, 201));
        }
        const got = /\/api\/pairs\/([a-z0-9]+)$/.exec(url);
        if (got && pairs.has(got[1]!))
          return Promise.resolve(jsonResponse(pairs.get(got[1]!), 200));
        return Promise.reject(new Error(`unexpected fetch: ${url}`));
      }),
    );
    return posts;
  }

  const stored = (profiles: boolean) => ({
    [STORED]: {
      v: 1,
      createdAt: "2026-10-16T00:00:00.000Z",
      left: LEFT,
      right: RIGHT,
      ...(profiles ? { leftProfile: PROFILE, rightProfile: PROFILE } : {}),
    },
  });
  const optIn = () => screen.findByLabelText("Embed the progression snapshots in the shared URL");
  const user = () => userEvent.setup();

  it("starts a pair that publishes profiles with the box ticked, and Save changes keeps them", async () => {
    const posts = stubStore(stored(true));
    await renderRoute(`/builder/compare/${STORED}`);
    expect(await optIn()).toBeChecked();
    await user().click(screen.getByRole("button", { name: "Swap L↔R" }));
    await user().click(screen.getByRole("button", { name: "Save changes" }));

    await waitFor(() => expect(posts).toHaveLength(1));
    expect(posts[0]![1]).toMatchObject({ leftProfile: PROFILE, rightProfile: PROFILE });
  });

  it("saves as new through the draft once the box is unticked, so no profile is posted", async () => {
    const posts = stubStore(stored(true));
    await renderRoute(`/builder/compare/${STORED}`);
    await user().click(await optIn());
    await user().click(screen.getByRole("button", { name: "Save as new" }));

    await waitFor(() => expect(posts).toHaveLength(1));
    const [url, body] = posts[0]!;
    expect(url).not.toMatch(/\/fork$/);
    expect(body).not.toHaveProperty("leftProfile");
    expect(body).not.toHaveProperty("rightProfile");
  });

  it("saves as new with an unsaved edit kept, and forks only a pair with none", async () => {
    const posts = stubStore(stored(false));
    const { router } = await renderRoute(`/builder/compare/${STORED}`);
    await screen.findByRole("button", { name: "Save as new" });
    await user().click(screen.getByRole("button", { name: "Swap L↔R" }));
    await user().click(screen.getByRole("button", { name: "Save as new" }));

    await waitFor(() => expect(posts).toHaveLength(1));
    expect(posts[0]![0]).not.toMatch(/\/fork$/);
    expect(posts[0]![1]).toMatchObject({ left: RIGHT, right: LEFT });

    // On the new pair, with nothing unsaved, "Save as new" is a fork.
    await waitFor(() =>
      expect(router.state.location.pathname).not.toBe(`/builder/compare/${STORED}`),
    );
    await user().click(await screen.findByRole("button", { name: "Save as new" }));
    await waitFor(() => expect(posts).toHaveLength(2));
    expect(posts[1]![0]).toMatch(/\/fork$/);
  });

  it("after a progression handoff and a save without the box, still shows the gated view", async () => {
    const posts = stubStore({});
    sessionStorage.setItem("compare:leftPrefill", JSON.stringify(LEFT));
    sessionStorage.setItem("compare:mode", "clone-both");
    sessionStorage.setItem("compare:profile", JSON.stringify(PROFILE));
    const { router } = await renderRoute("/builder/compare");
    expect(await screen.findAllByText("Reachable")).toHaveLength(2);
    await clickSave();

    await waitFor(() => expect(posts).toHaveLength(1));
    expect(posts[0]![1]).not.toHaveProperty("leftProfile");
    expect(posts[0]![1]).not.toHaveProperty("rightProfile");

    // The saved pair's own route: the viewer's profiles carried over, never published.
    await waitFor(() =>
      expect(router.state.location.pathname).toMatch(/^\/builder\/compare\/neww/),
    );
    expect(await screen.findByRole("button", { name: "Save changes" })).toBeInTheDocument();
    expect(await screen.findAllByText("Reachable")).toHaveLength(2);
    expect(await optIn()).not.toBeChecked();
    expect(sessionStorage.getItem("compare:viewerProfiles")).toBeNull();
  });
});
