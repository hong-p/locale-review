import type { GitHubClient } from "../../api/client";
import type { PullRequestRef } from "../../api/types";

/**
 * Viewed state, read from and written to GitHub (plan.md 4.7).
 *
 * plan.md 4.7 forbids a separate local implementation: the reviewer's Viewed
 * marks belong to GitHub, so this app reads and writes the real thing and never
 * keeps a shadow copy.
 */

export type ViewedState = "VIEWED" | "UNVIEWED" | "DISMISSED";

export type ViewedFile = {
  path: string;
  state: ViewedState;
};

const FILES_QUERY = `
  query ViewedFiles($owner: String!, $repo: String!, $number: Int!, $cursor: String) {
    repository(owner: $owner, name: $repo) {
      pullRequest(number: $number) {
        id
        files(first: 100, after: $cursor) {
          pageInfo { hasNextPage endCursor }
          nodes { path viewerViewedState }
        }
      }
    }
  }
`;

const MARK_MUTATION = `
  mutation MarkViewed($pullRequestId: ID!, $path: String!) {
    markFileAsViewed(input: { pullRequestId: $pullRequestId, path: $path }) {
      clientMutationId
    }
  }
`;

const UNMARK_MUTATION = `
  mutation UnmarkViewed($pullRequestId: ID!, $path: String!) {
    unmarkFileAsViewed(input: { pullRequestId: $pullRequestId, path: $path }) {
      clientMutationId
    }
  }
`;

type FilesPage = {
  repository?: {
    pullRequest?: {
      id?: unknown;
      files?: {
        pageInfo?: { hasNextPage?: unknown; endCursor?: unknown };
        nodes?: unknown;
      };
    } | null;
  } | null;
};

const isFilesPage = (value: unknown): value is FilesPage =>
  typeof value === "object" && value !== null;

const toViewedState = (value: unknown): ViewedState =>
  value === "VIEWED" || value === "DISMISSED" ? value : "UNVIEWED";

export type ViewedSnapshot = {
  /** The pull request node ID, which the mutations require. */
  pullRequestId: string;
  files: ViewedFile[];
};

/**
 * Reads every file's Viewed state.
 *
 * plan.md 3.4 and 6: the connection is cursor-paginated, so a pull request with
 * more than 100 files must be walked to the end rather than silently truncated
 * to its first page.
 */
export async function fetchViewedState(
  client: GitHubClient,
  ref: PullRequestRef,
  signal?: AbortSignal,
): Promise<ViewedSnapshot> {
  const files: ViewedFile[] = [];
  let pullRequestId = "";

  await client.graphqlAllPages<ViewedFile>(async (cursor) => {
    const data = await client.graphql(
      FILES_QUERY,
      { owner: ref.owner, repo: ref.repository, number: ref.number, cursor },
      isFilesPage,
      { signal },
    );

    const pullRequest = data.repository?.pullRequest;
    if (!pullRequest) return { nodes: [], hasNextPage: false, endCursor: null };

    if (typeof pullRequest.id === "string") pullRequestId = pullRequest.id;

    const nodes = Array.isArray(pullRequest.files?.nodes) ? pullRequest.files.nodes : [];
    const page: ViewedFile[] = [];
    for (const node of nodes) {
      if (typeof node !== "object" || node === null) continue;
      const path = (node as { path?: unknown }).path;
      if (typeof path !== "string") continue;
      page.push({
        path,
        state: toViewedState((node as { viewerViewedState?: unknown }).viewerViewedState),
      });
    }

    files.push(...page);
    const info = pullRequest.files?.pageInfo;
    return {
      nodes: page,
      hasNextPage: info?.hasNextPage === true,
      endCursor: typeof info?.endCursor === "string" ? info.endCursor : null,
    };
  });

  return { pullRequestId, files };
}

/** plan.md 4.7: the mutation is the source of truth, so no optimistic local copy. */
export async function setFileViewed(
  client: GitHubClient,
  pullRequestId: string,
  path: string,
  viewed: boolean,
  signal?: AbortSignal,
): Promise<void> {
  await client.graphql(
    viewed ? MARK_MUTATION : UNMARK_MUTATION,
    { pullRequestId, path },
    (value): value is unknown => value !== undefined,
    { signal },
  );
}

/**
 * plan.md 4.7: progress counts only the files the locale filter is showing,
 * while each file's own state stays whatever GitHub says.
 */
export function viewedProgress(
  visiblePaths: readonly string[],
  states: ReadonlyMap<string, ViewedState>,
): { viewed: number; total: number } {
  let viewed = 0;
  for (const path of visiblePaths) {
    if (states.get(path) === "VIEWED") viewed += 1;
  }
  return { viewed, total: visiblePaths.length };
}

export function toViewedMap(files: readonly ViewedFile[]): Map<string, ViewedState> {
  return new Map(files.map((file) => [file.path, file.state]));
}
