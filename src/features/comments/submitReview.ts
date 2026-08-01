import { type GitHubClient, asGitHubApiError } from "../../api/client";
import type { PullRequestRef } from "../../api/types";
import type { DiffSide } from "../diff/patchPositions";

/**
 * Writing comments and reviews (plan.md 4.9).
 *
 * Nothing here retries. plan.md 3.2 and 6 forbid it: a retried comment posts
 * twice, and the user cannot tell the difference from a failure.
 */

export type ReviewEvent = "COMMENT" | "APPROVE" | "REQUEST_CHANGES";

export type NewComment = {
  path: string;
  /** Line number on the given side, per plan.md 4.9's line/side model. */
  line: number;
  side: DiffSide;
  /** Set together with `line` for a multi-line comment. */
  startLine?: number;
  startSide?: DiffSide;
  body: string;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const isRecordArray = (value: unknown): value is Record<string, unknown>[] =>
  Array.isArray(value) && value.every(isRecord);

function pullsPath(ref: PullRequestRef): string {
  return `/repos/${encodeURIComponent(ref.owner)}/${encodeURIComponent(ref.repository)}/pulls/${ref.number}`;
}

/**
 * plan.md 4.9: `position` is deprecated, so a new comment is placed with
 * `commit_id`, `path`, `line`, and `side`.
 */
function commentBody(comment: NewComment, headSha: string): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    commit_id: headSha,
    path: comment.path,
    line: comment.line,
    side: comment.side,
    body: comment.body,
  };
  if (comment.startLine !== undefined) {
    payload.start_line = comment.startLine;
    payload.start_side = comment.startSide ?? comment.side;
  }
  return payload;
}

/** A single comment posted immediately, outside any pending review. */
export async function postImmediateComment(
  client: GitHubClient,
  ref: PullRequestRef,
  headSha: string,
  comment: NewComment,
  signal?: AbortSignal,
): Promise<number> {
  const created = await client.requestJson(`${pullsPath(ref)}/comments`, isRecord, {
    method: "POST",
    body: commentBody(comment, headSha),
    signal,
  });
  return typeof created.id === "number" ? created.id : 0;
}

/** A reply to an existing thread (plan.md 4.8). */
export async function replyToComment(
  client: GitHubClient,
  ref: PullRequestRef,
  inReplyToId: number,
  body: string,
  signal?: AbortSignal,
): Promise<number> {
  const created = await client.requestJson(
    `${pullsPath(ref)}/comments/${inReplyToId}/replies`,
    isRecord,
    { method: "POST", body: { body }, signal },
  );
  return typeof created.id === "number" ? created.id : 0;
}

export type PendingReview = {
  id: number;
  body: string;
};

/**
 * Finds this user's existing pending review.
 *
 * GitHub allows only one per user per pull request, so plan.md 4.9 requires
 * looking before creating: a second create fails, and the comments already
 * gathered would be stranded.
 */
export async function findPendingReview(
  client: GitHubClient,
  ref: PullRequestRef,
  viewerLogin: string,
  signal?: AbortSignal,
): Promise<PendingReview | null> {
  const reviews = await client.requestAllPages(`${pullsPath(ref)}/reviews`, isRecordArray, {
    signal,
  });

  for (const review of reviews) {
    if (review.state !== "PENDING") continue;
    const user = isRecord(review.user) ? review.user : null;
    if (user?.login !== viewerLogin) continue;
    if (typeof review.id !== "number") continue;
    return { id: review.id, body: typeof review.body === "string" ? review.body : "" };
  }

  return null;
}

/**
 * Returns the pending review to add comments to, creating one only when the
 * user has none.
 *
 * plan.md 4.9: a 422 here means another tab or an earlier attempt already
 * created one, so the list is re-read rather than surfacing an error the user
 * cannot act on.
 */
export async function ensurePendingReview(
  client: GitHubClient,
  ref: PullRequestRef,
  viewerLogin: string,
  signal?: AbortSignal,
): Promise<PendingReview> {
  const existing = await findPendingReview(client, ref, viewerLogin, signal);
  if (existing) return existing;

  try {
    const created = await client.requestJson(`${pullsPath(ref)}/reviews`, isRecord, {
      method: "POST",
      // No `event` means the review stays pending.
      body: {},
      signal,
    });
    if (typeof created.id === "number") return { id: created.id, body: "" };
  } catch (error) {
    const apiError = asGitHubApiError(error);
    // Only a 422 is worth recovering from; anything else is a real failure.
    const isAlreadyExists = apiError?.code === "server-error" && apiError.status === 422;
    if (!isAlreadyExists) throw error;
  }

  const recovered = await findPendingReview(client, ref, viewerLogin, signal);
  if (recovered) return recovered;
  throw new Error("GitHub reported a pending review already exists, but it could not be read.");
}

/** Adds one comment to a pending review. */
export async function addPendingComment(
  client: GitHubClient,
  ref: PullRequestRef,
  reviewId: number,
  headSha: string,
  comment: NewComment,
  signal?: AbortSignal,
): Promise<void> {
  await client.requestJson(`${pullsPath(ref)}/reviews/${reviewId}/comments`, isRecord, {
    method: "POST",
    body: commentBody(comment, headSha),
    signal,
  });
}

/** Submits the pending review with its verdict (plan.md 4.9). */
export async function submitReview(
  client: GitHubClient,
  ref: PullRequestRef,
  reviewId: number,
  event: ReviewEvent,
  body: string,
  signal?: AbortSignal,
): Promise<void> {
  await client.requestJson(`${pullsPath(ref)}/reviews/${reviewId}/events`, isRecord, {
    method: "POST",
    body: { event, body },
    signal,
  });
}

/** The comments GitHub is already holding in a pending review (plan.md 4.9). */
export async function fetchPendingComments(
  client: GitHubClient,
  ref: PullRequestRef,
  reviewId: number,
  signal?: AbortSignal,
): Promise<Array<{ id: number; path: string; line: number | null; body: string }>> {
  const raw = await client.requestAllPages(
    `${pullsPath(ref)}/reviews/${reviewId}/comments`,
    isRecordArray,
    { signal },
  );

  const comments = [];
  for (const item of raw) {
    if (typeof item.id !== "number" || typeof item.path !== "string") continue;
    comments.push({
      id: item.id,
      path: item.path,
      line: typeof item.line === "number" ? item.line : null,
      body: typeof item.body === "string" ? item.body : "",
    });
  }
  return comments;
}
