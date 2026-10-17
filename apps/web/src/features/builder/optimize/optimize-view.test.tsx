// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, cleanup, waitFor, act, within } from "@testing-library/react";
import { OptimizeView, objectiveDelta } from "./optimize-view.js";
import type {
  AttachablePart,
  PlayerProfile,
  PriceGate,
  WeaponListItem,
  WeaponTree,
  BuildV6,
} from "@tarkov/data";
import type { BallisticWeapon, WeaponSpec } from "@tarkov/ballistics";
import type { OptimizationResult } from "@tarkov/optimizer";
import type { UseTarkovTrackerSyncResult } from "../useTarkovTrackerSync.js";
import type { OptimizeReply, OptimizeRequest } from "./optimize-protocol.js";
import { tinyTree } from "../../../test/tiny-tree.js";

// Stub @tarkov/optimizer for a deterministic result; a test may swap in its own.
const solver = vi.hoisted((): { result: unknown } => ({ result: undefined }));

/**
 * A stand-in for the optimizer worker: it answers through the real protocol
 * (`answerOptimizeRequest`, over the stubbed solver) on a later task, as a worker would, unless
 * a test holds it to drive the replies itself.
 */
interface FakeWorker {
  onmessage: ((event: { data: OptimizeReply }) => void) | null;
  onerror: ((event: ErrorEvent) => void) | null;
  onmessageerror: (() => void) | null;
  request: OptimizeRequest | undefined;
  terminated: boolean;
  postMessage(request: OptimizeRequest): void;
  terminate(): void;
}
const workers = vi.hoisted(() => ({ hold: false, started: [] as unknown[] }));
vi.mock("./optimizer-worker.js", async () => {
  const { answerOptimizeRequest } = await import("./optimize-protocol.js");
  return {
    startOptimizerWorker: () => {
      const worker: FakeWorker = {
        onmessage: null,
        onerror: null,
        onmessageerror: null,
        request: undefined,
        terminated: false,
        postMessage(request) {
          worker.request = request;
          if (workers.hold) return;
          setTimeout(() =>
            answerOptimizeRequest(request, (reply) => {
              if (!worker.terminated) worker.onmessage?.({ data: reply });
            }),
          );
        },
        terminate() {
          worker.terminated = true;
        },
      };
      workers.started.push(worker);
      return worker;
    },
  };
});

afterEach(() => {
  cleanup();
  solver.result = undefined;
  workers.hold = false;
  workers.started.length = 0;
});

const proposal = {
  ok: true,
  build: {
    version: 6,
    weaponId: "w1",
    attachments: { muzzle: "m-new", handguard: "h-new" },
    orphaned: [],
    createdAt: "2026-04-22T00:00:00Z",
  } satisfies BuildV6,
  stats: {
    ergonomics: 58,
    verticalRecoil: 120,
    horizontalRecoil: 260,
    weight: 3.1,
    accuracy: 2.2,
    modCount: 2,
  } as WeaponSpec,
  pins: { honoured: [], dropped: [] },
} satisfies OptimizationResult;
vi.mock("@tarkov/optimizer", () => ({ optimize: () => solver.result ?? proposal }));

const weapon = { id: "w1" } as unknown as BallisticWeapon;
const weaponItem = { id: "w1", shortName: "W", types: [], buyFor: [] } as unknown as WeaponListItem;
const slotTree: WeaponTree = tinyTree("w1", [
  { nameId: "muzzle", name: "Muzzle", items: ["m-old", "m-new"] },
  { nameId: "handguard", name: "Handguard", items: ["h-old", "h-new"] },
]);
/** The four parts the stubbed optimizer and the current build use: structure only, no stats. */
const parts: AttachablePart[] = ["m-old", "m-new", "h-old", "h-new"].map((id) => ({
  id,
  name: `Part ${id}`,
  shortName: id,
  iconLink: "https://assets.tarkov.dev/x.webp",
  weight: 0,
  types: ["mods"],
  minLevelForFlea: null,
  properties: {
    propertiesType: "ItemPropertiesWeaponMod",
    ergonomics: 0,
    recoilModifier: 0,
    accuracyModifier: 0,
    velocity: 0,
  },
  buyFor: [],
  conflictingItems: [],
  conflictingSlotIds: [],
}));
const profile: PlayerProfile = {
  mode: "basic",
  traders: { prapor: 4, therapist: 3, skier: 3, peacekeeper: 2, mechanic: 3, ragman: 2, jaeger: 3 },
  flea: true,
  completedQuests: [],
};
const sync: UseTarkovTrackerSyncResult = {
  state: "disconnected",
  detail: { state: "disconnected" },
  connect: vi.fn(),
  reSync: vi.fn(),
  disconnect: vi.fn(),
};
const currentStats: WeaponSpec = {
  ergonomics: 50,
  verticalRecoil: 150,
  horizontalRecoil: 300,
  weight: 3.5,
  accuracy: 2.5,
  modCount: 1,
} as WeaponSpec;

