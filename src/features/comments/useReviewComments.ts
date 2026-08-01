import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import type { PullRequestRef } from "../../api/types";
import { useToken } from "../auth/TokenContext";
import {
  type CommentThread,
  type IssueComment,
  fetchIssueComments,
  fetchReviewComments,
  groupIntoThreads,
} from "./fetchReviewComments";
import {
  type NewComment,
  type ReviewEvent,
  addPendingComment,
  ensurePendingReview,
  postImmediateComment,
  replyToComment,
  submitReview,
} from "./submitReview";

/**
 * Reading and writing review conversations from the UI (plan.md 4.8, 4.9).
 *
 * Every write refetches the threads afterwards rather than guessing what the
 * server now holds, and none of them retries (plan.md 3.2).
 */

export function reviewCommentsQueryKey(ref: PullRequestRef) {
  return ["review-comments", ref.owner, ref.repository, ref.number] as const;
}

export type ConversationData = {
  threads: CommentThread[];
  issueComments: IssueComment[];
};

export function useReviewComments(ref: PullRequestRef | null) {
  const { client } = useToken();

  return useQuery<ConversationData>({
    queryKey: ref ? reviewCommentsQueryKey(ref) : ["review-comments", "none"],
    enabled: client !== null && ref !== null,
    queryFn: async ({ signal }) => {
      if (!client || !ref) throw new Error("useReviewComments ran without a client or ref");
      const [comments, issueComments] = await Promise.all([
        fetchReviewComments(client, ref, signal),
        fetchIssueComments(client, ref, signal),
      ]);
      return { threads: groupIntoThreads(comments), issueComments };
    },
  });
}

export type CommentActions = {
  reply: (inReplyToId: number, body: string) => Promise<void>;
  postNow: (comment: NewComment) => Promise<void>;
  addToPending: (comment: NewComment) => Promise<void>;
  submit: (event: ReviewEvent, body: string) => Promise<void>;
  isBusy: boolean;
  lastError: unknown;
};

/**
 * The write actions, all disabled without the capability to use them.
 *
 * plan.md 4.9 requires every write surface off in read-only mode, so the caller
 * passes `canWrite` and gets actions that refuse rather than failing at GitHub.
 */
export function useCommentActions(
  ref: PullRequestRef | null,
  headSha: string | null,
  viewerLogin: string | null,
  canWrite: boolean,
): CommentActions {
  const { client } = useToken();
  const queryClient = useQueryClient();

  const refresh = () => {
    if (ref) void queryClient.invalidateQueries({ queryKey: reviewCommentsQueryKey(ref) });
  };

  const require = () => {
    if (!client || !ref || !canWrite) {
      throw new Error("This token cannot write to the repository.");
    }
    return { client, ref };
  };

  const mutation = useMutation({
    retry: false,
    mutationFn: async (task: () => Promise<void>) => task(),
    onSettled: refresh,
  });

  const run = (task: () => Promise<void>) => mutation.mutateAsync(task).then(() => undefined);

  return {
    reply: (inReplyToId, body) =>
      run(async () => {
        const { client: c, ref: r } = require();
        await replyToComment(c, r, inReplyToId, body);
      }),

    postNow: (comment) =>
      run(async () => {
        const { client: c, ref: r } = require();
        if (headSha === null) throw new Error("The head commit is not known yet.");
        await postImmediateComment(c, r, headSha, comment);
      }),

    addToPending: (comment) =>
      run(async () => {
        const { client: c, ref: r } = require();
        if (headSha === null) throw new Error("The head commit is not known yet.");
        if (viewerLogin === null) throw new Error("The signed-in account is not known yet.");
        // plan.md 4.9: reuse the one pending review GitHub allows per user.
        const review = await ensurePendingReview(c, r, viewerLogin);
        await addPendingComment(c, r, review.id, headSha, comment);
      }),

    submit: (event, body) =>
      run(async () => {
        const { client: c, ref: r } = require();
        if (viewerLogin === null) throw new Error("The signed-in account is not known yet.");
        const review = await ensurePendingReview(c, r, viewerLogin);
        await submitReview(c, r, review.id, event, body);
      }),

    isBusy: mutation.isPending,
    lastError: mutation.error,
  };
}
