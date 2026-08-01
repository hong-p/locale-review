import { type InvalidUrlError, invalidUrlError } from "../../api/errors";
import type { PullRequestRef } from "../../api/types";
import { pullRequestPath } from "../../app/routes";

/**
 * Parsing and normalising the pull request URL a reviewer pastes (plan.md 3.3,
 * 4.1).
 *
 * The result is a discriminated union rather than a throw, because plan.md 4.1
 * requires the start screen to show a specific "invalid URL" state instead of a
 * generic failure.
 */

export type ParsedPullRequestUrl =
  | { ok: true; ref: PullRequestRef }
  | { ok: false; error: InvalidUrlError };

/** plan.md 2: the first release supports github.com only. */
const SUPPORTED_HOSTS = new Set(["github.com", "www.github.com"]);

/**
 * GitHub allows alphanumerics and hyphens in an account name, up to 39
 * characters, and neither end may be a hyphen.
 */
const OWNER_PATTERN = /^[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,37}[a-zA-Z0-9])?$/;

/**
 * A repository name additionally allows underscore and period, up to 100
 * characters. `.` and `..` are excluded separately: both match the character
 * class but neither is a real repository.
 */
const REPOSITORY_PATTERN = /^[a-zA-Z0-9._-]{1,100}$/;

/** Digits only, with no leading zero, so "01" and "1e3" are both rejected. */
const NUMBER_PATTERN = /^(?:0|[1-9][0-9]*)$/;

function fail(reason: Parameters<typeof invalidUrlError>[0]): ParsedPullRequestUrl {
  return { ok: false, error: invalidUrlError(reason) };
}

/**
 * Validates already-separated path segments.
 *
 * Both entry points share this rather than one rebuilding a URL for the other:
 * interpolating a segment back into a URL string lets `new URL` resolve a `..`
 * inside it, so `o/../../evil` would normalise into a different owner and pass
 * validation as that owner.
 */
function fromSegments(owner: string, repository: string, rawNumber: string): ParsedPullRequestUrl {
  if (!OWNER_PATTERN.test(owner)) return fail("not-a-pull-request");
  if (!REPOSITORY_PATTERN.test(repository) || repository === "." || repository === "..") {
    return fail("not-a-pull-request");
  }
  if (!NUMBER_PATTERN.test(rawNumber)) return fail("invalid-number");

  const number = Number(rawNumber);
  if (number === 0) return fail("invalid-number");

  return { ok: true, ref: { owner, repository, number } };
}

/**
 * A pasted URL often arrives without a scheme, and `new URL` rejects that. Only
 * a bare host is prefixed: a value that already carries some other scheme must
 * still be reported as an unsupported host rather than silently coerced.
 */
function toUrl(input: string): URL | null {
  const candidate = /^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(input) ? input : `https://${input}`;
  try {
    return new URL(candidate);
  } catch {
    return null;
  }
}

export function parsePullRequestUrl(input: string): ParsedPullRequestUrl {
  const trimmed = input.trim();
  if (trimmed === "") return fail("empty");

  const url = toUrl(trimmed);
  if (!url) return fail("not-a-pull-request");

  // http is accepted and upgraded by GitHub anyway; anything else is not a web
  // URL this app can open.
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    return fail("unsupported-host");
  }
  if (!SUPPORTED_HOSTS.has(url.hostname.toLowerCase())) {
    return fail("unsupported-host");
  }

  // The query string and fragment carry GitHub's own view state (`?w=1`,
  // `#discussion_r123`) and never affect which pull request this is.
  const segments = url.pathname.split("/").filter((segment) => segment !== "");
  if (segments.length < 4) return fail("not-a-pull-request");

  const [owner, repository, kind, rawNumber] = segments;

  // GitHub itself serves /pull/123; /pulls/123 is a common mistype and is not a
  // valid pull request URL.
  //
  // Any further segments are the tabs GitHub links to — /files, /commits,
  // /checks — and they identify the same pull request.
  if (kind !== "pull") return fail("not-a-pull-request");

  return fromSegments(owner, repository, rawNumber);
}

/** The shareable in-app route for a parsed pull request (plan.md 2, 3.3). */
export function pullRequestRefToPath(ref: PullRequestRef): string {
  return pullRequestPath(ref.owner, ref.repository, ref.number);
}

/**
 * Re-validates route parameters on entry, which plan.md 3.3 requires because a
 * hash route is user-editable and arrives without passing through the form.
 */
export function parsePullRequestRouteParams(params: {
  owner?: string;
  repo?: string;
  number?: string;
}): ParsedPullRequestUrl {
  const { owner, repo, number } = params;
  if (!owner || !repo || !number) return fail("not-a-pull-request");
  return fromSegments(owner, repo, number);
}
