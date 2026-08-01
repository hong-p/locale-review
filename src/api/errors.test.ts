import { afterEach, describe, expect, it, vi } from "vitest";

import {
  buildPermissionErrorPayload,
  buildRateLimitErrorPayload,
  buildRateLimitHeaders,
} from "../test/fixtures/github";
import {
  type GitHubApiError,
  type HttpResponseLike,
  invalidUrlError,
  isGitHubApiError,
  isRetryableError,
  malformedResponseError,
  networkFailureError,
  toGitHubApiError,
} from "./errors";

/** 2026-01-08T12:00:00Z, the default reset instant used by the fixtures. */
const RESET_EPOCH_SECONDS = 1767873600;
const RESET_ISO = "2026-01-08T12:00:00.000Z";

function responseOf(status: number, headers: Record<string, string> = {}): HttpResponseLike {
  const normalized: Record<string, string> = {};
  for (const [name, value] of Object.entries(headers)) {
    normalized[name.toLowerCase()] = value;
  }
  return {
    status,
    headers: { get: (name) => normalized[name.toLowerCase()] ?? null },
  };
}

afterEach(() => {
  vi.useRealTimers();
});

describe("toGitHubApiError", () => {
  it("accepts a DOM Response without a wrapper", () => {
    // Compile-time check: the API client passes `fetch`'s own Response through.
    const accepts: (response: Response, body: unknown) => GitHubApiError = toGitHubApiError;

    expect(accepts).toBe(toGitHubApiError);
  });

  it("maps 404 to a not-found error", () => {
    const body = { message: "Not Found", documentation_url: "https://docs.github.com/rest" };

    expect(toGitHubApiError(responseOf(404), body)).toEqual({
      code: "not-found",
      message: "That pull request could not be found, or your token cannot see it.",
      status: 404,
    });
  });

  it("maps 410 to not-found, since a deleted resource reads the same to a reviewer", () => {
    const error = toGitHubApiError(responseOf(410), null);

    expect(error.code).toBe("not-found");
  });

  it("maps a 403 permission denial while quota remains", () => {
    const response = responseOf(403, {
      "x-ratelimit-limit": "5000",
      "x-ratelimit-remaining": "4987",
      "x-ratelimit-reset": String(RESET_EPOCH_SECONDS),
    });

    expect(toGitHubApiError(response, buildPermissionErrorPayload())).toEqual({
      code: "permission-denied",
      message: "Your GitHub token does not have access to this repository.",
      status: 403,
    });
  });

  it("keeps 401 distinguishable from 403 so the UI can blame the token", () => {
    const body = buildPermissionErrorPayload({ badCredentials: true });
    const error = toGitHubApiError(responseOf(401), body);

    expect(error).toEqual({
      code: "permission-denied",
      message: "Your GitHub token was rejected. Check that it is valid and has not expired.",
      status: 401,
    });
  });

  it("reads the rate limit headers when the primary quota is exhausted", () => {
    const response = responseOf(403, buildRateLimitHeaders());

    expect(toGitHubApiError(response, buildRateLimitErrorPayload())).toEqual({
      code: "rate-limited",
      message: "The GitHub API rate limit has been exceeded.",
      status: 403,
      rateLimitKind: "primary",
      limit: 5000,
      remaining: 0,
      resetAt: new Date(RESET_ISO),
      retryAfterSeconds: null,
    });
  });

  it("treats a 429 as rate limited even without GitHub's rate limit headers", () => {
    const error = toGitHubApiError(responseOf(429, { "retry-after": "30" }), null);

    expect(error).toEqual({
      code: "rate-limited",
      message: "GitHub applied a secondary rate limit to this request.",
      status: 429,
      rateLimitKind: "secondary",
      limit: null,
      remaining: null,
      resetAt: null,
      retryAfterSeconds: 30,
    });
  });

  it("recognises a secondary rate limit from the body when quota remains", () => {
    const response = responseOf(403, buildRateLimitHeaders({ kind: "secondary" }));
    const error = toGitHubApiError(response, buildRateLimitErrorPayload({ kind: "secondary" }));

    expect(error).toEqual({
      code: "rate-limited",
      message: "GitHub applied a secondary rate limit to this request.",
      status: 403,
      rateLimitKind: "secondary",
      limit: 5000,
      remaining: 4321,
      resetAt: new Date(RESET_ISO),
      retryAfterSeconds: 60,
    });
  });

  it("converts an HTTP-date Retry-After into whole seconds", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-08T11:59:00Z"));
    const response = responseOf(429, { "retry-after": "Thu, 08 Jan 2026 12:00:00 GMT" });

    const error = toGitHubApiError(response, null);

    expect(error.code === "rate-limited" ? error.retryAfterSeconds : null).toBe(60);
  });

  it("clamps a Retry-After date that has already passed", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-08T12:30:00Z"));
    const response = responseOf(429, { "retry-after": "Thu, 08 Jan 2026 12:00:00 GMT" });

    const error = toGitHubApiError(response, null);

    expect(error.code === "rate-limited" ? error.retryAfterSeconds : null).toBe(0);
  });

  it("reports null rather than NaN for unusable rate limit headers", () => {
    const response = responseOf(429, {
      "x-ratelimit-limit": "5000 requests",
      "x-ratelimit-remaining": "",
      "x-ratelimit-reset": "not-a-number",
      "retry-after": "soon",
    });

    expect(toGitHubApiError(response, null)).toEqual({
      code: "rate-limited",
      message: "The GitHub API rate limit has been exceeded.",
      status: 429,
      rateLimitKind: "primary",
      limit: null,
      remaining: null,
      resetAt: null,
      retryAfterSeconds: null,
    });
  });

  it("rejects a zero or negative reset timestamp", () => {
    const response = responseOf(429, { "x-ratelimit-reset": "0" });
    const error = toGitHubApiError(response, null);

    expect(error.code === "rate-limited" ? error.resetAt : "unset").toBeNull();
  });

  it("maps 5xx to an unexpected server error", () => {
    expect(toGitHubApiError(responseOf(502), null)).toEqual({
      code: "server-error",
      message: "GitHub returned an unexpected response.",
      status: 502,
    });
  });

  it("carries the status of a 4xx it does not model, such as 422", () => {
    const error = toGitHubApiError(responseOf(422), { message: "Validation Failed" });

    expect(error).toEqual({
      code: "server-error",
      message: "GitHub returned an unexpected response.",
      status: 422,
    });
  });

  it("does not mistake an unrelated 403 message for a rate limit", () => {
    const body = { message: "Repository access blocked", documentation_url: "" };
    const error = toGitHubApiError(responseOf(403, { "x-ratelimit-remaining": "10" }), body);

    expect(error.code).toBe("permission-denied");
  });
});

