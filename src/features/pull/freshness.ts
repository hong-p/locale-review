import type { GitHubClient } from "../../api/client";
import type { PullRequestRef } from "../../api/types";

/**
 * Noticing that GitHub moved on (plan.md 4.10).
 *
 * plan.md 4.10 rules out polling and rules out replacing data underneath the
 * reviewer. Returning to the tab performs one cheap check, and anything that
 * changed becomes a banner the reviewer chooses to act on.
 */

export type FreshnessSnapshot = {
  headSha: string;
  /** Bumps whenever a review or a review comment is added or edited. */
  reviewMarker: string;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

/**
 * One request, reading only what decides whether anything changed.
 *
 * `updated_at` moves on any edit to the pull request, which is a superset of
 * what matters here; the head SHA catches a new commit specifically.
 */
export async function fetchFreshness(
  client: GitHubClient,
  ref: PullRequestRef,
  signal?: AbortSignal,
): Promise<FreshnessSnapshot> {
  const payload = await client.requestJson(
    `/repos/${encodeURIComponent(ref.owner)}/${encodeURIComponent(ref.repository)}/pulls/${ref.number}`,
    isRecord,
    { signal },
  );

  const head = isRecord(payload.head) ? payload.head : null;

  return {
    headSha: typeof head?.sha === "string" ? head.sha : "",
    reviewMarker: typeof payload.updated_at === "string" ? payload.updated_at : "",
  };
}

export function hasChanged(previous: FreshnessSnapshot, current: FreshnessSnapshot): boolean {
  // An empty snapshot means the check failed; a failed check is not a change.
  if (current.headSha === "" && current.reviewMarker === "") return false;
  return previous.headSha !== current.headSha || previous.reviewMarker !== current.reviewMarker;
}

/**
 * Runs `check` when the tab becomes visible again.
 *
 * plan.md 4.10 asks for this rather than an interval, so a tab left open
 * overnight costs nothing.
 */
export function onTabVisible(check: () => void): () => void {
  const handler = () => {
    if (document.visibilityState === "visible") check();
  };
  document.addEventListener("visibilitychange", handler);
  return () => document.removeEventListener("visibilitychange", handler);
}
