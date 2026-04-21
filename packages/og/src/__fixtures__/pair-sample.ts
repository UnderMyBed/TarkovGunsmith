import type { PairCardViewModel } from "../view-model.js";

export const pairSample: PairCardViewModel = {
  left: {
    weapon: "M4A1",
    modCount: 11,
    availability: "LL3",
    stats: { ergo: 52, recoilV: 88, recoilH: 215, weight: 3.4 },
  },
  right: {
    weapon: "HK 416A5",
    modCount: 9,
    availability: "LL4",
    stats: { ergo: 49, recoilV: 94, recoilH: 248, weight: 3.8 },
  },
};

export const pairOneSided: PairCardViewModel = {
  left: pairSample.left,
  right: null,
};