describe("token safety", () => {
  const token = "github_pat_11EXAMPLE0aBcDeFgHiJkL_ThisIsNotARealTokenValue";

  const leakyResponses: ReadonlyArray<{ name: string; error: GitHubApiError }> = [
    {
      name: "a body message quoting the token",
      error: toGitHubApiError(responseOf(403), {
        message: `Bad credentials for ${token}`,
        documentation_url: `https://docs.github.com/rest?access_token=${token}`,
      }),
    },
    {
      name: "headers carrying the token",
      error: toGitHubApiError(
        responseOf(429, {
          authorization: `Bearer ${token}`,
          "x-ratelimit-remaining": "0",
          "retry-after": "60",
        }),
        buildRateLimitErrorPayload(),
      ),
    },
    {
      name: "a body that is the token itself",
      error: toGitHubApiError(responseOf(500), token),
    },
    {
      name: "a 404 body quoting the token",
      error: toGitHubApiError(responseOf(404), { message: token }),
    },
  ];

  it.each(leakyResponses)("keeps the token out of the error built from $name", ({ error }) => {
    // plan.md 5.2: no token may reach a message, a field, or a serialized error.
    expect(error.message).not.toContain(token);
    expect(JSON.stringify(error)).not.toContain(token);
    expect(JSON.stringify(error)).not.toContain("Bearer");
  });

  it("never copies a response body or URL into an error", () => {
    const error = toGitHubApiError(responseOf(403), {
      message: "Resource not accessible by personal access token",
      documentation_url: "https://docs.github.com/rest/pulls",
    });

    expect(JSON.stringify(error)).not.toContain("docs.github.com");
    expect(JSON.stringify(error)).not.toContain("personal access token");
  });
});

describe("error constructors", () => {
  it("builds an invalid URL error that carries only the reason", () => {
    expect(invalidUrlError("not-a-pull-request")).toEqual({
      code: "invalid-url",
      message: "That is not a valid GitHub pull request URL.",
      reason: "not-a-pull-request",
    });
  });

  it("builds a network failure error with no request detail", () => {
    expect(networkFailureError()).toEqual({
      code: "network-failure",
      message: "The request to GitHub could not be completed. Check your network connection.",
    });
  });

  it("builds a malformed response error, defaulting the optional detail", () => {
    expect(malformedResponseError("not-json")).toEqual({
      code: "malformed-response",
      message: "GitHub returned a response this app could not read.",
      status: null,
      reason: "not-json",
      field: null,
    });
  });

  it("keeps the app-side field name a parser was looking for", () => {
    const error = malformedResponseError("missing-field", { field: "head.sha", status: 200 });

    expect(error).toEqual({
      code: "malformed-response",
      message: "GitHub returned a response this app could not read.",
      status: 200,
      reason: "missing-field",
      field: "head.sha",
    });
  });
});

describe("isGitHubApiError", () => {
  it("accepts every error this module produces", () => {
    const produced: GitHubApiError[] = [
      invalidUrlError("empty"),
      networkFailureError(),
      malformedResponseError("unexpected-shape"),
      toGitHubApiError(responseOf(404), null),
      toGitHubApiError(responseOf(403), null),
      toGitHubApiError(responseOf(429), null),
      toGitHubApiError(responseOf(500), null),
    ];

    expect(produced.every(isGitHubApiError)).toBe(true);
  });

  const rejected: unknown[] = [
    null,
    undefined,
    "not-found",
    404,
    {},
    // A plausible shape with an unknown code, and one missing its message.
    { code: "boom", message: "x" },
    { code: "not-found" },
  ];

  it.each(rejected)("rejects %o", (value) => {
    expect(isGitHubApiError(value)).toBe(false);
  });
});

describe("isRetryableError", () => {
  it("offers a retry for transient failures", () => {
    expect(isRetryableError(networkFailureError())).toBe(true);
    expect(isRetryableError(toGitHubApiError(responseOf(500), null))).toBe(true);
    expect(isRetryableError(toGitHubApiError(responseOf(429), null))).toBe(true);
  });

  it("does not offer a retry where the request itself is the problem", () => {
    expect(isRetryableError(invalidUrlError("unsupported-host"))).toBe(false);
    expect(isRetryableError(malformedResponseError("not-json"))).toBe(false);
    expect(isRetryableError(toGitHubApiError(responseOf(404), null))).toBe(false);
    expect(isRetryableError(toGitHubApiError(responseOf(403), null))).toBe(false);
  });
});
