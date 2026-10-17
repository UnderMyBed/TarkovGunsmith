/**
 * `@tarkov/data/prices`: the price table and its fetch, with no zod, React or translation
 * code behind them, for the price Web Worker to bundle. The package root re-exports all of it.
 */
export {
  extractPrices,
  fleaPriceFromTuple,
  newestUpdated,
  priceTupleOf,
  traderOfferKey,
} from "./table.js";
export type { ExtractedPrices, ItemPriceTuple, PriceTable } from "./table.js";
export {
  answerPriceRequest,
  fetchPriceTable,
  PRICE_MAX_AGE_MS,
  PRICE_TIMEOUT_MS,
  PriceFetchError,
} from "./fetch.js";
export type { FetchPricesOptions, LivePrices, PriceReply, PriceRequest } from "./fetch.js";
