import { useQuery } from "@tanstack/react-query";

import { asGitHubApiError } from "../../api/client";
import type { GitHubApiError } from "../../api/errors";
import type { PullRequestRef } from "../../api/types";
import { useToken } from "../auth/TokenContext";
import { type LoadedPullRequest, fetchPullRequest } from "./fetchPullRequest";

/**
 * plan.md 3.2: the key carries everything cache correctness depends on. The
 * merge base and head SHA are not known until the request returns, so they
 * cannot be part of this key; the file-level queries in phase 2 key on the diff
 * base that this query produces.
 */
export function pullRequestQueryKey(ref: PullRequestRef) {
  return ["pull-request", ref.owner, ref.repository, ref.number] as const;
}

export type PullRequestQueryResult = {
  data: LoadedPullRequest | undefined;
  error: GitHubApiError | null;
  /** True when the failure is not one the normalized model recognises. */
  unknownError: boolean;
  isLoading: boolean;
  refetch: () => void;
};

export function usePullRequest(ref: PullRequestRef | null): PullRequestQueryResult {
  const { client } = useToken();

  const query = useQuery({
    queryKey: ref ? pullRequestQueryKey(ref) : ["pull-request", "none"],
    // plan.md 4.1: without a token, or without a valid ref, nothing is fetched.
    enabled: client !== null && ref !== null,
    queryFn: ({ signal }) => {
      if (!client || !ref) throw new Error("usePullRequest ran without a client or ref");
      return fetchPullRequest(client, ref, signal);
    },
    // A permission or rate limit failure will not resolve by asking again, and
    // retrying a rate limit only makes it worse.
    retry: (failureCount, error) => {
      const apiError = asGitHubApiError(error);
      if (apiError && apiError.code !== "network-failure" && apiError.code !== "server-error") {
        return false;
      }
      return failureCount < 1;
    },
  });

  const apiError = query.error ? asGitHubApiError(query.error) : null;

  return {
    data: query.data,
    error: apiError,
    unknownError: Boolean(query.error) && apiError === null,
    isLoading: query.isPending && query.fetchStatus !== "idle",
    refetch: () => {
      void query.refetch();
    },
  };
}
