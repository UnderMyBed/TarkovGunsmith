// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, cleanup, act, within } from "@testing-library/react";
import { weaponSpec, type WeaponSpec } from "@tarkov/ballistics";
import {
  adaptMod,
  type AttachablePart,
  type BuildV6,
  type PlayerProfile,
  type PriceGate,
  type WeaponListItem,
  type WeaponTree,
} from "@tarkov/data";
import type { OptimizationResult } from "@tarkov/optimizer";
import type { UseTarkovTrackerSyncResult } from "../useTarkovTrackerSync.js";
import type { OptimizeReply, OptimizeRequest } from "./optimize-protocol.js";
import { tinyTree } from "../../../test/tiny-tree.js";
import { M4A1 } from "../../../test/weapon-fixtures.js";
import { OptimizeWorkbench } from "./optimize-workbench.js";
import { proposalSummary } from "./optimize-panel.js";

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

/** Stats per part: [ergonomics, recoil modifier, weight]. */
const STATS: Record<string, [number, number, number]> = {
  "m-old": [0, 0, 0.1],
  "m-new": [-2, -0.1, 0.3],
  "h-old": [0, 0, 0.2],
  "h-new": [5, -0.05, 0.2],
  fg: [1, 0, 0.05],
  "r-1": [0, -0.02, 0.1],
};
const parts: AttachablePart[] = Object.entries(STATS).map(([id, [ergonomics, rcl, weight]]) => ({
  id,
  name: `Part ${id}`,
  shortName: id,
  iconLink: "https://assets.tarkov.dev/x.webp",
  weight,
  types: ["mods"],
  minLevelForFlea: null,
  properties: {
    propertiesType: "ItemPropertiesWeaponMod",
    ergonomics,
    recoilModifier: rcl,
    accuracyModifier: 0,
    velocity: 0,
  },
  buyFor: [],
  conflictingItems: [],
  conflictingSlotIds: [],
}));
const byId = new Map(parts.map((p) => [p.id, p]));
const specOf = (ids: readonly string[]): WeaponSpec =>
  weaponSpec(
    M4A1,
    ids.map((id) => adaptMod(byId.get(id)!)),
  );

const proposal = {
  ok: true,
  build: {
    version: 6,
    weaponId: "w1",
    attachments: { muzzle: "m-new", handguard: "h-new" },
    orphaned: [],
    createdAt: "2026-04-22T00:00:00Z",
  } satisfies BuildV6,
  stats: specOf(["m-new", "h-new"]),
  pins: { honoured: [], dropped: [] },
} satisfies OptimizationResult;
vi.mock("@tarkov/optimizer", () => ({ optimize: () => solver.result ?? proposal }));

const weaponItem = { id: "w1", shortName: "W", types: [], buyFor: [] } as unknown as WeaponListItem;
const slotTree: WeaponTree = tinyTree("w1", [
  { nameId: "muzzle", name: "Muzzle", items: ["m-old", "m-new"] },
  {
    nameId: "handguard",
    name: "Handguard",
    items: [
      ["h-old", [{ nameId: "foregrip", name: "Foregrip", items: ["fg"] }]],
      ["h-new", [{ nameId: "rail", name: "Rail", required: true, items: ["r-1"] }]],
    ],
  },
  { nameId: "stock", name: "Stock", required: true, items: [] },
]);
const profile: PlayerProfile = {
  mode: "basic",
  traders: { prapor: 4, therapist: 3, skier: 3, peacekeeper: 2, mechanic: 3, ragman: 2, jaeger: 3 },
  flea: true,
  level: 20,
  completedQuests: [],
};
const sync: UseTarkovTrackerSyncResult = {
  state: "disconnected",
  detail: { state: "disconnected" },
  connect: vi.fn(),
  reSync: vi.fn(),
  disconnect: vi.fn(),
};

interface Options {
  attachments?: Record<string, string>;
  gate?: PriceGate;
  onApply?: (build: BuildV6) => void;
  onClose?: () => void;
  onEditProfile?: () => void;
  onUseProgression?: () => void;
}

