import type { GitHubClient } from "../../api/client";
import type {
  PullRequestDiffBase,
  PullRequestRef,
  PullRequestState,
  PullRequestSummary,
  RepositoryRef,
} from "../../api/types";

/**
 * Loading the pull request metadata and the coordinates every later file
 * lookup resolves against (plan.md 4.5, 6).
 */

export type LoadedPullRequest = {
  summary: PullRequestSummary;
  diffBase: PullRequestDiffBase;
};

type RawRepo = { full_name?: unknown; name?: unknown; owner?: unknown };
type RawRef = { ref?: unknown; sha?: unknown; repo?: unknown };

type RawPullRequest = {
  number?: unknown;
  title?: unknown;
  state?: unknown;
  draft?: unknown;
  merged_at?: unknown;
  updated_at?: unknown;
  html_url?: unknown;
  user?: unknown;
  base?: unknown;
  head?: unknown;
};

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const isRawPullRequest = (value: unknown): value is RawPullRequest => isObject(value);

const asString = (value: unknown): string | null =>
  typeof value === "string" && value !== "" ? value : null;

/**
 * A repository can be null on `head` once a fork is deleted, which plan.md 4.5
 * treats as a supported state rather than a failure.
 */
function toRepositoryRef(value: unknown): RepositoryRef | null {
  if (!isObject(value)) return null;
  const raw = value as RawRepo;
  const fullName = asString(raw.full_name);
  if (fullName === null) return null;

  const [owner, name] = fullName.split("/");
  if (!owner || !name) return null;
  return { owner, name, fullName };
}

function toState(raw: RawPullRequest): PullRequestState {
  // GitHub reports a merged pull request as closed, and the two read very
  // differently to a reviewer.
  if (asString(raw.merged_at) !== null) return "merged";
  return raw.state === "closed" ? "closed" : "open";
}

/**
 * The merge base, not `pull.base.sha`.
 *
 * plan.md 4.5 requires the before-side commit to be the merge base so commits
 * landed on the base branch after the pull request opened do not appear as part
 * of the existing translation. The Compare API is the only place it is
 * available.
 */
async function fetchMergeBaseSha(
  client: GitHubClient,
  baseRepoFullName: string,
  baseRef: string,
  headSha: string,
  signal?: AbortSignal,
): Promise<string | null> {
  const isCompare = (value: unknown): value is { merge_base_commit?: unknown } => isObject(value);

  const payload = await client.requestJson(
    `/repos/${baseRepoFullName}/compare/${encodeURIComponent(baseRef)}...${encodeURIComponent(headSha)}`,
    isCompare,
    { signal },
  );

  const commit = payload.merge_base_commit;
  if (!isObject(commit)) return null;
  return asString(commit.sha);
}

export async function fetchPullRequest(
  client: GitHubClient,
  ref: PullRequestRef,
  signal?: AbortSignal,
): Promise<LoadedPullRequest> {
  const path = `/repos/${encodeURIComponent(ref.owner)}/${encodeURIComponent(ref.repository)}/pulls/${ref.number}`;
  const raw = await client.requestJson(path, isRawPullRequest, { signal });

  const base = isObject(raw.base) ? (raw.base as RawRef) : null;
  const head = isObject(raw.head) ? (raw.head as RawRef) : null;

  const baseRepository = toRepositoryRef(base?.repo);
  const baseRef = asString(base?.ref);
  const headRef = asString(head?.ref);
  const headSha = asString(head?.sha);

  if (!baseRepository || !baseRef || !headRef || !headSha) {
    throw new MalformedPullRequestError();
  }

  // Null when the fork is gone. plan.md 4.5 then falls back to reading head
  // content from the base repository, so the distinction has to survive.
  const headRepository = toRepositoryRef(head?.repo);

  const author = isObject(raw.user)
    ? {
        login: asString((raw.user as { login?: unknown }).login) ?? "",
        avatarUrl: asString((raw.user as { avatar_url?: unknown }).avatar_url),
        htmlUrl: asString((raw.user as { html_url?: unknown }).html_url),
      }
    : null;

  const number = typeof raw.number === "number" ? raw.number : ref.number;

  const summary: PullRequestSummary = {
    baseRepository,
    headRepository,
    number,
    title: asString(raw.title) ?? "",
    author: author && author.login !== "" ? author : null,
    baseRef,
    headRef,
    headSha,
    state: toState(raw),
    isDraft: raw.draft === true,
    htmlUrl:
      asString(raw.html_url) ?? `https://github.com/${baseRepository.fullName}/pull/${number}`,
    updatedAt: asString(raw.updated_at) ?? "",
  };

  const mergeBaseSha = await fetchMergeBaseSha(
    client,
    baseRepository.fullName,
    baseRef,
    headSha,
    signal,
  );

  const diffBase: PullRequestDiffBase = {
    baseRepositoryFullName: baseRepository.fullName,
    headRepositoryFullName: headRepository?.fullName ?? null,
    // Falling back to the head commit would silently compare a file with
    // itself, so a missing merge base is an error rather than a default.
    mergeBaseSha: mergeBaseSha ?? "",
    headSha,
  };

  if (diffBase.mergeBaseSha === "") throw new MalformedPullRequestError();

  return { summary, diffBase };
}

/** Raised when a payload parses as JSON but lacks a field the app cannot proceed without. */
export class MalformedPullRequestError extends Error {
  constructor() {
    super("The pull request data from GitHub was missing a required field.");
    this.name = "MalformedPullRequestError";
  }
}