function renderView(
  options: {
    attachments?: Record<string, string>;
    gate?: PriceGate;
    onAccept?: (build: BuildV6) => void;
    onEditProfile?: () => void;
  } = {},
) {
  const attachments = options.attachments ?? { muzzle: "m-old" };
  return render(
    <OptimizeView
      weapon={weapon}
      weaponItem={weaponItem}
      slotTree={slotTree}
      parts={parts}
      gate={options.gate === undefined ? profile : options.gate}
      presets={[]}
      pricesReady
      sync={sync}
      currentAttachments={attachments}
      currentBuild={{
        version: 6,
        weaponId: "w1",
        attachments,
        orphaned: [],
        createdAt: "2026-04-22T00:00:00Z",
      }}
      currentStats={currentStats}
      currentPrice={{ status: "priced", totalRUB: 10_000, presetId: null }}
      onAccept={options.onAccept ?? vi.fn()}
      onExit={vi.fn()}
      onEditProfile={options.onEditProfile ?? vi.fn()}
    />,
  );
}

const runButton = () => screen.getByRole("button", { name: /RE-RUN OPTIMIZATION/i });
/** Set a slot's pin in the tree: FREE, LOCK or EMPTY. */
function pin(slot: string, choice: "FREE" | "LOCK" | "EMPTY") {
  fireEvent.click(
    within(screen.getByRole("radiogroup", { name: `${slot} pin` })).getByRole("radio", {
      name: choice,
    }),
  );
}
const pinState = (slot: string) =>
  within(screen.getByRole("radiogroup", { name: `${slot} pin` }))
    .getAllByRole<HTMLInputElement>("radio")
    .find((r) => r.checked)?.value;
const lastWorker = () => workers.started[workers.started.length - 1] as FakeWorker;

