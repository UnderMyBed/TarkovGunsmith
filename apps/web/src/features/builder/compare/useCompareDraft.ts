import { useReducer } from "react";
import type { BuildV6, PlayerProfile } from "@tarkov/data";

export type CompareSide = "left" | "right";

export interface CompareDraft {
  left: BuildV6 | null;
  right: BuildV6 | null;
  leftProfile?: PlayerProfile;
  rightProfile?: PlayerProfile;
  name?: string;
  description?: string;
  dirty: boolean;
}

export const initialDraft: CompareDraft = {
  left: null,
  right: null,
  dirty: false,
};

export type CompareDraftAction =
  | { type: "SET_SIDE"; side: CompareSide; build: BuildV6 | null }
  | { type: "SET_PROFILE"; side: CompareSide; profile: PlayerProfile | undefined }
  | { type: "SWAP" }
  | { type: "CLONE"; from: CompareSide }
  | { type: "SET_NAME"; name: string | undefined }
  | { type: "SET_DESCRIPTION"; description: string | undefined }
  | { type: "RESET" }
  | { type: "MARK_CLEAN" };

export function compareDraftReducer(state: CompareDraft, action: CompareDraftAction): CompareDraft {
  switch (action.type) {
    case "SET_SIDE":
      return action.side === "left"
        ? { ...state, left: action.build, dirty: true }
        : { ...state, right: action.build, dirty: true };
    case "SET_PROFILE":
      return action.side === "left"
        ? { ...state, leftProfile: action.profile, dirty: true }
        : { ...state, rightProfile: action.profile, dirty: true };
    case "SWAP":
      return {
        ...state,
        left: state.right,
        right: state.left,
        leftProfile: state.rightProfile,
        rightProfile: state.leftProfile,
        dirty: true,
      };
    case "CLONE": {
      if (action.from === "left" && state.left) {
        return { ...state, right: structuredClone(state.left), dirty: true };
      }
      if (action.from === "right" && state.right) {
        return { ...state, left: structuredClone(state.right), dirty: true };
      }
      return state;
    }
    case "SET_NAME":
      return { ...state, name: action.name, dirty: true };
    case "SET_DESCRIPTION":
      return { ...state, description: action.description, dirty: true };
    case "RESET":
      return initialDraft;
    case "MARK_CLEAN":
      return { ...state, dirty: false };
  }
}

export function useCompareDraft(initial: CompareDraft = initialDraft) {
  const [state, dispatch] = useReducer(compareDraftReducer, initial);
  return {
    state,
    setSide: (side: CompareSide, build: BuildV6 | null) =>
      dispatch({ type: "SET_SIDE", side, build }),
    setProfile: (side: CompareSide, profile: PlayerProfile | undefined) =>
      dispatch({ type: "SET_PROFILE", side, profile }),
    swap: () => dispatch({ type: "SWAP" }),
    cloneLeftToRight: () => dispatch({ type: "CLONE", from: "left" }),
    cloneRightToLeft: () => dispatch({ type: "CLONE", from: "right" }),
    setName: (name: string | undefined) => dispatch({ type: "SET_NAME", name }),
    setDescription: (description: string | undefined) =>
      dispatch({ type: "SET_DESCRIPTION", description }),
    reset: () => dispatch({ type: "RESET" }),
    markClean: () => dispatch({ type: "MARK_CLEAN" }),
  };
}
