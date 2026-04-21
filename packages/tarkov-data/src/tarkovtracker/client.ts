import { NetworkError, RateLimitedError, ShapeMismatchError, TokenInvalidError } from "./errors.js";
import { RawProgressionSchema, type RawProgression } from "./types.js";

const ENDPOINT = "https://tarkovtracker.io/api/v2/progress";

/**
 * Fetch the current user's progression from TarkovTracker. Bearer token is
 * required and must have the GP (Get Progression) scope. Throws typed errors
 * the consumer can match on.
 */
export async function fetchProgression(token: string): Promise<RawProgression> {
  let res: Response;
  try {
    res = await fetch(ENDPOINT, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
      },
    });
  } catch (cause) {
    throw new NetworkError(cause);
  }

  if (res.status === 401) throw new TokenInvalidError();
  if (res.status === 429) {
    const retryRaw = res.headers.get("Retry-After");
    const retryAfter = retryRaw !== null ? Number(retryRaw) : null;
    throw new RateLimitedError(
      retryAfter !== null && Number.isFinite(retryAfter) ? retryAfter : null,
    );
  }
  if (!res.ok) throw new NetworkError(`upstream ${res.status}`);

  const body: unknown = await res.json();
  const parsed = RawProgressionSchema.safeParse(body);
  if (!parsed.success) {
    throw new ShapeMismatchError(
      parsed.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
    );
  }
  return parsed.data;
}
