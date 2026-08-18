import { createTarkovClient } from "@tarkov/data";
import type { TarkovJsonClient } from "@tarkov/data";

/**
 * Base URL for the tarkov.dev JSON API, including game mode.
 *
 * The GraphQL API this project originally used (api.tarkov.dev/graphql) has been
 * unavailable since ~2026-07-21 and tarkov.dev itself runs on this JSON API.
 * See the-hideout/tarkov-api#474.
 */
export const TARKOV_JSON_API_BASE = "https://json.tarkov.dev/regular/";

export const tarkovClient: TarkovJsonClient = createTarkovClient(TARKOV_JSON_API_BASE);
