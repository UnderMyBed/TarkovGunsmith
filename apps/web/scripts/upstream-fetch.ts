/**
 * The fetch the release build reads `json.tarkov.dev` through.
 *
 * Each attempt is cut off after `timeoutMs`, and a 5xx answer or a network failure (timeouts
 * included) is retried once, so a passing hiccup upstream does not fail a release. A 4xx is
 * returned at once: retrying a request upstream refused cannot change the answer.
 */
export function createRetryingFetch(
  inner: typeof fetch = fetch,
  { timeoutMs = 60_000, retryDelayMs = 2_000 } = {},
): typeof fetch {
  const attempt = (input: RequestInfo | URL, init?: RequestInit) =>
    inner(input, { ...init, signal: AbortSignal.timeout(timeoutMs) });
  return async (input, init) => {
    let first: Response;
    try {
      first = await attempt(input, init);
      if (first.status < 500) return first;
    } catch {
      // Network failure or timeout: fall through to the single retry.
    }
    await new Promise((resolve) => setTimeout(resolve, retryDelayMs));
    return attempt(input, init);
  };
}
