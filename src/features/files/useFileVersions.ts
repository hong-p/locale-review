import { useQueries, useQuery } from "@tanstack/react-query";

import type { PullRequestDiffBase, PullRequestRef } from "../../api/types";
import { useToken } from "../auth/TokenContext";
import { fetchChangedFiles } from "./fetchChangedFiles";
import type { ChangedFilesResult } from "./fetchChangedFiles";
import { type FileContent, fetchWithFallback } from "./fetchFileContent";
import type { FileVersionRef, TranslationFile } from "./translationFileModel";

/**
 * Query wiring for the file list and for one file's three versions.
 *
 * plan.md 4.6 requires that opening a pull request does not fetch every file's
 * contents: the list loads, and content follows only for the file the reviewer
 * selected. TanStack Query's own signal handles the cancellation plan.md 3.4
 * asks for when the selection changes.
 */

export function changedFilesQueryKey(ref: PullRequestRef) {
  return ["changed-files", ref.owner, ref.repository, ref.number] as const;
}

/**
 * plan.md 3.2 and 4.6: the key carries the commit, so a new head SHA is a
 * different entry rather than a stale hit that needs manual invalidation.
 */
export function fileVersionQueryKey(version: FileVersionRef) {
  return ["file-content", version.repositoryFullName, version.ref, version.path] as const;
}

export function useChangedFiles(ref: PullRequestRef | null) {
  const { client } = useToken();

  return useQuery<ChangedFilesResult>({
    queryKey: ref ? changedFilesQueryKey(ref) : ["changed-files", "none"],
    enabled: client !== null && ref !== null,
    queryFn: ({ signal }) => {
      if (!client || !ref) throw new Error("useChangedFiles ran without a client or ref");
      return fetchChangedFiles(client, ref, signal);
    },
  });
}

export type FileVersionsResult = {
  source: FileContent | undefined;
  before: FileContent | undefined;
  after: FileContent | undefined;
  isLoading: boolean;
  error: unknown;
};

/**
 * The candidates to try for one version, in the order plan.md 4.5 defines.
 *
 * The head version of a fork pull request whose fork is gone is retried against
 * the base repository, where the commit remains reachable.
 */
export function versionCandidates(
  version: FileVersionRef | null,
  diffBase: PullRequestDiffBase,
): FileVersionRef[] {
  if (version === null) return [];
  if (version.repositoryFullName === diffBase.baseRepositoryFullName) return [version];
  return [version, { ...version, repositoryFullName: diffBase.baseRepositoryFullName }];
}

/**
 * Loads the three versions of the selected file.
 *
 * A null file means nothing is selected, and nothing is fetched.
 */
export function useFileVersions(
  file: TranslationFile | null,
  diffBase: PullRequestDiffBase | null,
): FileVersionsResult {
  const { client } = useToken();
  const enabled = client !== null && file !== null && diffBase !== null;

  const versions: Array<{ slot: "source" | "before" | "after"; ref: FileVersionRef | null }> = [
    { slot: "source", ref: file?.source ?? null },
    { slot: "before", ref: file?.before ?? null },
    { slot: "after", ref: file?.after ?? null },
  ];

  const results = useQueries({
    queries: versions.map(({ slot, ref }) => ({
      queryKey: ref
        ? fileVersionQueryKey(ref)
        : (["file-content", "absent", file?.id ?? "none", slot] as const),
      enabled: enabled && ref !== null,
      // Content at a fixed commit cannot change, so it never goes stale.
      staleTime: Number.POSITIVE_INFINITY,
      queryFn: async ({ signal }: { signal: AbortSignal }): Promise<FileContent> => {
        if (!client || !ref || !diffBase) {
          throw new Error("useFileVersions ran without a client, ref, or diff base");
        }
        return fetchWithFallback(client, versionCandidates(ref, diffBase), signal);
      },
    })),
  });

  const [source, before, after] = results;

  /** A null version is not missing data; it is a state the model already decided. */
  const resolve = (index: number, ref: FileVersionRef | null): FileContent | undefined => {
    if (ref === null) return file === null ? undefined : { state: "absent" };
    return results[index].data;
  };

  return {
    source: resolve(0, versions[0].ref),
    before: resolve(1, versions[1].ref),
    after: resolve(2, versions[2].ref),
    isLoading: [source, before, after].some((result) => result.isPending && result.isFetching),
    error: [source, before, after].find((result) => result.error)?.error ?? null,
  };
}
