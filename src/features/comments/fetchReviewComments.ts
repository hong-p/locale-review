import type { GitHubClient } from "../../api/client";
import type { GitHubUserRef, PullRequestRef } from "../../api/types";
import type { DiffSide } from "../diff/patchPositions";

/**
 * Existing review conversations (plan.md 4.8).
 *
 * The `full` media type returns the raw body and GitHub's rendered HTML in one
 * response, so the app can display the rendered form and still edit or quote
 * the original.
 */

export type ReviewComment = {
  id: number;
  /** The comment this one replies to, when it is part of a thread. */
  inReplyToId: number | null;
  path: string;
  /** Null once the diff moved past it — GitHub calls that outdated. */
  line: number | null;
  side: DiffSide;
  author: GitHubUserRef | null;
  createdAt: string;
  /** Markdown, for editing and copying (plan.md 4.8). */
  body: string;
  /** GitHub's rendered HTML, re-sanitised before display. */
  bodyHtml: string;
  htmlUrl: string;
  outdated: boolean;
};

export type IssueComment = {
  id: number;
  author: GitHubUserRef | null;
  createdAt: string;
  body: string;
  bodyHtml: string;
  htmlUrl: string;
};

/**
 * A submitted review's summary body (plan.md 4.8).
 *
 * These are separate from issue comments: a review carries its own body next
 * to a verdict, and GitHub shows both in one conversation. Fetching only issue
 * comments left every "left a comment" review invisible.
 */
export type ReviewSummary = {
  id: number;
  author: GitHubUserRef | null;
  submittedAt: string;
  state: "COMMENTED" | "APPROVED" | "CHANGES_REQUESTED" | "DISMISSED";
  body: string;
  bodyHtml: string;
  htmlUrl: string;
};

export type CommentThread = {
  rootId: number;
  path: string;
  line: number | null;
  side: DiffSide;
  outdated: boolean;
  comments: ReviewComment[];
};

const isRecordArray = (value: unknown): value is Record<string, unknown>[] =>
  Array.isArray(value) && value.every((item) => typeof item === "object" && item !== null);

const asString = (value: unknown): string | null =>
  typeof value === "string" && value !== "" ? value : null;

function toUser(value: unknown): GitHubUserRef | null {
  if (typeof value !== "object" || value === null) return null;
  const login = asString((value as { login?: unknown }).login);
  if (login === null) return null;
  return {
    login,
    avatarUrl: asString((value as { avatar_url?: unknown }).avatar_url),
    htmlUrl: asString((value as { html_url?: unknown }).html_url),
  };
}

export async function fetchReviewComments(
  client: GitHubClient,
  ref: PullRequestRef,
  signal?: AbortSignal,
): Promise<ReviewComment[]> {
  const raw = await client.requestAllPages(
    `/repos/${encodeURIComponent(ref.owner)}/${encodeURIComponent(ref.repository)}/pulls/${ref.number}/comments`,
    isRecordArray,
    { signal, accept: "application/vnd.github.full+json" },
  );

  const comments: ReviewComment[] = [];
  for (const item of raw) {
    const id = typeof item.id === "number" ? item.id : null;
    const path = asString(item.path);
    if (id === null || path === null) continue;

    // GitHub nulls `line` once the diff has moved past the comment, which is
    // exactly what outdated means (plan.md 4.8).
    const line = typeof item.line === "number" ? item.line : null;

    comments.push({
      id,
      inReplyToId: typeof item.in_reply_to_id === "number" ? item.in_reply_to_id : null,
      path,
      line,
      side: item.side === "LEFT" ? "LEFT" : "RIGHT",
      author: toUser(item.user),
      createdAt: asString(item.created_at) ?? "",
      body: asString(item.body) ?? "",
      bodyHtml: asString(item.body_html) ?? "",
      htmlUrl: asString(item.html_url) ?? "",
      outdated: line === null,
    });
  }

  return comments;
}