function workbench(options: Options = {}) {
  const attachments = options.attachments ?? { muzzle: "m-old" };
  return (
    <OptimizeWorkbench
      weapon={M4A1}
      weaponItem={weaponItem}
      slotTree={slotTree}
      parts={parts}
      gate={options.gate === undefined ? profile : options.gate}
      presets={[]}
      prices={{ state: "ready", asOf: "2026-10-17T00:00:00Z" }}
      sync={sync}
      currentBuild={{
        version: 6,
        weaponId: "w1",
        attachments,
        orphaned: [],
        createdAt: "2026-04-22T00:00:00Z",
      }}
      currentSpec={specOf(Object.values(attachments))}
      stockSpec={specOf([])}
      currentPrice={{ status: "priced", totalRUB: 10_000, presetId: null }}
      boughtAsOf={() => null}
      nameOf={(id) => id}
      onEditProfile={options.onEditProfile ?? vi.fn()}
      onUseProgression={options.onUseProgression ?? vi.fn()}
      onApply={options.onApply ?? vi.fn()}
      onClose={options.onClose ?? vi.fn()}
    />
  );
}

function renderWorkbench(options: Options = {}) {
  const view = render(workbench(options));
  return { ...view, update: (next: Options) => view.rerender(workbench(next)) };
}

const runButton = () => screen.getByRole("button", { name: /^Run( again)?$/ });
const row = (slot: string) =>
  screen
    .getAllByRole("treeitem")
    .find(
      (r) =>
        r.getAttribute("aria-label")!.startsWith(`${slot}:`) ||
        r.getAttribute("aria-label")!.startsWith(`${slot}, required:`),
    )!;
/** Set a slot's pin with its button: Free, Lock or Keep empty. */
function pin(slot: string, choice: "Free" | "Lock" | "Keep empty") {
  fireEvent.click(
    within(screen.getByRole("group", { name: `Pin ${slot}` })).getByRole("button", {
      name: choice,
    }),
  );
}
const pinState = (slot: string) =>
  within(screen.getByRole("group", { name: `Pin ${slot}` }))
    .getAllByRole("button")
    .find((b) => b.getAttribute("aria-pressed") === "true")
    ?.getAttribute("aria-label");
const lastWorker = () => workers.started[workers.started.length - 1] as FakeWorker;
const strip = (label: string) =>
  within(screen.getByRole("region", { name: /^Build stats/ })).getByText(label).parentElement!;
const proposalCard = () => screen.getByRole("region", { name: "Proposal" });

