import { type GitHubClient, asGitHubApiError } from "../../api/client";
import type { GitHubApiError } from "../../api/errors";
import type { GitHubUserRef } from "../../api/types";

/**
 * Validating a token and reporting what it can actually do (plan.md 5.1).
 *
 * plan.md 5.1 forbids inferring capability from a token's prefix, so everything
 * here is decided by a real API response. Capability is data rather than a
 * boolean because a token can be valid, able to read a repository, and still
 * unable to submit a review — and plan.md requires the reason to be shown.
 */

export type ConnectionResult =
  | { state: "authenticated"; user: GitHubUserRef }
  | { state: "invalid-token"; error: GitHubApiError };

export type ReviewCapability = "read" | "comment" | "review" | "viewed";

export type RepositoryAccess =
  | {
      state: "accessible";
      isPrivate: boolean;
      /** Readonly: a caller must never widen what a token may do. */
      capabilities: readonly ReviewCapability[];
      canWrite: boolean;
    }
  /**
   * GitHub answers 404 for a repository that does not exist and for one the
   * token cannot see, deliberately. plan.md 4.1 keeps them as one state rather
   * than guessing which it was.
   */
  | { state: "not-found" }
  | { state: "forbidden"; error: GitHubApiError }
  | { state: "failed"; error: GitHubApiError };

/** plan.md 4.1: every write surface is disabled without repository write access. */
export const READ_ONLY_CAPABILITIES: readonly ReviewCapability[] = ["read"];

const isUserPayload = (
  value: unknown,
): value is { login: string; avatar_url?: unknown; html_url?: unknown } =>
  typeof value === "object" &&
  value !== null &&
  "login" in value &&
  typeof (value as { login: unknown }).login === "string";

const asStringOrNull = (value: unknown): string | null =>
  typeof value === "string" && value !== "" ? value : null;

type RepositoryPayload = {
  private?: unknown;
  permissions?: unknown;
};

const isRepositoryPayload = (value: unknown): value is RepositoryPayload =>
  typeof value === "object" && value !== null;

/**
 * Whether the caller can push code to the repository.
 *
 * This is NOT what gates reviewing. GitHub lets anyone with read access
 * comment on, approve, and request changes to a pull request, and Viewed is a
 * per-user state that only needs read. Push access is reported because it is
 * worth showing, not because the review surface depends on it.
 */
function readPushPermission(payload: RepositoryPayload): boolean {
  const { permissions } = payload;
  if (typeof permissions !== "object" || permissions === null) return false;
  const push = (permissions as { push?: unknown }).push;
  const maintain = (permissions as { maintain?: unknown }).maintain;
  const admin = (permissions as { admin?: unknown }).admin;
  return push === true || maintain === true || admin === true;
}

/**
 * Confirms the token is usable and reports who it belongs to (plan.md 5.1's
 * `Test connection`).
 */
export async function testConnection(
  client: GitHubClient,
  signal?: AbortSignal,
): Promise<ConnectionResult> {
  try {
    const payload = await client.requestJson("/user", isUserPayload, { signal });
    return {
      state: "authenticated",
      user: {
        login: payload.login,
        avatarUrl: asStringOrNull(payload.avatar_url),
        htmlUrl: asStringOrNull(payload.html_url),
      },
    };
  } catch (error) {
    const apiError = asGitHubApiError(error);
    if (!apiError) throw error;
    return { state: "invalid-token", error: apiError };
  }
}

/**
 * Reports what the token may do in one repository.
 *
 * plan.md 10 forbids presenting a permission failure as success, so a failure
 * that is neither "missing" nor "forbidden" surfaces as its own state instead
 * of collapsing into read-only.
 */
export async function checkRepositoryAccess(
  client: GitHubClient,
  owner: string,
  repository: string,
  signal?: AbortSignal,
): Promise<RepositoryAccess> {
  try {
    const payload = await client.requestJson(
      `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repository)}`,
      isRepositoryPayload,
      { signal },
    );

    // Reaching the repository at all means read access, and read access is
    // enough to review: GitHub allows commenting, approving, and requesting
    // changes without push, which is how open-source review works. Viewed is a
    // per-user state on the same footing.
    //
    // Whether the *token* was granted Pull requests: write cannot be read
    // ahead of time for a fine-grained token, so the surface stays available
    // and a refused write reports itself (plan.md 10 forbids the reverse:
    // presenting a failure as success).
    return {
      state: "accessible",
      isPrivate: payload.private === true,
      canWrite: readPushPermission(payload),
      capabilities: ["read", "comment", "review", "viewed"],
    };
  } catch (error) {
    const apiError = asGitHubApiError(error);
    if (!apiError) throw error;
    if (apiError.code === "not-found") return { state: "not-found" };
    if (apiError.code === "permission-denied") return { state: "forbidden", error: apiError };
    return { state: "failed", error: apiError };
  }
}

export function hasCapability(
  access: RepositoryAccess | null,
  capability: ReviewCapability,
): boolean {
  if (access === null || access.state !== "accessible") return false;
  return access.capabilities.includes(capability);
}
