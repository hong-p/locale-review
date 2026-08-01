/**
 * The single normalized error model for every GitHub request the app makes.
 *
 * plan.md 3.4 requires one error shape for REST and GraphQL alike, and plan.md
 * 4.1 requires the UI to tell an invalid URL, a missing pull request, a
 * permission problem, a rate limit, a network failure, and an unusable response
 * apart. A discriminated union on `code` is what lets a screen branch on those
 * without re-inspecting HTTP status codes.
 *
 * plan.md 5.2 and 10 forbid a token from reaching any error surface. That is
 * enforced structurally here, not by filtering: an error may carry a stable
 * `code`, a constant English `message`, and parsed numeric fields. It never
 * carries a request URL, a header value, or an echo of the response body, so
 * there is no path by which an `Authorization` header or a token embedded in a
 * GitHub error string can end up in an error object.
 *
 * `message` is a token-free fallback meant for logs, tests, and unexpected
 * states. User-visible copy is selected from `src/messages/en.ts` by `code`, so
 * a future UI locale never has to translate these strings.
 */

/** Why a pull request URL could not be turned into a repository and number. */
export type InvalidUrlReason =
  | "empty"
  | "unsupported-host"
  | "not-a-pull-request"
  | "invalid-number";

/** Why a response body could not be narrowed to the app's own types. */
export type MalformedResponseReason = "not-json" | "unexpected-shape" | "missing-field";

/**
 * GitHub applies two different limits: the documented hourly primary limit, and
 * a secondary limit for bursts. Only the primary one has a meaningful reset
 * time, so the UI has to tell them apart.
 */
export type RateLimitKind = "primary" | "secondary";

export type InvalidUrlError = {
  code: "invalid-url";
  message: string;
  reason: InvalidUrlReason;
};

export type NotFoundError = {
  code: "not-found";
  message: string;
  status: number;
};

export type PermissionDeniedError = {
  code: "permission-denied";
  message: string;
  /** 401 means the token itself was rejected, 403 means the resource is barred. */
  status: number;
};

export type RateLimitedError = {
  code: "rate-limited";
  message: string;
  status: number;
  rateLimitKind: RateLimitKind;
  /** Parsed from `x-ratelimit-*`; null when GitHub omitted or garbled a header. */
  limit: number | null;
  remaining: number | null;
  resetAt: Date | null;
  /** Parsed from `retry-after`, in seconds, for either the numeric or date form. */
  retryAfterSeconds: number | null;
};

export type NetworkFailureError = {
  code: "network-failure";
  message: string;
};

export type ServerError = {
  code: "server-error";
  message: string;
  /**
   * 5xx, and also any 4xx this model does not name (422 during a pending review
   * race, for instance). Callers that care about one of those branch on
   * `status` rather than growing the union.
   */
  status: number;
};

export type MalformedResponseError = {
  code: "malformed-response";
  message: string;
  status: number | null;
  reason: MalformedResponseReason;
  /**
   * The app-side field name the parser was looking for. Supplied by our own
   * code, never taken from the response, so it cannot leak remote content.
   */
  field: string | null;
};

export type GitHubApiError =
  | InvalidUrlError
  | NotFoundError
  | PermissionDeniedError
  | RateLimitedError
  | NetworkFailureError
  | ServerError
  | MalformedResponseError;

export type GitHubApiErrorCode = GitHubApiError["code"];

/**
 * The subset of `Response` this module reads. A real `Response` satisfies it,
 * and the omission of `url` is deliberate: a request URL can carry query
 * parameters, so it is not available to be copied into an error.
 */
export type HttpHeadersLike = {
  get: (name: string) => string | null;
};

export type HttpResponseLike = {
  status: number;
  headers: HttpHeadersLike;
};

/**
 * Constant, token-free English fallbacks. Nothing here interpolates a value, so
 * no remote string can reach a message.
 */
const ERROR_MESSAGES = {
  invalidUrl: "That is not a valid GitHub pull request URL.",
  notFound: "That pull request could not be found, or your token cannot see it.",
  unauthorized: "Your GitHub token was rejected. Check that it is valid and has not expired.",
  forbidden: "Your GitHub token does not have access to this repository.",
  rateLimit: {
    primary: "The GitHub API rate limit has been exceeded.",
    secondary: "GitHub applied a secondary rate limit to this request.",
  },
  networkFailure: "The request to GitHub could not be completed. Check your network connection.",
  serverError: "GitHub returned an unexpected response.",
  malformedResponse: "GitHub returned a response this app could not read.",
} as const;

export function invalidUrlError(reason: InvalidUrlReason): InvalidUrlError {
  return { code: "invalid-url", message: ERROR_MESSAGES.invalidUrl, reason };
}

/**
 * A rejected `fetch`. The rejection reason is intentionally not accepted: some
 * browsers put the request URL in it, which plan.md 5.2 keeps out of errors.
 */
export function networkFailureError(): NetworkFailureError {
  return { code: "network-failure", message: ERROR_MESSAGES.networkFailure };
}

export function malformedResponseError(
  reason: MalformedResponseReason,
  options: { field?: string | null; status?: number | null } = {},
): MalformedResponseError {
  return {
    code: "malformed-response",
    message: ERROR_MESSAGES.malformedResponse,
    status: options.status ?? null,
    reason,
    field: options.field ?? null,
  };
}

