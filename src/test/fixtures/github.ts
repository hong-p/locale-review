/**
 * Realistic GitHub REST payloads for tests and MSW handlers.
 *
 * These describe what GitHub sends, not what the app keeps — plan.md 6 keeps
 * those apart, so none of these shapes appear in `src/api/types.ts`. Builders
 * take a flat options object and return a fresh object every call, so a later
 * phase can vary one field (a head SHA, a draft flag) without rebuilding a
 * payload by hand and without mutating a shared constant.
 *
 * All names are invented. No real account, repository, or token appears.
 */

import type { RateLimitKind } from "../../api/errors";

export const BASE_OWNER = "example-org";
export const BASE_REPOSITORY_NAME = "docs-site";
export const FORK_OWNER = "example-contributor";
export const AUTHOR_LOGIN = "example-author";

/** `pull.base.sha`, which plan.md 4.5 forbids using as the before-side commit. */
export const BASE_SHA = "1a2b3c4d5e6f708192a3b4c5d6e7f8091a2b3c4d";
/** `merge_base_commit.sha` from the Compare API — the real before-side commit. */
export const MERGE_BASE_SHA = "5c6d7e8f9012a3b4c5d6e7f8091a2b3c4d5e6f70";
export const HEAD_SHA = "9f1c0a2b7d3e4f5061728394a5b6c7d8e9f01234";

export type GitHubUserPayload = {
  login: string;
  id: number;
  node_id: string;
  avatar_url: string;
  html_url: string;
  type: "User";
};

export type GitHubRepositoryPayload = {
  id: number;
  node_id: string;
  name: string;
  full_name: string;
  owner: GitHubUserPayload;
  private: boolean;
  fork: boolean;
  html_url: string;
  default_branch: string;
};

export type GitHubPullRequestRefPayload = {
  label: string;
  ref: string;
  sha: string;
  user: GitHubUserPayload | null;
  /** Null once the fork behind a pull request is deleted or made private. */
  repo: GitHubRepositoryPayload | null;
};

export type GitHubPullRequestPayload = {
  id: number;
  node_id: string;
  number: number;
  state: "open" | "closed";
  title: string;
  body: string | null;
  user: GitHubUserPayload | null;
  draft: boolean;
  merged: boolean;
  merged_at: string | null;
  created_at: string;
  updated_at: string;
  html_url: string;
  base: GitHubPullRequestRefPayload;
  head: GitHubPullRequestRefPayload;
  changed_files: number;
  additions: number;
  deletions: number;
  commits: number;
};

export type GitHubErrorPayload = {
  message: string;
  documentation_url: string;
  status?: string;
};

export type UserPayloadOptions = {
  login?: string;
};

export function buildUserPayload(options: UserPayloadOptions = {}): GitHubUserPayload {
  const login = options.login ?? AUTHOR_LOGIN;
  const id = stableId(`user:${login}`);
  return {
    login,
    id,
    node_id: `U_kgDO${id}`,
    avatar_url: `https://avatars.githubusercontent.com/u/${id}?v=4`,
    html_url: `https://github.com/${login}`,
    type: "User",
  };
}

export type RepositoryPayloadOptions = {
  owner?: string;
  name?: string;
  isFork?: boolean;
  isPrivate?: boolean;
  defaultBranch?: string;
};

export function buildRepositoryPayload(
  options: RepositoryPayloadOptions = {},
): GitHubRepositoryPayload {
  const owner = options.owner ?? BASE_OWNER;
  const name = options.name ?? BASE_REPOSITORY_NAME;
  const fullName = `${owner}/${name}`;
  const id = stableId(`repo:${fullName}`);
  return {
    id,
    node_id: `R_kgDO${id}`,
    name,
    full_name: fullName,
    owner: buildUserPayload({ login: owner }),
    private: options.isPrivate ?? false,
    fork: options.isFork ?? false,
    html_url: `https://github.com/${fullName}`,
    default_branch: options.defaultBranch ?? "main",
  };
}

export type PullRequestPayloadOptions = {
  number?: number;
  title?: string;
  body?: string | null;
  state?: "open" | "closed";
  draft?: boolean;
  merged?: boolean;
  /** Null models a pull request whose author account was deleted. */
  authorLogin?: string | null;
  baseOwner?: string;
  baseRepositoryName?: string;
  baseRef?: string;
  baseSha?: string;
  headOwner?: string;
  headRepositoryName?: string;
  headRef?: string;
  headSha?: string;
  /** Set false to model a fork that was deleted or turned private. */
  headRepositoryExists?: boolean;
  changedFiles?: number;
  additions?: number;
  deletions?: number;
  commits?: number;
};