describe("OptimizeView", () => {
  it("renders idle state with CURRENT filled and diff table idle message", () => {
    renderView();
    expect(screen.getByText(/OPTIMIZER/)).toBeInTheDocument();
    expect(screen.getByText(/RUN THE SOLVER/)).toBeInTheDocument();
    // Current ergo populates the CURRENT card.
    expect(screen.getByTestId("triptych-current-ergo").textContent).toContain("50");
  });

  it("runs the solver in the worker with the form's constraints and the Builder's time limit", async () => {
    renderView();
    fireEvent.click(runButton());
    // Nothing is pinned unless the user pins it.
    expect(lastWorker().request).toMatchObject({
      objective: "min-recoil",
      timeoutMs: 2000,
      constraints: { profile, pinnedSlots: new Map() },
    });
    await waitFor(() =>
      expect(screen.getByTestId("triptych-optimized-ergo")).toHaveTextContent("58"),
    );
  });

  it("calls onAccept with merged build when ACCEPT SELECTED fires with 1 row unchecked", async () => {
    const onAccept = vi.fn();
    renderView({ attachments: { muzzle: "m-old", handguard: "h-old" }, onAccept });
    fireEvent.click(runButton());
    // The reply arrives on a later task, as a worker's does. Once it has, everything derived
    // from the result — including the default selection — is asserted with a non-retrying
    // `getByRole`, on purpose: the default selection is set in the same render as the result
    // (see optimize-view.tsx), so a click right after the result shows must count.
    await waitFor(() =>
      expect(screen.getByTestId("triptych-optimized-ergo")).toHaveTextContent("58"),
    );
    expect(screen.getByRole("button", { name: /ACCEPT SELECTED \(2\)/ })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("checkbox", { name: /Accept HANDGUARD/i }));
    fireEvent.click(await screen.findByRole("button", { name: /ACCEPT SELECTED \(1\)/ }));
    expect(onAccept).toHaveBeenCalledTimes(1);
    const acceptedBuild = onAccept.mock.calls[0]![0] as BuildV6;
    expect(acceptedBuild.attachments).toEqual({ muzzle: "m-new", handguard: "h-old" });
  });

  it("scores the result by the objective it was run with, not the form's current one", async () => {
    renderView();
    fireEvent.click(screen.getByRole("radio", { name: "Max accuracy" }));
    fireEvent.click(runButton());
    // MOA 2.5 → 2.2.
    expect(await screen.findByText(/MOA Δ/)).toHaveTextContent("MOA Δ · −0.30");
    fireEvent.click(screen.getByRole("radio", { name: "Min recoil" }));
    expect(screen.getByText(/MOA Δ/)).toHaveTextContent("MOA Δ · −0.30");
  });

  it("scores min recoil on vertical plus horizontal recoil", async () => {
    renderView();
    fireEvent.click(runButton());
    // V+H 150 + 300 → 120 + 260.
    expect(await screen.findByText(/RECOIL V\+H Δ/)).toHaveTextContent("RECOIL V+H Δ · −70");
  });

  it("sends the pins set in the tree, and shows which the result kept", async () => {
    solver.result = { ...proposal, pins: { honoured: ["muzzle"], dropped: [] } };
    renderView();
    expect(screen.queryByRole("region", { name: "Pins" })).toBeNull();
    pin("Muzzle", "LOCK");
    fireEvent.click(runButton());
    expect([...lastWorker().request!.constraints.pinnedSlots]).toEqual([["muzzle", "m-old"]]);
    const report = await screen.findByRole("region", { name: "Pins" });
    expect(report).toHaveTextContent("1 KEPT");
    expect(report).toHaveTextContent("KEPTMuzzlePart m-new");
  });

  describe("while it runs", () => {
    it("shows progress and stays usable, and Cancel terminates the worker and returns to idle", () => {
      workers.hold = true;
      renderView();
      fireEvent.click(runButton());
      const running = screen.getByRole("status", { name: "Optimizer running" });
      expect(running).toHaveTextContent("of 2 s · 0 candidate builds checked");
      expect(screen.getByText("RUNNING")).toBeInTheDocument();
      act(() => lastWorker().onmessage?.({ data: { type: "progress", nodes: 1 } }));
      expect(running).toHaveTextContent("1 candidate build checked");
      act(() => lastWorker().onmessage?.({ data: { type: "progress", nodes: 37 } }));
      expect(running).toHaveTextContent("37 candidate builds checked");
      // The form still answers while the solver works.
      fireEvent.click(screen.getByRole("radio", { name: "Max ergonomics" }));
      expect(screen.getByRole("radio", { name: "Max ergonomics" })).toBeChecked();

      const worker = lastWorker();
      fireEvent.click(within(running).getByRole("button", { name: "CANCEL" }));
      expect(worker.terminated).toBe(true);
      expect(screen.queryByRole("status", { name: "Optimizer running" })).toBeNull();
      expect(screen.getByText("IDLE")).toBeInTheDocument();
      expect(screen.getByText(/RUN THE SOLVER/)).toBeInTheDocument();
      // A reply the worker posted before it was terminated is ignored.
      act(() => worker.onmessage?.({ data: { type: "result", result: proposal } }));
      expect(screen.getByText("IDLE")).toBeInTheDocument();
    });

    it("lets a new run supersede the one going, ignoring the old one's reply", () => {
      workers.hold = true;
      renderView();
      fireEvent.click(runButton());
      const first = lastWorker();
      fireEvent.click(screen.getByRole("radio", { name: "Min weight" }));
      fireEvent.click(runButton());
      const second = lastWorker();
      expect(first.terminated).toBe(true);
      expect(second.request?.objective).toBe("min-weight");
      act(() =>
        first.onmessage?.({
          data: { type: "result", result: { ok: false, reason: "timeout" } },
        }),
      );
      expect(screen.queryByText("NO BUILD IN TIME")).toBeNull();
      act(() => second.onmessage?.({ data: { type: "result", result: proposal } }));
      // 3.5 → 3.1 kg.
      expect(screen.getByText(/WEIGHT KG Δ/)).toHaveTextContent("WEIGHT KG Δ · −0.40");
    });
  });

  describe("when no build comes back", () => {
    async function fail(
      result: OptimizationResult,
      options: Parameters<typeof renderView>[0] = {},
      lock: readonly string[] = [],
    ) {
      solver.result = result;
      renderView(options);
      for (const slot of lock) pin(slot, "LOCK");
      fireEvent.click(runButton());
      return screen.findByRole("alert");
    }

    it("explains a timeout and shows no build", async () => {
      const alert = await fail({ ok: false, reason: "timeout" });
      expect(alert).toHaveTextContent("NO BUILD IN TIME");
      expect(alert).toHaveTextContent(
        "The search reached its 2 s limit before it finished. Only a finished search is shown as the best build.",
      );
      expect(alert).toHaveTextContent("Pin more slots or set a budget to narrow the search");
      expect(screen.queryByTestId("triptych-optimized-ergo")).toBeNull();
      fireEvent.click(within(alert).getByRole("button", { name: "BACK TO CONSTRAINTS" }));
      expect(screen.queryByRole("alert")).toBeNull();
      expect(screen.getByText(/RUN THE SOLVER/)).toBeInTheDocument();
    });

    it("runs again without a budget when the budget is the cause", async () => {
      renderView();
      fireEvent.change(screen.getByLabelText("Budget"), { target: { value: "5000" } });
      solver.result = {
        ok: false,
        reason: "infeasible-budget",
        message: "The cheapest complete build costs ₽80,000, over the ₽5,000 budget.",
      };
      fireEvent.click(runButton());
      const alert = await screen.findByRole("alert");
      expect(alert).toHaveTextContent("OVER BUDGET");
      expect(alert).toHaveTextContent("₽80,000, over the ₽5,000 budget.");
      expect(lastWorker().request?.constraints.budgetRub).toBe(5000);
      solver.result = undefined;
      fireEvent.click(within(alert).getByRole("button", { name: "RUN WITHOUT A BUDGET" }));
      expect(lastWorker().request?.constraints.budgetRub).toBeUndefined();
      expect(screen.getByLabelText("Budget")).toHaveValue(null);
      await waitFor(() =>
        expect(screen.getByTestId("triptych-optimized-ergo")).toHaveTextContent("58"),
      );
    });

    it("unpins a pinned part nobody prices, leaving the slot free rather than empty", async () => {
      const alert = await fail(
        {
          ok: false,
          reason: "pinned-unpriced",
          itemIds: ["m-old"],
          message: "No price you can pay is known for Part m-old. Unpin it or clear the budget.",
        },
        {},
        ["Muzzle"],
      );
      expect(lastWorker().request?.constraints.pinnedSlots.get("muzzle")).toBe("m-old");
      expect(alert).toHaveTextContent("PINNED PART UNPRICED");
      expect(within(alert).getByRole("button", { name: "RUN WITHOUT A BUDGET" })).toBeVisible();
      solver.result = undefined;
      fireEvent.click(within(alert).getByRole("button", { name: "UNPIN Part m-old" }));
      // Free for the solver: no pin at all, not a pin to empty.
      expect(lastWorker().request?.constraints.pinnedSlots.has("muzzle")).toBe(false);
      expect(pinState("Muzzle")).toBe("free");
    });

    it("offers to unpin each clashing pin by name", async () => {
      const alert = await fail(
        {
          ok: false,
          reason: "pin-conflict",
          paths: ["handguard", "muzzle"],
          message:
            "No complete build keeps every pin. The pins that clash: Part h-old, Part m-old.",
        },
        { attachments: { muzzle: "m-old", handguard: "h-old" } },
        ["Muzzle", "Handguard"],
      );
      expect(alert).toHaveTextContent("PINS CLASH");
      expect(alert).toHaveTextContent("Unpin one of them.");
      solver.result = undefined;
      fireEvent.click(within(alert).getByRole("button", { name: "UNPIN Part h-old" }));
      const pins = lastWorker().request?.constraints.pinnedSlots;
      expect(pins && [...pins]).toEqual([["muzzle", "m-old"]]);
    });

    it("names an empty pin by its slot", async () => {
      solver.result = {
        ok: false,
        reason: "pin-conflict",
        paths: ["handguard"],
        message: "No complete build keeps every pin. The pins that clash: empty handguard.",
      };
      renderView();
      pin("Handguard", "EMPTY");
      fireEvent.click(runButton());
      const alert = await screen.findByRole("alert");
      expect(within(alert).getByRole("button", { name: "UNPIN EMPTY handguard" })).toBeVisible();
    });

    for (const [reason, heading, hint] of [
      [
        "weapon-unavailable",
        "WEAPON OUT OF REACH",
        "Raise trader levels or turn on the flea in your profile, or switch to theorycraft.",
      ],
      [
        "required-slot",
        "REQUIRED SLOT EMPTY",
        "Raise trader levels or turn on the flea to reach a part for it, or switch to theorycraft.",
      ],
      [
        "no-valid-combinations",
        "NO BUILD FITS TOGETHER",
        "Unpin slots, or change the profile to reach other parts.",
      ],
    ] as const) {
      it(`${reason}: shows the solver's reason and opens the profile`, async () => {
        const onEditProfile = vi.fn();
        const message = `The solver's own words for ${reason}.`;
        const result = (
          reason === "required-slot"
            ? { ok: false, reason, slotPath: "handguard", message }
            : { ok: false, reason, message }
        ) as OptimizationResult;
        const alert = await fail(result, { onEditProfile });
        expect(alert).toHaveTextContent(heading);
        expect(alert).toHaveTextContent(message);
        expect(alert).toHaveTextContent(hint);
        fireEvent.click(within(alert).getByRole("button", { name: "EDIT PROFILE" }));
        expect(onEditProfile).toHaveBeenCalledTimes(1);
      });
    }

    for (const [reason, hint] of [
      ["weapon-unavailable", "Pick another weapon."],
      ["required-slot", "Pick another weapon."],
      ["no-valid-combinations", "Unpin slots, or pick another weapon."],
    ] as const) {
      it(`${reason} in theorycraft: points past the profile`, async () => {
        const message = "No trader or flea listing sells the W.";
        const result = (
          reason === "required-slot"
            ? { ok: false, reason, slotPath: "handguard", message }
            : { ok: false, reason, message }
        ) as OptimizationResult;
        const alert = await fail(result, { gate: null });
        expect(alert).toHaveTextContent(hint);
        expect(within(alert).queryByRole("button", { name: "EDIT PROFILE" })).toBeNull();
      });
    }

    it("shows what the solver threw, and runs again", () => {
      workers.hold = true;
      renderView();
      fireEvent.click(runButton());
      act(() =>
        lastWorker().onmessage?.({
          data: { type: "error", message: "the slot graph has a cycle through loop" },
        }),
      );
      const alert = screen.getByRole("alert");
      expect(alert).toHaveTextContent("OPTIMIZER STOPPED");
      expect(alert).toHaveTextContent("the slot graph has a cycle through loop");
      expect(screen.getByText("ERROR")).toBeInTheDocument();
      fireEvent.click(within(alert).getByRole("button", { name: "RUN AGAIN" }));
      expect(workers.started).toHaveLength(2);
      expect(screen.getByText("RUNNING")).toBeInTheDocument();
    });
  });
});

describe("objectiveDelta", () => {
  const proposed = proposal.stats;
  it("scores each objective on the stat it optimises", () => {
    expect(objectiveDelta("min-recoil", currentStats, proposed)).toEqual({
      label: "RECOIL V+H",
      value: -70,
      digits: 0,
    });
    expect(objectiveDelta("max-ergonomics", currentStats, proposed)).toEqual({
      label: "ERGO",
      value: 8,
      digits: 0,
    });
    expect(objectiveDelta("min-weight", currentStats, proposed)).toMatchObject({
      label: "WEIGHT KG",
      digits: 2,
    });
    expect(objectiveDelta("max-accuracy", currentStats, proposed)).toMatchObject({
      label: "MOA",
      digits: 2,
    });
  });
});
