import {
  type GitHubApiError,
  isGitHubApiError,
  malformedResponseError,
  networkFailureError,
  toGitHubApiError,
} from "./errors";

/**
 * The typed fetch wrapper every GitHub call goes through (plan.md 3.4).
 *
 * Octokit is deliberately not used. This layer only has to do a handful of
 * things well: attach auth and version headers, keep the token away from
 * anywhere it does not belong, separate JSON from raw content, convert every
 * failure into the shared error model, and never retry a mutation.
 */

const GITHUB_API_ORIGIN = "https://api.github.com";
const API_VERSION = "2022-11-28";

/**
 * Thrown by every request helper.
 *
 * TanStack Query and React error boundaries both expect a real `Error`, so the
 * normalized model travels as a property rather than being thrown bare. The
 * `message` is the model's constant string, so nothing remote reaches a stack
 * trace or a console.
 */
export class GitHubRequestError extends Error {
  readonly apiError: GitHubApiError;

  constructor(apiError: GitHubApiError) {
    super(apiError.message);
    this.name = "GitHubRequestError";
    this.apiError = apiError;
  }
}

/**
 * True for the rejection an `AbortSignal` produces, on any runtime.
 *
 * `instanceof DOMException` is not portable here: browsers use it, Node's fetch
 * rejects with a plain `Error`, and jsdom sits between the two.
 */
export function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === "AbortError";
}

export function asGitHubApiError(error: unknown): GitHubApiError | null {
  if (error instanceof GitHubRequestError) return error.apiError;
  if (isGitHubApiError(error)) return error;
  return null;
}

export type GitHubClientOptions = {
  /** Null keeps the client unauthenticated, which plan.md 10 only permits for no request at all. */
  token: string | null;
  /** Injectable so tests can drive the client without touching globals. */
  fetchImpl?: typeof fetch;
  origin?: string;
};

export type RequestOptions = {
  method?: string;
  /** Serialized as JSON. Presence of a body implies a mutation. */
  body?: unknown;
  signal?: AbortSignal;
  /** Overrides the default `application/vnd.github+json`. */
  accept?: string;
  searchParams?: Record<string, string | number | undefined>;
};

/**
 * A path such as `/repos/{owner}/{repo}/pulls/{n}`, or an absolute GitHub API
 * URL as returned in a `Link` header.
 *
 * plan.md 5.2 requires the token to reach the GitHub API origin and nowhere
 * else, so an absolute URL pointing anywhere else is refused rather than
 * followed. A redirect to another host would drop the header anyway, but a
 * paginated `Link` is followed by this code, not by the browser.
 */
function resolveUrl(origin: string, pathOrUrl: string): URL {
  const url = pathOrUrl.startsWith("http")
    ? new URL(pathOrUrl)
    : new URL(pathOrUrl.startsWith("/") ? pathOrUrl : `/${pathOrUrl}`, origin);

  if (url.origin !== new URL(origin).origin) {
    throw new GitHubRequestError(malformedResponseError("unexpected-shape", { field: "url" }));
  }
  return url;
}

export type GitHubClient = ReturnType<typeof createGitHubClient>;

