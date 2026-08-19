// @vitest-environment jsdom
//
// Every hook in `hooks/` except `useProfile` (localStorage-backed, no TanStack Query — see
// its own test file) in one file. Each is a thin wrapper around either a `useTarkovClient()`
// query fetcher or a `buildsApi`/`pairsApi` function that reads the global `fetch` — same
// shape of test three ways (list hooks, id-gated detail hooks, load/mutation hooks), so
// they're grouped by that shape below rather than split one-file-per-hook.
//
// Kept as one file deliberately: this package's root `eslint.config.js`
// `parserOptions.projectService.maximumDefaultProjectFileMatchCount_THIS_WILL_SLOW_DOWN_LINTING`
// caps how many test files can fall back to the default TS project across the whole monorepo
// at 30. Splitting these 13 hooks into 13 files pushed the total over that cap; raising the
// cap or giving this package its own routed `tsconfig.test.json` project (one already exists,
// just not wired into `eslint.config.js` yet) is Stage 2.2 of
// docs/plans/2026-08-19-pre-refactor-hardening-plan.md, not this unit, and `eslint.config.js`
// is explicitly another unit's concurrent work — see that file's own top-of-array comment.
import { afterEach, describe, expect, it, vi } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import { withTarkovProvider, withQueryClient } from "../__test-utils__/query-wrapper.js";
import { fixtureClient } from "../__fixtures__/client.js";
import type { BuildV1 } from "../build-schema.js";
import type { BuildPairV1 } from "../pair-schema.js";

import { useAmmoList } from "./useAmmoList.js";
import { fetchAmmoList } from "../queries/ammoList.js";
import { useArmorList } from "./useArmorList.js";
import { fetchArmorList } from "../queries/armorList.js";
import { useModList } from "./useModList.js";
import { fetchModList } from "../queries/modList.js";
import { useTasks } from "./useTasks.js";
import { fetchTasks } from "../queries/tasks.js";
import { useTraders } from "./useTraders.js";
import { fetchTraders } from "../queries/traders.js";
import { useWeaponList } from "./useWeaponList.js";
import { fetchWeaponList } from "../queries/weaponList.js";
import { useWeapon } from "./useWeapon.js";
import { fetchWeapon } from "../queries/weapon.js";
import { useWeaponTree } from "./useWeaponTree.js";
import { fetchWeaponTree } from "../queries/weaponTree.js";
import { useLoadBuild } from "./useLoadBuild.js";
import { useSaveBuild } from "./useSaveBuild.js";
import { useLoadPair } from "./useLoadPair.js";
import { useSavePair } from "./useSavePair.js";
import { useForkPair } from "./useForkPair.js";

const failingClient = { fetchResource: () => Promise.reject(new Error("upstream down")) };

// ---------------------------------------------------------------------------
// List hooks — `useTarkovClient()`, no `enabled` gate, one query key each.
// ---------------------------------------------------------------------------

describe("useAmmoList", () => {
  it("resolves with the same data fetchAmmoList returns, under the ['ammoList'] key", async () => {
    const client = fixtureClient();
    const { result } = renderHook(() => useAmmoList(), { wrapper: withTarkovProvider(client) });
    expect(result.current.isPending).toBe(true);
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(await fetchAmmoList(client));
  });

  it("surfaces a rejected fetch as an Error on .error", async () => {
    const { result } = renderHook(() => useAmmoList(), {
      wrapper: withTarkovProvider(failingClient),
    });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error?.message).toBe("upstream down");
  });
});

describe("useArmorList", () => {
  it("resolves with the same data fetchArmorList returns, under the ['armorList'] key", async () => {
    const client = fixtureClient();
    const { result } = renderHook(() => useArmorList(), { wrapper: withTarkovProvider(client) });
    expect(result.current.isPending).toBe(true);
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(await fetchArmorList(client));
  });

  it("surfaces a rejected fetch as an Error on .error", async () => {
    const { result } = renderHook(() => useArmorList(), {
      wrapper: withTarkovProvider(failingClient),
    });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error?.message).toBe("upstream down");
  });
});

describe("useModList", () => {
  it("resolves with the same data fetchModList returns, under the ['modList'] key", async () => {
    const client = fixtureClient();
    const { result } = renderHook(() => useModList(), { wrapper: withTarkovProvider(client) });
    expect(result.current.isPending).toBe(true);
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(await fetchModList(client));
  });

  it("surfaces a rejected fetch as an Error on .error", async () => {
    const { result } = renderHook(() => useModList(), {
      wrapper: withTarkovProvider(failingClient),
    });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error?.message).toBe("upstream down");
  });
});