describe("OptimizeWorkbench", () => {
  it("shows the current build in the tree, each slot free, ready to run", () => {
    renderWorkbench();
    expect(screen.getByRole("tree", { name: "Slots" })).toBeInTheDocument();
    expect(row("Muzzle")).toHaveAttribute("aria-label", "Muzzle: Part m-old");
    expect(row("Handguard")).toHaveAttribute("aria-label", "Handguard: empty");
    expect(row("Muzzle")).not.toHaveAttribute("aria-checked");
    expect(pinState("Muzzle")).toBe("Free");
    expect(screen.getByText("Nothing pinned")).toBeInTheDocument();
    expect(screen.getByText("Ready to run")).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Build stats" })).toBeInTheDocument();
    expect(runButton()).toHaveTextContent(/^Run$/);
  });

  it("runs the solver in the worker with the form's constraints and the Builder's time limit", async () => {
    renderWorkbench();
    fireEvent.click(runButton());
    // Nothing is pinned unless the user pins it.
    expect(lastWorker().request).toMatchObject({
      objective: "min-recoil",
      timeoutMs: 2000,
      constraints: { profile, pinnedSlots: new Map() },
    });
    await screen.findByRole("region", { name: "Proposal" });
    expect(runButton()).toHaveTextContent("Run again");
  });

  it("shows each change in the tree: the old part struck, the new one, its recoil effect, ticked", async () => {
    renderWorkbench();
    fireEvent.click(runButton());
    await screen.findByRole("region", { name: "Proposal" });
    expect(row("Muzzle")).toHaveAttribute(
      "aria-label",
      "Muzzle: Part m-new, was Part m-old, recoil −10.0% better",
    );
    expect(row("Muzzle")).toHaveAttribute("aria-checked", "true");
    expect(within(row("Muzzle")).getByText("Part m-old")).toHaveClass("line-through");
    // Better is spoken and shown on hover, not carried by colour alone.
    const effect = within(row("Muzzle")).getByTitle("better");
    expect(effect).toHaveTextContent("−10.0% better");
    expect(row("Handguard")).toHaveAttribute(
      "aria-label",
      "Handguard: Part h-new, was empty, recoil −5.0% better",
    );
    expect(within(proposalCard()).getByText("2 of 2 ticked")).toBeInTheDocument();
    expect(screen.getByText("Showing the proposal")).toBeInTheDocument();
    expect(screen.getByText("Exact")).toBeInTheDocument();
  });

  it("shows the proposed figures in the stat strip against the current ones", async () => {
    renderWorkbench();
    fireEvent.click(runButton());
    await screen.findByRole("region", { name: "Build stats, proposed" });
    const now = specOf(["m-old"]);
    const next = specOf(["m-new", "h-new"]);
    const v = strip("Vertical recoil");
    expect(v).toHaveTextContent(String(Number(next.verticalRecoil.toFixed(1))));
    expect(v).toHaveTextContent(`was ${Number(now.verticalRecoil.toFixed(1))}`);
    expect(v).toHaveTextContent(/better$/);
  });

  it("follows the ticks: Space unticks a change, the strip and summary follow, Apply takes the rest", async () => {
    const onApply = vi.fn();
    renderWorkbench({ attachments: { muzzle: "m-old" }, onApply });
    fireEvent.click(runButton());
    // The reply arrives on a later task, as a worker's does. Every change is ticked in the same
    // render as the result, so a key right after it shows must count.
    await screen.findByRole("region", { name: "Proposal" });
    fireEvent.keyDown(row("Handguard"), { key: " " });
    expect(row("Handguard")).toHaveAttribute("aria-checked", "false");
    expect(within(proposalCard()).getByText("1 of 2 ticked")).toBeInTheDocument();
    expect(screen.getByText("Partial: 1 of 2 changes")).toBeInTheDocument();
    const next = specOf(["m-new"]);
    expect(strip("Vertical recoil")).toHaveTextContent(
      new RegExp(`^Vertical recoil${Number(next.verticalRecoil.toFixed(1))}`),
    );
    fireEvent.click(screen.getByRole("button", { name: "Apply ticked changes" }));
    expect(onApply).toHaveBeenCalledTimes(1);
    expect((onApply.mock.calls[0]![0] as BuildV6).attachments).toEqual({ muzzle: "m-new" });
  });

  it("ticks with the tick box too, and won't apply nothing", async () => {
    renderWorkbench();
    fireEvent.click(runButton());
    await screen.findByRole("region", { name: "Proposal" });
    fireEvent.click(screen.getByRole("checkbox", { name: "Accept the Muzzle change" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "Accept the Handguard change" }));
    expect(row("Muzzle")).toHaveAttribute("aria-checked", "false");
    expect(screen.getByRole("button", { name: "Apply ticked changes" })).toBeDisabled();
  });

  it("Discard drops the proposal and closes the optimizer", async () => {
    const onClose = vi.fn();
    renderWorkbench({ onClose });
    fireEvent.click(runButton());
    await screen.findByRole("region", { name: "Proposal" });
    fireEvent.click(screen.getByRole("button", { name: "Discard" }));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("region", { name: "Proposal" })).toBeNull();
    expect(screen.getByText("Ready to run")).toBeInTheDocument();
  });

  it("says so when no change beats the build", async () => {
    solver.result = {
      ...proposal,
      build: { ...proposal.build, attachments: { muzzle: "m-old" } },
    };
    renderWorkbench();
    fireEvent.click(runButton());
    const card = await screen.findByRole("region", { name: "Proposal" });
    expect(card).toHaveTextContent("No change beats this build on min recoil.");
    expect(within(card).queryByRole("button", { name: "Apply ticked changes" })).toBeNull();
  });

  it("summarises by the objective the result was run with, not the form's current one", async () => {
    renderWorkbench();
    fireEvent.click(screen.getByRole("radio", { name: "Max accuracy" }));
    fireEvent.click(runButton());
    const card = await screen.findByRole("region", { name: "Proposal" });
    expect(card).toHaveTextContent(/Accuracy [\d.]+ → [\d.]+ MOA/);
    fireEvent.click(screen.getByRole("radio", { name: "Min recoil" }));
    expect(card).toHaveTextContent(/Accuracy [\d.]+ → [\d.]+ MOA/);
    expect(card).not.toHaveTextContent("Vertical recoil");
  });

  describe("ticks show what Apply does", () => {
    // The new handguard has a required rail and no foregrip slot.
    const nested = { muzzle: "m-old", handguard: "h-old", "handguard/foregrip": "fg" };
    const swap = {
      ...proposal,
      build: {
        ...proposal.build,
        attachments: { muzzle: "m-old", handguard: "h-new", "handguard/rail": "r-1" },
      },
    };
    const checkbox = (slot: string) =>
      screen.getByRole("checkbox", { name: `Accept the ${slot} change` });

    async function proposeSwap(onApply = vi.fn()) {
      solver.result = swap;
      renderWorkbench({ attachments: nested, onApply });
      fireEvent.click(runButton());
      await screen.findByRole("region", { name: "Proposal" });
      return onApply;
    }

    it("won't untick a required change alone while its parent change is ticked", async () => {
      await proposeSwap();
      expect(within(proposalCard()).getByText("3 of 3 ticked")).toBeInTheDocument();
      expect(row("Rail")).toHaveAttribute(
        "aria-label",
        expect.stringContaining("required by the new Handguard"),
      );
      expect(checkbox("Rail")).toBeDisabled();
      fireEvent.keyDown(row("Rail"), { key: " " });
      expect(row("Rail")).toHaveAttribute("aria-checked", "true");
    });

    it("unticking a parent change unticks the changes that need it, and counts what lands", async () => {
      const onApply = await proposeSwap();
      fireEvent.keyDown(row("Handguard"), { key: " " });
      expect(row("Handguard")).toHaveAttribute("aria-checked", "false");
      for (const slot of ["Rail", "Foregrip"]) {
        expect(row(slot)).toHaveAttribute("aria-checked", "false");
        expect(row(slot)).toHaveAttribute(
          "aria-label",
          expect.stringContaining("needs the new Handguard"),
        );
      }
      expect(within(proposalCard()).getByText("0 of 3 ticked")).toBeInTheDocument();
      expect(screen.getByText("Partial: 0 of 3 changes")).toBeInTheDocument();
      // Nothing would change: Apply is off rather than closing on the same build.
      expect(screen.getByRole("button", { name: "Apply ticked changes" })).toBeDisabled();
      expect(onApply).not.toHaveBeenCalled();
    });

    it("ticking a change ticks the parent change it needs", async () => {
      const onApply = await proposeSwap();
      fireEvent.keyDown(row("Handguard"), { key: " " });
      fireEvent.keyDown(row("Rail"), { key: " " });
      expect(row("Handguard")).toHaveAttribute("aria-checked", "true");
      expect(row("Rail")).toHaveAttribute("aria-checked", "true");
      // The foregrip goes with the new handguard, which has no slot for it.
      expect(row("Foregrip")).toHaveAttribute("aria-checked", "true");
      expect(row("Foregrip")).toHaveAttribute(
        "aria-label",
        expect.stringContaining("goes with the new Handguard"),
      );
      expect(within(proposalCard()).getByText("3 of 3 ticked")).toBeInTheDocument();
      fireEvent.click(screen.getByRole("button", { name: "Apply ticked changes" }));
      expect((onApply.mock.calls[0]![0] as BuildV6).attachments).toEqual(swap.build.attachments);
    });
  });

  describe("when what the run was solved for changes", () => {
    it("drops the proposal when the build changes under it, and frees pins it no longer reaches", async () => {
      const nested = { muzzle: "m-old", handguard: "h-old", "handguard/foregrip": "fg" };
      const { update } = renderWorkbench({ attachments: nested });
      fireEvent.keyDown(row("Foregrip"), { key: "l" });
      fireEvent.keyDown(row("Muzzle"), { key: "l" });
      fireEvent.click(runButton());
      await screen.findByRole("region", { name: "Proposal" });

      // As prices arriving re-seed the build with its preset.
      update({ attachments: { muzzle: "m-old" } });
      expect(screen.queryByRole("region", { name: "Proposal" })).toBeNull();
      expect(screen.getByRole("region", { name: "Build stats" })).toBeInTheDocument();
      expect(screen.getAllByText("The build changed. Run again.")).toHaveLength(2);
      expect(row("Foregrip")).toBeUndefined();
      expect(pinState("Muzzle")).toBe("Lock");
      expect(screen.getByText("1 locked")).toBeInTheDocument();

      fireEvent.click(runButton());
      expect([...lastWorker().request!.constraints.pinnedSlots.keys()]).toEqual(["muzzle"]);
      await screen.findByRole("region", { name: "Proposal" });
      expect(screen.queryByText("The build changed. Run again.")).toBeNull();
    });

    it("drops the proposal when the progression changes, so it can't be applied", async () => {
      const onApply = vi.fn();
      const { update } = renderWorkbench({ onApply });
      fireEvent.click(runButton());
      await screen.findByRole("region", { name: "Proposal" });
      update({ gate: null, onApply });
      expect(screen.queryByRole("region", { name: "Proposal" })).toBeNull();
      expect(screen.queryByRole("button", { name: "Apply ticked changes" })).toBeNull();
      expect(screen.getAllByText("Progression changed. Run again.")).toHaveLength(2);
      // Back to the old gate: the old run stays gone.
      update({ onApply });
      expect(screen.queryByRole("region", { name: "Proposal" })).toBeNull();
    });

    it("drops a run still going when the progression changes", () => {
      workers.hold = true;
      const { update } = renderWorkbench();
      fireEvent.click(runButton());
      const worker = lastWorker();
      update({ gate: null });
      expect(screen.queryByRole("status", { name: "Optimizer running" })).toBeNull();
      act(() => worker.onmessage?.({ data: { type: "result", result: proposal } }));
      expect(screen.queryByRole("region", { name: "Proposal" })).toBeNull();
    });
  });

  describe("pins", () => {
    it("F, L and E on the focused row free, lock and keep the slot empty", () => {
      renderWorkbench({ attachments: { muzzle: "m-old", handguard: "h-old" } });
      const muzzle = row("Muzzle");
      expect(muzzle).toHaveAttribute("aria-keyshortcuts", "F L E");
      fireEvent.keyDown(muzzle, { key: "l" });
      expect(pinState("Muzzle")).toBe("Lock");
      expect(row("Muzzle")).toHaveAttribute("aria-label", "Muzzle: Part m-old, locked");
      fireEvent.keyDown(row("Muzzle"), { key: "E" });
      expect(row("Muzzle")).toHaveAttribute("aria-label", "Muzzle: kept empty");
      expect(screen.getByText("1 kept empty")).toBeInTheDocument();
      fireEvent.keyDown(row("Muzzle"), { key: "f" });
      expect(pinState("Muzzle")).toBe("Free");
      expect(screen.getByText("Nothing pinned")).toBeInTheDocument();
    });

    it("leaves a key with Ctrl, Meta or Alt held to the browser", () => {
      renderWorkbench();
      for (const modifier of ["ctrlKey", "metaKey", "altKey"] as const) {
        const event = new KeyboardEvent("keydown", {
          key: "l",
          [modifier]: true,
          bubbles: true,
          cancelable: true,
        });
        row("Muzzle").dispatchEvent(event);
        expect(event.defaultPrevented).toBe(false);
        expect(pinState("Muzzle")).toBe("Free");
      }
    });

    it("can't lock an empty slot or empty a required one", () => {
      renderWorkbench();
      fireEvent.keyDown(row("Handguard"), { key: "l" });
      expect(pinState("Handguard")).toBe("Free");
      fireEvent.keyDown(row("Stock"), { key: "e" });
      expect(pinState("Stock")).toBe("Free");
      expect(
        within(screen.getByRole("group", { name: "Pin Stock" })).getByRole("button", {
          name: "Keep empty",
        }),
      ).toBeDisabled();
    });

    it("asks before keeping a slot empty clears the pins below it, and focus comes back", () => {
      renderWorkbench({ attachments: { handguard: "h-old", "handguard/foregrip": "fg" } });
      fireEvent.keyDown(row("Foregrip"), { key: "l" });
      expect(screen.getByText("1 locked")).toBeInTheDocument();

      fireEvent.keyDown(row("Handguard"), { key: "e" });
      const ask = screen.getByRole("group", { name: "Empty Handguard" });
      expect(ask).toHaveTextContent("Emptying Handguard clears 1 pin below it.");
      expect(within(ask).getByRole("button", { name: "Empty it" })).toHaveFocus();
      expect(pinState("Handguard")).toBe("Free");
      fireEvent.click(within(ask).getByRole("button", { name: "Keep pins" }));
      expect(row("Handguard")).toHaveFocus();
      expect(pinState("Foregrip")).toBe("Lock");

      fireEvent.keyDown(row("Handguard"), { key: "e" });
      fireEvent.click(screen.getByRole("button", { name: "Empty it" }));
      expect(row("Handguard")).toHaveFocus();
      expect(pinState("Handguard")).toBe("Keep empty");
      // The slots below leave the tree with their pins.
      expect(row("Foregrip")).toBeUndefined();
      expect(screen.getByText("1 kept empty")).toBeInTheDocument();
    });

    it("a slot kept empty has no rows below it: not expanded, and Right stays put", () => {
      renderWorkbench({ attachments: { handguard: "h-old", "handguard/foregrip": "fg" } });
      expect(row("Handguard")).toHaveAttribute("aria-expanded", "true");
      fireEvent.keyDown(row("Handguard"), { key: "e" });
      expect(row("Foregrip")).toBeUndefined();
      expect(row("Handguard")).not.toHaveAttribute("aria-expanded");
      row("Handguard").focus();
      fireEvent.keyDown(row("Handguard"), { key: "ArrowRight" });
      expect(row("Handguard")).toHaveFocus();
    });

    it("keeps the arrow keys moving between rows", () => {
      renderWorkbench({ attachments: { handguard: "h-old", "handguard/foregrip": "fg" } });
      row("Muzzle").focus();
      fireEvent.keyDown(row("Muzzle"), { key: "ArrowDown" });
      expect(row("Handguard")).toHaveFocus();
      fireEvent.keyDown(row("Handguard"), { key: "ArrowRight" });
      expect(row("Foregrip")).toHaveFocus();
      fireEvent.keyDown(row("Foregrip"), { key: "ArrowLeft" });
      expect(row("Handguard")).toHaveFocus();
      // One tab stop.
      expect(screen.getAllByRole("treeitem").filter((r) => r.tabIndex === 0)).toHaveLength(1);
    });

    it("sends the pins, and shows which the result kept", async () => {
      solver.result = { ...proposal, pins: { honoured: ["muzzle"], dropped: [] } };
      renderWorkbench();
      expect(screen.queryByRole("region", { name: "Pins" })).toBeNull();
      pin("Muzzle", "Lock");
      fireEvent.click(runButton());
      expect([...lastWorker().request!.constraints.pinnedSlots]).toEqual([["muzzle", "m-old"]]);
      const report = await screen.findByRole("region", { name: "Pins" });
      expect(report).toHaveTextContent("1 kept");
      expect(report).toHaveTextContent("KeptMuzzlePart m-new");
    });

    it("Free all frees every slot", () => {
      renderWorkbench({ attachments: { muzzle: "m-old", handguard: "h-old" } });
      pin("Muzzle", "Lock");
      pin("Handguard", "Keep empty");
      fireEvent.click(screen.getByRole("button", { name: "Free all" }));
      expect(pinState("Muzzle")).toBe("Free");
      expect(pinState("Handguard")).toBe("Free");
    });

    it("has no pin on a slot only the proposal reaches", async () => {
      renderWorkbench({ attachments: { muzzle: "m-old", handguard: "h-new" } });
      solver.result = {
        ...proposal,
        build: {
          ...proposal.build,
          attachments: { muzzle: "m-old", handguard: "h-old", "handguard/foregrip": "fg" },
        },
      };
      fireEvent.click(runButton());
      await screen.findByRole("region", { name: "Proposal" });
      expect(row("Foregrip")).toHaveAttribute("aria-checked", "true");
      expect(screen.queryByRole("group", { name: "Pin Foregrip" })).toBeNull();
      expect(row("Foregrip")).not.toHaveAttribute("aria-keyshortcuts");
    });
  });

  describe("while it runs", () => {
    it("shows progress and stays usable, and Cancel terminates the worker and returns to idle", () => {
      workers.hold = true;
      renderWorkbench();
      fireEvent.click(runButton());
      const running = screen.getByRole("status", { name: "Optimizer running" });
      // The clock waits for the worker: its boot is not the solver's time.
      expect(running).toHaveTextContent("Starting the solver · 0 candidate builds checked");
      expect(screen.getByText("Solving…")).toBeInTheDocument();
      act(() => lastWorker().onmessage?.({ data: { type: "progress", nodes: 0, elapsedMs: 0 } }));
      expect(running).toHaveTextContent(/^Solving0\.\d s of 2 s · 0 candidate builds checked/);
      act(() => lastWorker().onmessage?.({ data: { type: "progress", nodes: 1, elapsedMs: 50 } }));
      expect(running).toHaveTextContent("1 candidate build checked");
      // The form still answers while the solver works.
      fireEvent.click(screen.getByRole("radio", { name: "Max ergonomics" }));
      expect(screen.getByRole("radio", { name: "Max ergonomics" })).toBeChecked();

      const worker = lastWorker();
      fireEvent.click(within(running).getByRole("button", { name: "Cancel" }));
      expect(worker.terminated).toBe(true);
      expect(screen.queryByRole("status", { name: "Optimizer running" })).toBeNull();
      expect(screen.getByText("Ready to run")).toBeInTheDocument();
      // A reply the worker posted before it was terminated is ignored.
      act(() => worker.onmessage?.({ data: { type: "result", result: proposal } }));
      expect(screen.getByText("Ready to run")).toBeInTheDocument();
      expect(screen.queryByRole("region", { name: "Proposal" })).toBeNull();
    });

    it("lets a new run supersede the one going, ignoring the old one's reply", () => {
      workers.hold = true;
      renderWorkbench();
      fireEvent.click(runButton());
      const first = lastWorker();
      fireEvent.click(screen.getByRole("radio", { name: "Min weight" }));
      fireEvent.click(runButton());
      const second = lastWorker();
      expect(first.terminated).toBe(true);
      expect(second.request?.objective).toBe("min-weight");
      act(() =>
        first.onmessage?.({ data: { type: "result", result: { ok: false, reason: "timeout" } } }),
      );
      expect(screen.queryByText("No build in time")).toBeNull();
      act(() => second.onmessage?.({ data: { type: "result", result: proposal } }));
      // Summarised by the objective the run used.
      expect(proposalCard()).toHaveTextContent(/^Proposal2 of 2 tickedWeight /);
    });
  });

  describe("when no build comes back", () => {
    async function fail(
      result: OptimizationResult,
      options: Parameters<typeof renderWorkbench>[0] = {},
      lock: readonly string[] = [],
    ) {
      solver.result = result;
      renderWorkbench(options);
      for (const slot of lock) pin(slot, "Lock");
      fireEvent.click(runButton());
      return screen.findByRole("alert");
    }

    it("explains a timeout and shows no build", async () => {
      const alert = await fail({ ok: false, reason: "timeout" });
      expect(alert).toHaveTextContent("No build in time");
      expect(alert).toHaveTextContent(
        "The search reached its 2 s limit before it finished. Only a finished search is shown as the best build.",
      );
      expect(
        within(screen.getByRole("region", { name: "Build stats" })).getByText("No build"),
      ).toBeInTheDocument();
      expect(screen.queryByRole("region", { name: "Proposal" })).toBeNull();
      fireEvent.click(within(alert).getByRole("button", { name: "Dismiss" }));
      expect(screen.queryByRole("alert")).toBeNull();
      expect(screen.getByText("Ready to run")).toBeInTheDocument();
    });

    it("runs again without a budget when the budget is the cause", async () => {
      renderWorkbench();
      const budget = screen.getByLabelText(/^Budget/);
      expect(budget).toHaveAttribute("placeholder", "No limit");
      fireEvent.change(budget, { target: { value: "5000" } });
      solver.result = {
        ok: false,
        reason: "infeasible-budget",
        cause: "over-budget",
        message: "The cheapest complete build costs ₽80,000, over the ₽5,000 budget.",
      };
      fireEvent.click(runButton());
      const alert = await screen.findByRole("alert");
      expect(alert).toHaveTextContent("Over budget");
      expect(lastWorker().request?.constraints.budgetRub).toBe(5000);
      solver.result = undefined;
      fireEvent.click(within(alert).getByRole("button", { name: "Run without a budget" }));
      expect(lastWorker().request?.constraints.budgetRub).toBeUndefined();
      expect(screen.getByLabelText(/^Budget/)).toHaveValue(null);
      await screen.findByRole("region", { name: "Proposal" });
    });

    it("offers to unpin the pins that leave every build unpriced", async () => {
      const alert = await fail(
        {
          ok: false,
          reason: "infeasible-budget",
          cause: "pins",
          paths: ["handguard"],
          message: "No complete build that keeps your pins has a known price on this profile.",
        },
        { attachments: { muzzle: "m-old", handguard: "h-old" } },
        ["Muzzle", "Handguard"],
      );
      expect(alert).toHaveTextContent("Unpin slots, or run without a budget.");
      solver.result = undefined;
      fireEvent.click(within(alert).getByRole("button", { name: "Unpin Part h-old" }));
      expect([...lastWorker().request!.constraints.pinnedSlots]).toEqual([["muzzle", "m-old"]]);
    });

    it("sends a profile with no known prices to the profile, not to a bigger budget", async () => {
      const onEditProfile = vi.fn();
      const alert = await fail(
        {
          ok: false,
          reason: "infeasible-budget",
          cause: "unpriced",
          message: "No complete build has a known price on this profile.",
        },
        { onEditProfile },
      );
      expect(alert).toHaveTextContent("No known price");
      fireEvent.click(within(alert).getByRole("button", { name: "Edit progression" }));
      expect(onEditProfile).toHaveBeenCalled();
    });

    it("names the pins the run used, though the tree has moved on", async () => {
      const alert = await fail(
        {
          ok: false,
          reason: "pin-conflict",
          paths: ["muzzle"],
          message: "No complete build keeps every pin. Unpin Part m-old and run it again.",
        },
        {},
        ["Muzzle"],
      );
      pin("Muzzle", "Free");
      expect(pinState("Muzzle")).toBe("Free");
      expect(within(alert).getByRole("button", { name: "Unpin Part m-old" })).toBeVisible();
    });

    it("unpins a pinned part nobody prices, leaving the slot free rather than empty", async () => {
      const alert = await fail(
        {
          ok: false,
          reason: "pinned-unpriced",
          itemIds: ["m-old"],
          message: "No price you can pay is known for Part m-old.",
        },
        {},
        ["Muzzle"],
      );
      solver.result = undefined;
      fireEvent.click(within(alert).getByRole("button", { name: "Unpin Part m-old" }));
      expect(lastWorker().request?.constraints.pinnedSlots.has("muzzle")).toBe(false);
      expect(pinState("Muzzle")).toBe("Free");
    });

    it("names an empty pin by its slot", async () => {
      solver.result = {
        ok: false,
        reason: "pin-conflict",
        paths: ["muzzle"],
        message: "No complete build keeps every pin.",
      };
      renderWorkbench();
      pin("Muzzle", "Keep empty");
      fireEvent.click(runButton());
      const alert = await screen.findByRole("alert");
      expect(within(alert).getByRole("button", { name: "Unpin Empty muzzle" })).toBeVisible();
    });

    it("shows the solver's reason and opens the profile", async () => {
      const onEditProfile = vi.fn();
      const alert = await fail(
        { ok: false, reason: "no-valid-combinations", message: "The solver's own words." },
        { onEditProfile },
      );
      expect(alert).toHaveTextContent("No build fits together");
      expect(alert).toHaveTextContent("The solver's own words.");
      fireEvent.click(within(alert).getByRole("button", { name: "Edit progression" }));
      expect(onEditProfile).toHaveBeenCalledTimes(1);
    });

    it("shows what the solver threw, and runs again", () => {
      workers.hold = true;
      renderWorkbench();
      fireEvent.click(runButton());
      act(() =>
        lastWorker().onmessage?.({
          data: { type: "error", message: "the slot graph has a cycle through loop" },
        }),
      );
      const alert = screen.getByRole("alert");
      expect(alert).toHaveTextContent("Optimizer stopped");
      fireEvent.click(within(alert).getByRole("button", { name: "Run again" }));
      expect(workers.started).toHaveLength(2);
      expect(screen.getByText("Solving…")).toBeInTheDocument();
    });
  });

  it("names theorycraft in the profile line, and offers the progression", () => {
    const onEditProfile = vi.fn();
    const onUseProgression = vi.fn();
    renderWorkbench({ gate: null, onEditProfile, onUseProgression });
    expect(
      screen.getByText(/^Theorycraft: every trader, flea and quest counts as open\./),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Use my progression" }));
    expect(onUseProgression).toHaveBeenCalledTimes(1);
    expect(onEditProfile).not.toHaveBeenCalled();
  });

  it("names the progression the search reads", () => {
    renderWorkbench();
    expect(screen.getByText(/^My progression: PMC level/)).toHaveTextContent(
      "My progression: PMC level 20, flea on. Edit progression",
    );
  });
});