export function createGitHubClient(options: GitHubClientOptions) {
  const origin = options.origin ?? GITHUB_API_ORIGIN;
  const doFetch = options.fetchImpl ?? globalThis.fetch;

  function buildHeaders(accept: string, hasBody: boolean): Headers {
    const headers = new Headers({
      Accept: accept,
      "X-GitHub-Api-Version": API_VERSION,
    });
    if (options.token) headers.set("Authorization", `Bearer ${options.token}`);
    if (hasBody) headers.set("Content-Type", "application/json");
    return headers;
  }

  /**
   * Performs the request and normalizes failure. Returns the raw `Response` so
   * callers can decide between JSON and text.
   */
  async function send(pathOrUrl: string, init: RequestOptions = {}): Promise<Response> {
    const url = resolveUrl(origin, pathOrUrl);

    for (const [key, value] of Object.entries(init.searchParams ?? {})) {
      if (value !== undefined) url.searchParams.set(key, String(value));
    }

    const hasBody = init.body !== undefined;
    let response: Response;
    try {
      response = await doFetch(url.toString(), {
        method: init.method ?? "GET",
        headers: buildHeaders(init.accept ?? "application/vnd.github+json", hasBody),
        body: hasBody ? JSON.stringify(init.body) : undefined,
        signal: init.signal,
        // The token is an Authorization header, not a cookie; sending
        // credentials would be pointless and widens what the request carries.
        credentials: "omit",
        redirect: "follow",
      });
    } catch (error) {
      // An abort is the caller's own doing and must stay distinguishable from
      // a genuine network failure, or a cancelled request renders as an error.
      //
      // The check is on `name` alone: browsers reject with a DOMException, but
      // Node's fetch rejects with a plain Error, and narrowing to DOMException
      // turned every cancelled request into a spurious network failure there.
      if (isAbortError(error)) throw error;
      throw new GitHubRequestError(networkFailureError());
    }

    if (!response.ok) {
      // The body is read only to classify a secondary rate limit; the error
      // model retains none of it.
      const body = await readJsonSafely(response);
      throw new GitHubRequestError(toGitHubApiError(response, body));
    }

    return response;
  }

  async function requestJson<T>(
    pathOrUrl: string,
    parse: (value: unknown) => value is T,
    init: RequestOptions = {},
  ): Promise<T> {
    const response = await send(pathOrUrl, init);
    const body = await readJsonSafely(response);

    if (body === undefined) {
      throw new GitHubRequestError(malformedResponseError("not-json", { status: response.status }));
    }
    // plan.md 3.8 forbids asserting an external payload into a type.
    if (!parse(body)) {
      throw new GitHubRequestError(
        malformedResponseError("unexpected-shape", { status: response.status }),
      );
    }
    return body;
  }

  /**
   * Fetches file content as text rather than JSON (plan.md 4.5). Kept separate
   * from `requestJson` so the two response kinds never blur.
   */
  async function requestRaw(pathOrUrl: string, init: RequestOptions = {}): Promise<string> {
    const response = await send(pathOrUrl, {
      ...init,
      accept: init.accept ?? "application/vnd.github.raw",
    });
    return response.text();
  }

  /**
   * Walks every page of a REST collection using the `Link` header (plan.md 3.4).
   *
   * GitHub caps `per_page` at 100, and following `rel="next"` is the only
   * supported way to page: a page count computed from a total would race with
   * concurrent writes.
   */
  async function requestAllPages<T>(
    path: string,
    parsePage: (value: unknown) => value is T[],
    init: RequestOptions = {},
  ): Promise<T[]> {
    const collected: T[] = [];
    let next: string | null = `${path}`;
    let searchParams: RequestOptions["searchParams"] = {
      per_page: 100,
      ...init.searchParams,
    };

    while (next !== null) {
      const response = await send(next, { ...init, searchParams });
      const body = await readJsonSafely(response);
      if (!parsePage(body)) {
        throw new GitHubRequestError(
          malformedResponseError("unexpected-shape", { status: response.status }),
        );
      }
      collected.push(...body);

      // A Link URL already carries page and per_page; re-applying our own would
      // overwrite the cursor GitHub handed back.
      next = parseNextLink(response.headers.get("link"));
      searchParams = undefined;
    }

    return collected;
  }

  /**
   * plan.md 3.4 requires GraphQL paging to be its own utility: a connection
   * carries `pageInfo`, never a `Link` header, so reusing the REST helper would
   * silently read only the first page.
   */
  async function graphql<T>(
    query: string,
    variables: Record<string, unknown>,
    parse: (value: unknown) => value is T,
    init: RequestOptions = {},
  ): Promise<T> {
    const response = await send("/graphql", {
      ...init,
      method: "POST",
      body: { query, variables },
    });
    const body = await readJsonSafely(response);

    if (!isGraphQLEnvelope(body)) {
      throw new GitHubRequestError(
        malformedResponseError("unexpected-shape", { status: response.status }),
      );
    }
    // GraphQL reports failure inside a 200, so an errors array is the only
    // signal that the request did not do what was asked.
    if (body.errors && body.errors.length > 0) {
      throw new GitHubRequestError(
        malformedResponseError("unexpected-shape", {
          status: response.status,
          field: "errors",
        }),
      );
    }
    if (!parse(body.data)) {
      throw new GitHubRequestError(
        malformedResponseError("unexpected-shape", { status: response.status, field: "data" }),
      );
    }
    return body.data;
  }

  /**
   * Follows a GraphQL connection to the end.
   *
   * `readPage` receives the cursor for the next page and returns that page's
   * nodes with its own `pageInfo`, keeping the query text with the caller.
   */
  async function graphqlAllPages<T>(
    readPage: (cursor: string | null) => Promise<GraphQLPage<T>>,
  ): Promise<T[]> {
    const collected: T[] = [];
    let cursor: string | null = null;

    // A connection that keeps returning the same cursor would otherwise spin
    // forever; GitHub caps a connection at 100 per page, so this ceiling is far
    // above any real pull request.
    for (let page = 0; page < 100; page += 1) {
      const result = await readPage(cursor);
      collected.push(...result.nodes);
      if (!result.hasNextPage || result.endCursor === null) return collected;
      cursor = result.endCursor;
    }

    throw new GitHubRequestError(malformedResponseError("unexpected-shape", { field: "pageInfo" }));
  }

  return {
    send,
    requestJson,
    requestRaw,
    requestAllPages,
    graphql,
    graphqlAllPages,
    get isAuthenticated() {
      return options.token !== null && options.token !== "";
    },
  };
}

export type GraphQLPage<T> = {
  nodes: T[];
  hasNextPage: boolean;
  endCursor: string | null;
};

type GraphQLEnvelope = {
  data?: unknown;
  errors?: unknown[];
};

function isGraphQLEnvelope(value: unknown): value is GraphQLEnvelope {
  if (typeof value !== "object" || value === null) return false;
  if ("errors" in value && value.errors !== undefined && !Array.isArray(value.errors)) {
    return false;
  }
  return "data" in value || "errors" in value;
}

/** Returns `undefined` rather than throwing, so the caller decides what a missing body means. */
async function readJsonSafely(response: Response): Promise<unknown> {
  try {
    const text = await response.text();
    if (text === "") return undefined;
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

/**
 * Extracts `rel="next"` from a `Link` header.
 *
 * Exported for its own tests: the header's quoting and spacing vary, and this
 * is the single point where mis-parsing silently truncates a paged result.
 */
export function parseNextLink(header: string | null): string | null {
  if (!header) return null;

  for (const part of header.split(",")) {
    const match = /<([^>]+)>\s*;\s*(.+)/.exec(part.trim());
    if (!match) continue;
    const [, url, attributes] = match;

    // The value has to be extracted and compared whole. A substring test would
    // accept rel="nextpage" and follow the wrong URL.
    const rel = /\brel\s*=\s*(?:"([^"]*)"|'([^']*)'|([^;,\s]+))/.exec(attributes);
    if (!rel) continue;

    // RFC 8288 allows a space-separated list of relation types.
    const values = (rel[1] ?? rel[2] ?? rel[3] ?? "").trim().split(/\s+/);
    if (values.includes("next")) return url;
  }
  return null;
}
