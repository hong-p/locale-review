/**
 * The app-side types the GitHub API layer produces.
 *
 * plan.md 3.4 and 6 forbid handing a GitHub response to the rest of the app:
 * every field below is one this product renders or keys a cache on, and a
 * parser is expected to narrow the raw payload into these shapes rather than
 * assert it (plan.md 3.8).
 *
 * This module is types only. Anything that inspects or derives from these
 * values belongs to the feature that needs it.
 */

/**
 * How a pull request is identified in a route and in a TanStack Query key
 * (plan.md 3.2, 3.3). These are the normalized URL segments, before any API
 * call has confirmed the repository exists.
 */
export type PullRequestRef = {
  owner: string;
  repository: string;
  number: number;
};

/**
 * A repository as GitHub reported it. `fullName` is kept alongside the parts
 * because plan.md 4.5 addresses base and head repositories by full name, and
 * re-joining `owner` and `name` at every call site invites drift.
 */
export type RepositoryRef = {
  owner: string;
  name: string;
  /** `owner/name`. */
  fullName: string;
};

/**
 * A GitHub account as far as this app displays it. Everything is optional to
 * the degree GitHub makes it optional: a deleted account surfaces as a ghost
 * with no profile.
 */
export type GitHubUserRef = {
  login: string;
  avatarUrl: string | null;
  htmlUrl: string | null;
};

/**
 * plan.md 7 asks the header to show open, draft, or closed. `merged` is kept
 * separate from `closed` because GitHub reports both as `state: "closed"` and a
 * merged pull request reads very differently to a reviewer.
 */
export type PullRequestState = "open" | "closed" | "merged";

/**
 * The pull request metadata the review header needs (plan.md 7).
 *
 * `baseRepository` and `headRepository` are separate values because plan.md 6
 * forbids assuming a pull request is same-repository. `headRepository` is null
 * once a fork has been deleted or made private, which plan.md 4.5 treats as a
 * supported state rather than an error.
 *
 * There is deliberately no `baseSha`: plan.md 4.5 requires the merge base from
 * the Compare API as the before-side commit, and exposing `pull.base.sha` here
 * would make the wrong choice the convenient one.
 */
export type PullRequestSummary = {
  baseRepository: RepositoryRef;
  headRepository: RepositoryRef | null;
  number: number;
  title: string;
  /** Null for a pull request opened by an account that no longer exists. */
  author: GitHubUserRef | null;
  /** Branch names only, without the owner prefix GitHub shows on forks. */
  baseRef: string;
  headRef: string;
  headSha: string;
  state: PullRequestState;
  isDraft: boolean;
  /** The `Open on GitHub` target from plan.md 4.1. */
  htmlUrl: string;
};

/**
 * The one set of coordinates every file lookup in this app resolves against
 * (plan.md 4.5, 6).
 *
 * Source and before-translation content is read from `baseRepositoryFullName`
 * at `mergeBaseSha`; after-translation content is read from
 * `headRepositoryFullName` at `headSha`. The four identifiers stay separate so
 * a fork pull request is representable, and `headRepositoryFullName` is null
 * when the fork is gone and the fallback chain in plan.md 4.5 has to run
 * against the base repository instead.
 *
 * `mergeBaseSha` comes from the Compare API's `merge_base_commit.sha`, never
 * from `pull.base.sha`, so unrelated commits landed on the base branch after
 * the pull request opened do not leak into the existing translation.
 */
export type PullRequestDiffBase = {
  baseRepositoryFullName: string;
  headRepositoryFullName: string | null;
  mergeBaseSha: string;
  headSha: string;
};