describe("useTasks", () => {
  it("resolves with the same data fetchTasks returns, under the ['tasks'] key", async () => {
    const client = fixtureClient();
    const { result } = renderHook(() => useTasks(), { wrapper: withTarkovProvider(client) });
    expect(result.current.isPending).toBe(true);
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(await fetchTasks(client));
  });

  it("surfaces a rejected fetch as an Error on .error", async () => {
    const { result } = renderHook(() => useTasks(), {
      wrapper: withTarkovProvider(failingClient),
    });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error?.message).toBe("upstream down");
  });
});

describe("useTraders", () => {
  it("resolves with the same data fetchTraders returns, under the ['traders'] key", async () => {
    const client = fixtureClient();
    const { result } = renderHook(() => useTraders(), { wrapper: withTarkovProvider(client) });
    expect(result.current.isPending).toBe(true);
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(await fetchTraders(client));
  });

  it("surfaces a rejected fetch as an Error on .error", async () => {
    const { result } = renderHook(() => useTraders(), {
      wrapper: withTarkovProvider(failingClient),
    });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error?.message).toBe("upstream down");
  });
});

describe("useWeaponList", () => {
  it("resolves with the same data fetchWeaponList returns, under the ['weaponList'] key", async () => {
    const client = fixtureClient();
    const { result } = renderHook(() => useWeaponList(), { wrapper: withTarkovProvider(client) });
    expect(result.current.isPending).toBe(true);
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(await fetchWeaponList(client));
  });

  it("surfaces a rejected fetch as an Error on .error", async () => {
    const { result } = renderHook(() => useWeaponList(), {
      wrapper: withTarkovProvider(failingClient),
    });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error?.message).toBe("upstream down");
  });
});

// ---------------------------------------------------------------------------
// Detail hooks — `useTarkovClient()`, `enabled` gated on a non-empty id.
// ---------------------------------------------------------------------------

// Colt M4A1, present in items-sample.json — reused across this package's tests.
const M4A1_ID = "5447a9cd4bdc2dbd208b4567";

/** A client that counts fetchResource calls, to prove a disabled query never fires one. */
function countingClient() {
  let calls = 0;
  return {
    calls: () => calls,
    client: {
      fetchResource<T>(resource: string) {
        calls += 1;
        return fixtureClient().fetchResource<T>(resource);
      },
    },
  };
}

describe("useWeapon", () => {
  it("resolves with the same data fetchWeapon returns, under the ['weapon', id] key", async () => {
    const client = fixtureClient();
    const { result } = renderHook(() => useWeapon(M4A1_ID), {
      wrapper: withTarkovProvider(client),
    });
    expect(result.current.isPending).toBe(true);
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(await fetchWeapon(client, M4A1_ID));
  });

  it("stays disabled (never fetches) when id is empty", async () => {
    const counting = countingClient();
    const { result } = renderHook(() => useWeapon(""), {
      wrapper: withTarkovProvider(counting.client),
    });
    expect(result.current.fetchStatus).toBe("idle");
    expect(result.current.isPending).toBe(true);
    // Give any accidental async fetch a chance to have started.
    await new Promise((r) => setTimeout(r, 10));
    expect(counting.calls()).toBe(0);
  });

  it("surfaces a rejected fetch as an Error on .error", async () => {
    const { result } = renderHook(() => useWeapon(M4A1_ID), {
      wrapper: withTarkovProvider(failingClient),
    });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error?.message).toBe("upstream down");
  });
});

describe("useWeaponTree", () => {
  it("resolves with the same data fetchWeaponTree returns, under ['weapon-tree', id]", async () => {
    const client = fixtureClient();
    const { result } = renderHook(() => useWeaponTree(M4A1_ID), {
      wrapper: withTarkovProvider(client),
    });
    expect(result.current.isPending).toBe(true);
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(await fetchWeaponTree(client, M4A1_ID));
  });

  it("stays disabled (never fetches) when weaponId is empty", async () => {
    const counting = countingClient();
    const { result } = renderHook(() => useWeaponTree(""), {
      wrapper: withTarkovProvider(counting.client),
    });
    expect(result.current.fetchStatus).toBe("idle");
    expect(result.current.isPending).toBe(true);
    await new Promise((r) => setTimeout(r, 10));
    expect(counting.calls()).toBe(0);
  });

  it("surfaces a rejected fetch as an Error on .error", async () => {
    const { result } = renderHook(() => useWeaponTree(M4A1_ID), {
      wrapper: withTarkovProvider(failingClient),
    });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error?.message).toBe("upstream down");
  });
});

// ---------------------------------------------------------------------------
// buildsApi/pairsApi hooks — read the global `fetch` directly, not `useTarkovClient()`.
// ---------------------------------------------------------------------------

const sampleV1: BuildV1 = {
  version: 1,
  weaponId: "weapon-abc",
  modIds: ["mod-1"],
  createdAt: "2026-04-19T12:00:00.000Z",
};

