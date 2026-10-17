/**
 * The fetch the release build reads `json.tarkov.dev` through.
 *
 * Each attempt is cut off after `timeoutMs`, and a failure to connect or a 5xx response
 * (timeouts included) is retried once, so a passing hiccup upstream does not fail a release.
 * A 4xx is returned at once: retrying a request upstream refused cannot change the answer.
 * A failure while reading a response body is not retried; it fails the build.
 *
 * The caller's own `signal` still applies to every attempt, and an attempt the caller aborted
 * is never retried.
 */
export function createRetryingFetch(
  inner: typeof fetch = fetch,
  { timeoutMs = 60_000, retryDelayMs = 2_000 } = {},
): typeof fetch {
  const attempt = (input: RequestInfo | URL, init?: RequestInit) => {
    const timeout = AbortSignal.timeout(timeoutMs);
    const signal = init?.signal ? AbortSignal.any([init.signal, timeout]) : timeout;
    return inner(input, { ...init, signal });
  };
  return async (input, init) => {
    try {
      const first = await attempt(input, init);
      if (first.status < 500) return first;
      // Release the discarded 5xx body's connection before asking again. A failure to cancel
      // a body nobody reads changes nothing about the retry.
      await first.body?.cancel().catch(() => undefined);
    } catch (error) {
      if (init?.signal?.aborted === true) throw error;
      // Failed to connect, or timed out: fall through to the single retry.
    }
    await new Promise((resolve) => setTimeout(resolve, retryDelayMs));
    return attempt(input, init);
  };
}