/**
 * Converts a failed response and its already-parsed body into the error model.
 *
 * The body is read for classification only — a secondary rate limit is
 * distinguishable from a plain 403 only by GitHub's message text — and no part
 * of it is retained.
 *
 * A response that could be parsed but not narrowed is not this function's job;
 * callers report that with `malformedResponseError`.
 */
export function toGitHubApiError(response: HttpResponseLike, body: unknown): GitHubApiError {
  const { status, headers } = response;

  if (isRateLimitResponse(status, headers, body)) {
    return buildRateLimitedError(status, headers, body);
  }

  if (status === 401 || status === 403) {
    return {
      code: "permission-denied",
      message: status === 401 ? ERROR_MESSAGES.unauthorized : ERROR_MESSAGES.forbidden,
      status,
    };
  }

  // 410 is what GitHub returns for a resource that existed and is gone. From
  // the reviewer's point of view that is indistinguishable from a 404.
  if (status === 404 || status === 410) {
    return { code: "not-found", message: ERROR_MESSAGES.notFound, status };
  }

  return { code: "server-error", message: ERROR_MESSAGES.serverError, status };
}

export function isGitHubApiError(value: unknown): value is GitHubApiError {
  if (typeof value !== "object" || value === null) return false;
  if (!("code" in value)) return false;
  if (!("message" in value)) return false;
  if (typeof value.message !== "string") return false;
  const { code } = value;
  return (
    code === "invalid-url" ||
    code === "not-found" ||
    code === "permission-denied" ||
    code === "rate-limited" ||
    code === "network-failure" ||
    code === "server-error" ||
    code === "malformed-response"
  );
}

/**
 * Whether offering `Retry` (plan.md 4.1) makes sense. A rate limit is retryable
 * in principle, though the UI should wait for `resetAt` before doing so.
 */
export function isRetryableError(error: GitHubApiError): boolean {
  return (
    error.code === "network-failure" ||
    error.code === "server-error" ||
    error.code === "rate-limited"
  );
}

function isRateLimitResponse(status: number, headers: HttpHeadersLike, body: unknown): boolean {
  if (status === 429) return true;
  if (status !== 403) return false;
  // An exhausted primary limit is reported as 403 with the remaining count at
  // zero; a secondary limit is a 403 with a Retry-After or a telltale message.
  if (parseIntegerHeader(headers, "x-ratelimit-remaining") === 0) return true;
  if (headers.get("retry-after") !== null) return true;
  return mentionsRateLimit(readBodyMessage(body));
}

function buildRateLimitedError(
  status: number,
  headers: HttpHeadersLike,
  body: unknown,
): RateLimitedError {
  const remaining = parseIntegerHeader(headers, "x-ratelimit-remaining");
  const retryAfterSeconds = parseRetryAfter(headers.get("retry-after"));
  const rateLimitKind = classifyRateLimit(remaining, retryAfterSeconds, readBodyMessage(body));

  return {
    code: "rate-limited",
    message: ERROR_MESSAGES.rateLimit[rateLimitKind],
    status,
    rateLimitKind,
    limit: parseIntegerHeader(headers, "x-ratelimit-limit"),
    remaining,
    resetAt: parseResetAt(headers.get("x-ratelimit-reset")),
    retryAfterSeconds,
  };
}

function classifyRateLimit(
  remaining: number | null,
  retryAfterSeconds: number | null,
  bodyMessage: string | null,
): RateLimitKind {
  if (bodyMessage !== null && /secondary rate limit|abuse detection/i.test(bodyMessage)) {
    return "secondary";
  }
  if (remaining === 0) return "primary";
  // Quota left but GitHub still asked us to back off: that is the burst limit.
  return retryAfterSeconds !== null ? "secondary" : "primary";
}

/** Reads `message` for classification only. The value is never stored. */
function readBodyMessage(body: unknown): string | null {
  if (typeof body !== "object" || body === null) return null;
  if (!("message" in body)) return null;
  const { message } = body;
  return typeof message === "string" ? message : null;
}

function mentionsRateLimit(bodyMessage: string | null): boolean {
  return bodyMessage !== null && /rate limit|abuse detection/i.test(bodyMessage);
}

/**
 * Strict on purpose: `Number.parseInt` would turn a truncated proxy header such
 * as `"12 requests"` into 12, and a wrong number is worse than a missing one.
 */
function parseIntegerHeader(headers: HttpHeadersLike, name: string): number | null {
  const raw = headers.get(name);
  if (raw === null) return null;
  const trimmed = raw.trim();
  if (!/^-?\d+$/.test(trimmed)) return null;
  const value = Number(trimmed);
  return Number.isSafeInteger(value) ? value : null;
}

function parseResetAt(raw: string | null): Date | null {
  if (raw === null) return null;
  const trimmed = raw.trim();
  if (!/^\d+$/.test(trimmed)) return null;
  const seconds = Number(trimmed);
  if (!Number.isSafeInteger(seconds) || seconds <= 0) return null;
  return new Date(seconds * 1000);
}

/** `Retry-After` is either a delay in seconds or an HTTP date. Both occur. */
function parseRetryAfter(raw: string | null): number | null {
  if (raw === null) return null;
  const trimmed = raw.trim();
  if (/^\d+$/.test(trimmed)) {
    const seconds = Number(trimmed);
    return Number.isSafeInteger(seconds) ? seconds : null;
  }
  const target = Date.parse(trimmed);
  if (Number.isNaN(target)) return null;
  return Math.max(0, Math.ceil((target - Date.now()) / 1000));
}