describe("proposalSummary", () => {
  const now = {
    ergonomics: -10,
    verticalRecoil: 78.1,
    horizontalRecoil: 200,
    weight: 2.85,
    accuracy: 2.17,
  } as WeaponSpec;
  const next = {
    ergonomics: 12,
    verticalRecoil: 40,
    horizontalRecoil: 150,
    weight: 4.9,
    accuracy: 1.49,
  } as WeaponSpec;
  const price = (totalRUB: number) => ({ status: "priced", totalRUB, presetId: null }) as const;

  it("leads with the stat the run optimised, then cost and weight", () => {
    expect(proposalSummary("min-recoil", now, next, price(30_000), price(817_000))).toBe(
      "Vertical recoil 78.1 → 40, for ₽787.0k more and 2.05 kg heavier.",
    );
    expect(proposalSummary("max-accuracy", now, next, null, null)).toBe(
      "Accuracy 2.17 → 1.49 MOA, 2.05 kg heavier.",
    );
    expect(proposalSummary("min-weight", next, now, price(5000), price(5000))).toBe(
      "Weight 4.90 → 2.85 kg, at the same cost.",
    );
  });

  it("states ergonomics as the game floors it", () => {
    expect(proposalSummary("max-ergonomics", now, next, null, null)).toMatch(/^Ergonomics 0 → 12,/);
  });
});