const validPair: BuildPairV1 = {
  v: 1,
  createdAt: "2026-04-20T00:00:00.000Z",
  left: null,
  right: null,
};

afterEach(() => vi.unstubAllGlobals());

describe("useLoadBuild", () => {
  it("resolves with the loaded (and version-upgraded) build under ['build', id]", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify(sampleV1), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      ),
    );
    const { result } = renderHook(() => useLoadBuild("k7m4n8p2"), { wrapper: withQueryClient() });
    expect(result.current.isPending).toBe(true);
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.weaponId).toBe("weapon-abc");
  });

  it("stays disabled (never fetches) when id is empty", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    const { result } = renderHook(() => useLoadBuild(""), { wrapper: withQueryClient() });
    expect(result.current.fetchStatus).toBe("idle");
    expect(result.current.isPending).toBe(true);
    await new Promise((r) => setTimeout(r, 10));
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("surfaces a LoadBuildError with .code on .error, and never retries", async () => {
    const fetchSpy = vi.fn().mockResolvedValue(new Response("", { status: 404 }));
    vi.stubGlobal("fetch", fetchSpy);
    const { result } = renderHook(() => useLoadBuild("k7m4n8p2"), { wrapper: withQueryClient() });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error).toMatchObject({ code: "not-found" });
    // `retry: false` — a single call proves the hook didn't retry the 404.
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });
});

describe("useSaveBuild", () => {
  it("POSTs the build and resolves with { id, url } on success", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ id: "k7m4n8p2", url: "https://x/builds/k7m4n8p2" }), {
          status: 201,
          headers: { "Content-Type": "application/json" },
        }),
      ),
    );
    const { result } = renderHook(() => useSaveBuild(), { wrapper: withQueryClient() });
    act(() => result.current.mutate(sampleV1));
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual({ id: "k7m4n8p2", url: "https://x/builds/k7m4n8p2" });
  });

  it("surfaces a save failure on .error", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("nope", { status: 500 })));
    const { result } = renderHook(() => useSaveBuild(), { wrapper: withQueryClient() });
    act(() => result.current.mutate(sampleV1));
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error?.message).toMatch(/saveBuild failed/);
  });
});

describe("useLoadPair", () => {
  it("resolves with the loaded pair under ['pair', id]", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify(validPair), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      ),
    );
    const { result } = renderHook(() => useLoadPair("abc23456"), { wrapper: withQueryClient() });
    expect(result.current.isPending).toBe(true);
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(validPair);
  });

  it("stays disabled (never fetches) when id is empty", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    const { result } = renderHook(() => useLoadPair(""), { wrapper: withQueryClient() });
    expect(result.current.fetchStatus).toBe("idle");
    expect(result.current.isPending).toBe(true);
    await new Promise((r) => setTimeout(r, 10));
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("surfaces a LoadPairError with .code on .error, and never retries", async () => {
    const fetchSpy = vi.fn().mockResolvedValue(new Response("", { status: 404 }));
    vi.stubGlobal("fetch", fetchSpy);
    const { result } = renderHook(() => useLoadPair("abc23456"), { wrapper: withQueryClient() });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error).toMatchObject({ code: "not-found" });
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });
});

describe("useSavePair", () => {
  it("POSTs the pair and resolves with { id, url } on success", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ id: "abc23456", url: "https://x/pairs/abc23456" }), {
          status: 201,
          headers: { "Content-Type": "application/json" },
        }),
      ),
    );
    const { result } = renderHook(() => useSavePair(), { wrapper: withQueryClient() });
    act(() => result.current.mutate(validPair));
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual({ id: "abc23456", url: "https://x/pairs/abc23456" });
  });

  it("surfaces a save failure on .error", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("nope", { status: 500 })));
    const { result } = renderHook(() => useSavePair(), { wrapper: withQueryClient() });
    act(() => result.current.mutate(validPair));
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error?.message).toMatch(/savePair failed/);
  });
});

describe("useForkPair", () => {
  it("POSTs to fork the pair and resolves with { id, url } on success", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ id: "xyz98765", url: "https://x/pairs/xyz98765" }), {
          status: 201,
          headers: { "Content-Type": "application/json" },
        }),
      ),
    );
    const { result } = renderHook(() => useForkPair(), { wrapper: withQueryClient() });
    act(() => result.current.mutate("abc23456"));
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual({ id: "xyz98765", url: "https://x/pairs/xyz98765" });
  });

  it("surfaces a fork failure on .error", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("nope", { status: 500 })));
    const { result } = renderHook(() => useForkPair(), { wrapper: withQueryClient() });
    act(() => result.current.mutate("abc23456"));
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error?.message).toMatch(/forkPair failed/);
  });
});