/** A pull request opened from a branch in the same repository. */
export function buildPullRequestPayload(
  options: PullRequestPayloadOptions = {},
): GitHubPullRequestPayload {
  const number = options.number ?? 123;
  const baseOwner = options.baseOwner ?? BASE_OWNER;
  const baseRepositoryName = options.baseRepositoryName ?? BASE_REPOSITORY_NAME;
  const baseRef = options.baseRef ?? "main";
  const headOwner = options.headOwner ?? baseOwner;
  const headRepositoryName = options.headRepositoryName ?? baseRepositoryName;
  const headRef = options.headRef ?? "translate/ko-guide";
  const headRepositoryExists = options.headRepositoryExists ?? true;
  const authorLogin = options.authorLogin === undefined ? AUTHOR_LOGIN : options.authorLogin;
  const merged = options.merged ?? false;
  const baseFullName = `${baseOwner}/${baseRepositoryName}`;
  const id = stableId(`pull:${baseFullName}#${number}`);
  const headRepository = buildRepositoryPayload({
    owner: headOwner,
    name: headRepositoryName,
    isFork: headOwner !== baseOwner,
  });

  return {
    id,
    node_id: `PR_kwDO${id}`,
    number,
    state: options.state ?? (merged ? "closed" : "open"),
    title: options.title ?? "Translate the getting started guide into Korean",
    body: options.body === undefined ? "Adds a Korean translation for the guide." : options.body,
    user: authorLogin === null ? null : buildUserPayload({ login: authorLogin }),
    draft: options.draft ?? false,
    merged,
    merged_at: merged ? "2026-01-09T04:15:00Z" : null,
    created_at: "2026-01-07T09:00:00Z",
    updated_at: "2026-01-08T11:30:00Z",
    html_url: `https://github.com/${baseFullName}/pull/${number}`,
    base: {
      label: `${baseOwner}:${baseRef}`,
      ref: baseRef,
      sha: options.baseSha ?? BASE_SHA,
      user: buildUserPayload({ login: baseOwner }),
      repo: buildRepositoryPayload({ owner: baseOwner, name: baseRepositoryName }),
    },
    head: {
      label: `${headOwner}:${headRef}`,
      ref: headRef,
      sha: options.headSha ?? HEAD_SHA,
      // GitHub keeps the account on the ref even when the fork itself is gone.
      user: buildUserPayload({ login: headOwner }),
      repo: headRepositoryExists ? headRepository : null,
    },
    changed_files: options.changedFiles ?? 3,
    additions: options.additions ?? 42,
    deletions: options.deletions ?? 7,
    commits: options.commits ?? 2,
  };
}

/**
 * A pull request opened from a fork — plan.md 4.5 treats this as the default
 * scenario, so base and head resolve to different repositories.
 */
export function buildForkPullRequestPayload(
  options: PullRequestPayloadOptions = {},
): GitHubPullRequestPayload {
  return buildPullRequestPayload({
    authorLogin: FORK_OWNER,
    headOwner: FORK_OWNER,
    ...options,
  });
}

/**
 * A fork pull request whose head repository is no longer reachable. GitHub
 * still serves the pull request, with `head.repo` null and the head SHA intact,
 * which is what triggers the fallback chain in plan.md 4.5.
 */
export function buildDeletedForkPullRequestPayload(
  options: PullRequestPayloadOptions = {},
): GitHubPullRequestPayload {
  return buildForkPullRequestPayload({ ...options, headRepositoryExists: false });
}

export type RateLimitErrorOptions = {
  kind?: RateLimitKind;
};

export function buildRateLimitErrorPayload(
  options: RateLimitErrorOptions = {},
): GitHubErrorPayload {
  const isSecondary = (options.kind ?? "primary") === "secondary";
  return {
    message: isSecondary
      ? "You have exceeded a secondary rate limit. Please wait a few minutes."
      : "API rate limit exceeded for user ID 1000001.",
    documentation_url: "https://docs.github.com/rest/overview/rate-limits-for-the-rest-api",
  };
}

export type RateLimitHeadersOptions = {
  kind?: RateLimitKind;
  limit?: number;
  remaining?: number;
  /** Unix seconds, as GitHub sends it. Defaults to 2026-01-08T12:00:00Z. */
  resetAt?: number;
  retryAfterSeconds?: number;
};

/**
 * The headers that accompany a rate-limited response. A primary limit reports
 * an exhausted quota; a secondary limit keeps quota but asks for a back-off.
 */
export function buildRateLimitHeaders(
  options: RateLimitHeadersOptions = {},
): Record<string, string> {
  const kind = options.kind ?? "primary";
  const limit = options.limit ?? 5000;
  const remaining = options.remaining ?? (kind === "primary" ? 0 : 4321);
  const resetAt = options.resetAt ?? 1767873600;
  const retryAfter = options.retryAfterSeconds ?? (kind === "secondary" ? 60 : undefined);

  const headers: Record<string, string> = {
    "content-type": "application/json; charset=utf-8",
    "x-github-api-version-selected": "2022-11-28",
    "x-ratelimit-limit": String(limit),
    "x-ratelimit-remaining": String(remaining),
    "x-ratelimit-used": String(limit - remaining),
    "x-ratelimit-reset": String(resetAt),
    "x-ratelimit-resource": "core",
  };
  if (retryAfter !== undefined) headers["retry-after"] = String(retryAfter);
  return headers;
}

export type PermissionErrorOptions = {
  /** Path shown in GitHub's `documentation_url`, without a leading slash. */
  documentationPath?: string;
  /** Set true for the 401 body GitHub returns when the token itself is bad. */
  badCredentials?: boolean;
};

export function buildPermissionErrorPayload(
  options: PermissionErrorOptions = {},
): GitHubErrorPayload {
  if (options.badCredentials === true) {
    return {
      message: "Bad credentials",
      documentation_url: "https://docs.github.com/rest",
      status: "401",
    };
  }
  const documentationPath = options.documentationPath ?? "rest/pulls/pulls#get-a-pull-request";
  return {
    message: "Resource not accessible by personal access token",
    documentation_url: `https://docs.github.com/${documentationPath}`,
    status: "403",
  };
}

/**
 * Deterministic six-digit ids. Fixtures need ids that look like GitHub's and
 * stay stable across runs, but must not collide between two different logins.
 */
function stableId(seed: string): number {
  let hash = 7;
  for (const character of seed) {
    hash = (hash * 31 + (character.codePointAt(0) ?? 0)) % 900000;
  }
  return 100000 + hash;
}
