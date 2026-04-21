import { BuildPair, type BuildPair as BuildPairType } from "./pair-schema.js";

const PAIRS_ENDPOINT = "/api/pairs";

// Same alphabet + length as apps/builds-api/src/id.ts. Kept in sync manually —
// if the Worker's id format changes, update here too (and add a regression
// test in pairsApi.test.ts).
const PAIR_ID_REGEX = /^[abcdefghjkmnpqrstuvwxyz23456789]{8}$/;

export type LoadPairErrorCode = "invalid-id" | "not-found" | "unreachable" | "invalid-schema";

export class LoadPairError extends Error {
  constructor(
    public readonly code: LoadPairErrorCode,
    message: string,
    public override readonly cause?: unknown,
  ) {
    super(message);
    this.name = "LoadPairError";
  }
}

export interface SavePairResponse {
  id: string;
  url: string;
}

function parseSaveResponse(body: unknown): SavePairResponse {
  if (
    typeof body !== "object" ||
    body === null ||
    typeof (body as { id?: unknown }).id !== "string" ||
    typeof (body as { url?: unknown }).url !== "string"
  ) {
    throw new Error("pairsApi: malformed response");
  }
  return body as SavePairResponse;
}

/**
 * Persist a build pair by POSTing to the builds-api Worker (via same-origin
 * `/api/pairs`). Throws on any non-201 or malformed response. Callers should
 * surface the failure with a toast — no retry policy here; retries are the
 * caller's call.
 */
export async function savePair(
  fetchImpl: typeof fetch,
  pair: BuildPairType,
): Promise<SavePairResponse> {
  const res = await fetchImpl(PAIRS_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(pair),
  });
  if (res.status !== 201) {
    throw new Error(`savePair failed: HTTP ${res.status}`);
  }
  return parseSaveResponse(await res.json());
}

/**
 * Load a pair by id. Validates the id against the builds-api alphabet before
 * hitting the network, then Zod-parses the response through the `BuildPair`
 * discriminated union. Throws `LoadPairError` with a specific `code` for
 * every failure mode so the UI can pick an error state without re-classifying
 * exceptions.
 */
export async function loadPair(fetchImpl: typeof fetch, id: string): Promise<BuildPairType> {
  if (!PAIR_ID_REGEX.test(id)) {
    throw new LoadPairError("invalid-id", `Pair id "${id}" is malformed`);
  }

  let res: Response;
  try {
    res = await fetchImpl(`${PAIRS_ENDPOINT}/${id}`);
  } catch (cause) {
    throw new LoadPairError("unreachable", "Couldn't reach pair storage", cause);
  }

  if (res.status === 404) {
    throw new LoadPairError("not-found", `Pair "${id}" not found`);
  }
  if (res.status !== 200) {
    throw new LoadPairError("unreachable", `Pair storage returned HTTP ${res.status}`);
  }

  let raw: unknown;
  try {
    raw = await res.json();
  } catch (cause) {
    throw new LoadPairError("invalid-schema", "Pair body was not JSON", cause);
  }

  const parsed = BuildPair.safeParse(raw);
  if (!parsed.success) {
    throw new LoadPairError("invalid-schema", "Pair failed schema validation", parsed.error);
  }
  return parsed.data;
}

/**
 * Fork an existing pair — server creates a fresh id pointing at a deep copy,
 * so the caller can safely mutate without affecting the original. Validates
 * the id format before the network call for symmetry with `loadPair`.
 */
export async function forkPair(fetchImpl: typeof fetch, id: string): Promise<SavePairResponse> {
  if (!PAIR_ID_REGEX.test(id)) {
    throw new LoadPairError("invalid-id", `Pair id "${id}" is malformed`);
  }
  const res = await fetchImpl(`${PAIRS_ENDPOINT}/${id}/fork`, {
    method: "POST",
  });
  if (res.status !== 201) {
    throw new Error(`forkPair failed: HTTP ${res.status}`);
  }
  return parseSaveResponse(await res.json());
}
