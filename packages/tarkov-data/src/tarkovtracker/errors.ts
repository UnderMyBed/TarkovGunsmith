export class TokenInvalidError extends Error {
  constructor() {
    super("TarkovTracker rejected the token (401)");
    this.name = "TokenInvalidError";
  }
}

export class RateLimitedError extends Error {
  constructor(public readonly retryAfterSeconds: number | null = null) {
    super("TarkovTracker rate-limited the request (429)");
    this.name = "RateLimitedError";
  }
}

export class NetworkError extends Error {
  constructor(cause: unknown) {
    super(`TarkovTracker network error: ${String(cause)}`);
    this.name = "NetworkError";
  }
}

export class ShapeMismatchError extends Error {
  constructor(public readonly issues: readonly { path: string; message: string }[]) {
    super("TarkovTracker response shape did not match expected schema");
    this.name = "ShapeMismatchError";
  }
}