/** Overall review comments, which hang off the pull request rather than a line. */
export async function fetchIssueComments(
  client: GitHubClient,
  ref: PullRequestRef,
  signal?: AbortSignal,
): Promise<IssueComment[]> {
  const raw = await client.requestAllPages(
    `/repos/${encodeURIComponent(ref.owner)}/${encodeURIComponent(ref.repository)}/issues/${ref.number}/comments`,
    isRecordArray,
    { signal, accept: "application/vnd.github.full+json" },
  );

  const comments: IssueComment[] = [];
  for (const item of raw) {
    const id = typeof item.id === "number" ? item.id : null;
    if (id === null) continue;
    comments.push({
      id,
      author: toUser(item.user),
      createdAt: asString(item.created_at) ?? "",
      body: asString(item.body) ?? "",
      bodyHtml: asString(item.body_html) ?? "",
      htmlUrl: asString(item.html_url) ?? "",
    });
  }

  return comments;
}

/**
 * Submitted reviews that carry a summary body or a verdict.
 *
 * A review with neither is the envelope GitHub creates around inline comments
 * and has nothing to show on its own, so it is dropped. A PENDING review is
 * the viewer's own unsubmitted draft and is not part of the conversation.
 */
export async function fetchReviewSummaries(
  client: GitHubClient,
  ref: PullRequestRef,
  signal?: AbortSignal,
): Promise<ReviewSummary[]> {
  const raw = await client.requestAllPages(
    `/repos/${encodeURIComponent(ref.owner)}/${encodeURIComponent(ref.repository)}/pulls/${ref.number}/reviews`,
    isRecordArray,
    { signal, accept: "application/vnd.github.full+json" },
  );

  const reviews: ReviewSummary[] = [];
  for (const item of raw) {
    const id = typeof item.id === "number" ? item.id : null;
    if (id === null) continue;

    const state = toReviewState(item.state);
    if (state === null) continue;

    const body = asString(item.body) ?? "";
    if (body === "" && state === "COMMENTED") continue;

    reviews.push({
      id,
      author: toUser(item.user),
      submittedAt: asString(item.submitted_at) ?? "",
      state,
      body,
      bodyHtml: asString(item.body_html) ?? "",
      htmlUrl: asString(item.html_url) ?? "",
    });
  }

  return reviews;
}

function toReviewState(value: unknown): ReviewSummary["state"] | null {
  switch (value) {
    case "COMMENTED":
    case "APPROVED":
    case "CHANGES_REQUESTED":
    case "DISMISSED":
      return value;
    // PENDING is the viewer's own unsubmitted draft, not conversation.
    default:
      return null;
  }
}

/**
 * Groups comments into threads.
 *
 * A reply carries `in_reply_to_id` pointing at the thread's first comment, so
 * grouping by that identifies a conversation. A reply whose root is missing —
 * deleted, or beyond a page we did not fetch — becomes its own thread rather
 * than being dropped.
 */
export function groupIntoThreads(comments: readonly ReviewComment[]): CommentThread[] {
  const byId = new Map(comments.map((comment) => [comment.id, comment]));
  const threads = new Map<number, CommentThread>();

  const ordered = [...comments].sort((a, b) => a.createdAt.localeCompare(b.createdAt));

  for (const comment of ordered) {
    const rootId =
      comment.inReplyToId !== null && byId.has(comment.inReplyToId)
        ? comment.inReplyToId
        : comment.id;

    const existing = threads.get(rootId);
    if (existing) {
      existing.comments.push(comment);
      continue;
    }

    threads.set(rootId, {
      rootId,
      path: comment.path,
      line: comment.line,
      side: comment.side,
      outdated: comment.outdated,
      comments: [comment],
    });
  }

  return [...threads.values()];
}

/** The threads anchored to one file, for the viewer to place beside its lines. */
export function threadsForFile(threads: readonly CommentThread[], path: string): CommentThread[] {
  return threads.filter((thread) => thread.path === path);
}
