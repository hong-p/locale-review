import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import type { PullRequestRef } from "../../api/types";
import { useToken } from "../auth/TokenContext";
import { type ViewedSnapshot, fetchViewedState, setFileViewed, toViewedMap } from "./viewedState";

/**
 * Viewed state as the UI consumes it (plan.md 4.7).
 *
 * GitHub owns the state, so a toggle refetches rather than writing to a local
 * copy: plan.md 4.7 forbids a shadow implementation, and a failed mutation must
 * leave the checkbox showing what GitHub actually has.
 */

export function viewedQueryKey(ref: PullRequestRef) {
  return ["viewed", ref.owner, ref.repository, ref.number] as const;
}

export type ViewedController = {
  states: ReadonlyMap<string, "VIEWED" | "UNVIEWED" | "DISMISSED">;
  /** Null while loading, or when the token cannot use the GraphQL API. */
  pullRequestId: string | null;
  isLoading: boolean;
  /** Null when Viewed is unavailable, which disables the control (plan.md 4.7). */
  toggle: ((path: string, viewed: boolean) => void) | null;
  isMutating: boolean;
  error: unknown;
};

export function useViewedState(ref: PullRequestRef | null, enabled: boolean): ViewedController {
  const { client } = useToken();
  const queryClient = useQueryClient();
  const active = client !== null && ref !== null && enabled;

  const query = useQuery<ViewedSnapshot>({
    queryKey: ref ? viewedQueryKey(ref) : ["viewed", "none"],
    enabled: active,
    queryFn: ({ signal }) => {
      if (!client || !ref) throw new Error("useViewedState ran without a client or ref");
      return fetchViewedState(client, ref, signal);
    },
  });

  const mutation = useMutation({
    // plan.md 3.2: never retry a mutation.
    retry: false,
    mutationFn: async ({ path, viewed }: { path: string; viewed: boolean }) => {
      if (!client || !query.data?.pullRequestId) {
        throw new Error("Viewed cannot be changed without a pull request id");
      }
      await setFileViewed(client, query.data.pullRequestId, path, viewed);
    },
    onSettled: () => {
      // Refetch rather than patching a local copy: GitHub is the record, and a
      // failed write must not leave the checkbox lying.
      if (ref) void queryClient.invalidateQueries({ queryKey: viewedQueryKey(ref) });
    },
  });

  const canToggle = active && Boolean(query.data?.pullRequestId);

  return {
    states: toViewedMap(query.data?.files ?? []),
    pullRequestId: query.data?.pullRequestId ?? null,
    isLoading: query.isPending && query.fetchStatus !== "idle",
    toggle: canToggle ? (path, viewed) => mutation.mutate({ path, viewed }) : null,
    isMutating: mutation.isPending,
    error: query.error ?? mutation.error ?? null,
  };
}
