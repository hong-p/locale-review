import { describe, expect, it } from "vitest";

import { GitHubRequestError } from "../../api/client";
import { messages } from "../../messages/en";
import { writeFailureMessage } from "./writeFailureMessage";

const FALLBACK = "It did not work.";

describe("writeFailureMessage", () => {
  it("names the token that can write for a refusal", () => {
    // The case a reviewer actually hits on someone else's public repository.
    const error = new GitHubRequestError({
      code: "permission-denied",
      message: "refused",
      status: 403,
    });

    const message = writeFailureMessage(error, FALLBACK);

    expect(message).toMatch(/classic token/i);
    expect(message).toMatch(/public_repo/i);
  });

  it("tells a rejected token apart from a refused action", () => {
    const rejected = new GitHubRequestError({
      code: "permission-denied",
      message: "rejected",
      status: 401,
    });

    expect(writeFailureMessage(rejected, FALLBACK)).toBe(messages.loadErrors.tokenRejectedBody);
  });

  it("passes through a rate limit and a network failure", () => {
    for (const error of [
      new GitHubRequestError({
        code: "rate-limited",
        message: "slow down",
        status: 403,
        rateLimitKind: "primary",
        limit: null,
        remaining: null,
        resetAt: null,
        retryAfterSeconds: null,
      }),
      new GitHubRequestError({ code: "network-failure", message: "no network" }),
    ]) {
      expect(writeFailureMessage(error, FALLBACK)).not.toBe(FALLBACK);
    }
  });

  it("falls back for something it does not recognise", () => {
    expect(writeFailureMessage(new Error("boom"), FALLBACK)).toBe(FALLBACK);
    expect(writeFailureMessage(undefined, FALLBACK)).toBe(FALLBACK);
  });
});
