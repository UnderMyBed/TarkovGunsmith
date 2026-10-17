import type { ReactElement, ReactNode } from "react";
import type { BallisticWeapon, WeaponSpec } from "@tarkov/ballistics";
import type {
  AttachablePart,
  BuildPrice,
  BuildV6,
  PriceGate,
  PricedPreset,
  WeaponListItem,
  WeaponTree,
} from "@tarkov/data";
import type { PricesStatus } from "../build-price.js";
import { StatStrip } from "../stat-strip.js";
import type { UseTarkovTrackerSyncResult } from "../useTarkovTrackerSync.js";
import { OptimizePanel, optimizeStatus } from "./optimize-panel.js";
import { ProposalBuildPanel } from "./proposal-tree.js";
import { useOptimizeSession } from "./useOptimizeSession.js";

export interface OptimizeWorkbenchProps {
  weapon: BallisticWeapon;
  weaponItem: WeaponListItem;
  slotTree: WeaponTree;
  parts: readonly AttachablePart[];
  gate: PriceGate;
  presets: readonly PricedPreset[];
  prices: PricesStatus;
  sync: UseTarkovTrackerSyncResult;
  currentBuild: BuildV6;
  currentSpec: WeaponSpec;
  stockSpec: WeaponSpec | null;
  currentPrice: BuildPrice | null;
  /** The preset a price buys the weapon as, by name, when it is one. */
  boughtAsOf: (price: BuildPrice | null) => string | null;
  nameOf: (id: string) => string;
  /** Shown above the build: progression prompts and sync state. */
  status?: ReactNode;
  onEditProfile: () => void;
  /** Switch to the player's progression: straight to a stored profile, else the panel. */
  onUseProgression: () => void;
  onApply: (build: BuildV6) => void;
  onClose: () => void;
}

/**
 * The workbench in optimize mode: the stat strip shows the proposal against the current build,
 * the Build panel shows the proposal in the slot tree, and the side panel holds the objective,
 * the budget, Run and the Proposal. Mount it keyed by the weapon: its session starts fresh for
 * each one.
 */
export function OptimizeWorkbench(props: OptimizeWorkbenchProps): ReactElement {
  const pricesReady = props.prices.state === "ready";
  const session = useOptimizeSession({
    weapon: props.weapon,
    weaponItem: props.weaponItem,
    slotTree: props.slotTree,
    parts: props.parts,
    gate: props.gate,
    presets: props.presets,
    pricesReady,
    currentBuild: props.currentBuild,
    currentPrice: props.currentPrice,
  });
  const next = session.tickedBuild;

  return (
    <>
      <StatStrip
        spec={props.currentSpec}
        stockSpec={props.stockSpec}
        prices={props.prices}
        buildPrice={props.currentPrice}
        boughtAs={props.boughtAsOf(props.currentPrice)}
        nameOf={props.nameOf}
        proposal={
          next === null
            ? undefined
            : { spec: next.spec, buildPrice: next.price, boughtAs: props.boughtAsOf(next.price) }
        }
        status={optimizeStatus(session)}
      />
      <div className="mx-auto flex w-full max-w-[1440px] flex-col gap-4 px-4 pb-8 pt-4 sm:px-6">
        {props.status}
        <div className="flex flex-wrap items-start gap-4">
          <ProposalBuildPanel session={session} />
          <OptimizePanel
            session={session}
            gate={props.gate}
            sync={props.sync}
            pricesReady={pricesReady}
            currentSpec={props.currentSpec}
            currentPrice={props.currentPrice}
            onEditProfile={props.onEditProfile}
            onUseProgression={props.onUseProgression}
            onClose={props.onClose}
            onApply={props.onApply}
          />
        </div>
      </div>
    </>
  );
}
