import { HttpResponse, http } from "msw";
import { describe, expect, it } from "vitest";

import { server } from "../test/msw/server";
import { GitHubRequestError, asGitHubApiError, createGitHubClient, parseNextLink } from "./client";

const ORIGIN = "https://api.github.com";
const TOKEN = "ghp_secret_value";

const client = (token: string | null = TOKEN) => createGitHubClient({ token });

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;
const isRecordArray = (value: unknown): value is Record<string, unknown>[] =>
  Array.isArray(value) && value.every(isRecord);

/** Runs `fn` and returns the normalized error it threw. */
async function captureError(fn: () => Promise<unknown>) {
  try {
    await fn();
  } catch (error) {
    return asGitHubApiError(error);
  }
  throw new Error("expected the call to throw");
}

describe("headers", () => {
  it("sends the token as a bearer credential and pins the API version", async () => {
    let seen: Headers | undefined;
    server.use(
      http.get(`${ORIGIN}/user`, ({ request }) => {
        seen = request.headers;
        return HttpResponse.json({ login: "octocat" });
      }),
    );

    await client().requestJson("/user", isRecord);

    expect(seen?.get("authorization")).toBe(`Bearer ${TOKEN}`);
    expect(seen?.get("x-github-api-version")).toBe("2022-11-28");
    expect(seen?.get("accept")).toBe("application/vnd.github+json");
  });

  it("omits the authorization header when there is no token", async () => {
    let seen: Headers | undefined;
    server.use(
      http.get(`${ORIGIN}/user`, ({ request }) => {
        seen = request.headers;
        return HttpResponse.json({});
      }),
    );

    await client(null).requestJson("/user", isRecord);

    expect(seen?.get("authorization")).toBeNull();
  });
});

describe("the token never leaves the GitHub origin", () => {
  it("refuses an absolute URL pointing at another host", async () => {
    // plan.md 5.2: the token goes to the GitHub API origin and nowhere else.
    const error = await captureError(() =>
      client().requestJson("https://evil.test/steal", isRecord),
    );
    expect(error?.code).toBe("malformed-response");
  });

  it("refuses a lookalike host", async () => {
    const error = await captureError(() =>
      client().requestJson("https://api.github.com.evil.test/x", isRecord),
    );
    expect(error?.code).toBe("malformed-response");
  });

  it("never places the token in the URL", async () => {
    let seenUrl = "";
    server.use(
      http.get(`${ORIGIN}/user`, ({ request }) => {
        seenUrl = request.url;
        return HttpResponse.json({});
      }),
    );

    await client().requestJson("/user", isRecord);

    expect(seenUrl).not.toContain(TOKEN);
  });

  it("keeps the token out of a thrown error", async () => {
    server.use(http.get(`${ORIGIN}/user`, () => HttpResponse.json({}, { status: 500 })));

    try {
      await client().requestJson("/user", isRecord);
      throw new Error("expected a throw");
    } catch (error) {
      const serialized = JSON.stringify({
        message: (error as Error).message,
        stack: (error as Error).stack ?? "",
        api: asGitHubApiError(error),
      });
      expect(serialized).not.toContain(TOKEN);
    }
  });
});

describe("error normalization", () => {
  const cases = [
    { status: 404, code: "not-found" },
    { status: 401, code: "permission-denied" },
    { status: 500, code: "server-error" },
    { status: 422, code: "server-error" },
  ] as const;

  for (const { status, code } of cases) {
    it(`maps ${status} to ${code}`, async () => {
      server.use(http.get(`${ORIGIN}/x`, () => HttpResponse.json({}, { status })));
      const error = await captureError(() => client().requestJson("/x", isRecord));
      expect(error?.code).toBe(code);
    });
  }

  it("maps an exhausted rate limit to rate-limited with its reset time", async () => {
    const resetAt = Math.floor(Date.now() / 1000) + 600;
    server.use(
      http.get(`${ORIGIN}/x`, () =>
        HttpResponse.json(
          {},
          {
            status: 403,
            headers: {
              "x-ratelimit-remaining": "0",
              "x-ratelimit-limit": "5000",
              "x-ratelimit-reset": String(resetAt),
            },
          },
        ),
      ),
    );

    const error = await captureError(() => client().requestJson("/x", isRecord));

    expect(error?.code).toBe("rate-limited");
    if (error?.code !== "rate-limited") return;
    expect(error.resetAt?.getTime()).toBe(resetAt * 1000);
    expect(error.remaining).toBe(0);
  });

  it("reports a network failure without leaking the reason", async () => {
    server.use(http.get(`${ORIGIN}/x`, () => HttpResponse.error()));
    const error = await captureError(() => client().requestJson("/x", isRecord));
    expect(error?.code).toBe("network-failure");
  });

  it("reports a body that is not JSON", async () => {
    server.use(http.get(`${ORIGIN}/x`, () => HttpResponse.text("<html>oops</html>")));
    const error = await captureError(() => client().requestJson("/x", isRecord));
    expect(error?.code).toBe("malformed-response");
  });

  it("reports a body that does not match the expected shape", async () => {
    server.use(http.get(`${ORIGIN}/x`, () => HttpResponse.json(["not", "an", "object"])));
    const error = await captureError(() =>
      client().requestJson("/x", (v): v is { id: number } => isRecord(v) && "id" in v),
    );
    expect(error?.code).toBe("malformed-response");
  });
});

describe("abort", () => {
  it("propagates an AbortError rather than reporting a network failure", async () => {
    // plan.md 3.4 cancels in-flight work on a PR or file switch; a cancelled
    // request must not render as an error state.
    server.use(
      http.get(`${ORIGIN}/slow`, async () => {
        await new Promise((resolve) => setTimeout(resolve, 100));
        return HttpResponse.json({});
      }),
    );

    const controller = new AbortController();
    const pending = client().requestJson("/slow", isRecord, { signal: controller.signal });
    controller.abort();

    await expect(pending).rejects.toThrow();
    await pending.catch((error: unknown) => {
      expect(error).not.toBeInstanceOf(GitHubRequestError);
      expect((error as Error).name).toBe("AbortError");
    });
  });
});

describe("REST pagination", () => {
  it("follows rel=next to the end and concatenates every page", async () => {
    server.use(
      http.get(`${ORIGIN}/items`, ({ request }) => {
        const page = new URL(request.url).searchParams.get("page") ?? "1";
        if (page === "1") {
          return HttpResponse.json([{ n: 1 }], {
            headers: { link: `<${ORIGIN}/items?page=2>; rel="next"` },
          });
        }
        if (page === "2") {
          return HttpResponse.json([{ n: 2 }], {
            headers: { link: `<${ORIGIN}/items?page=3>; rel="next"` },
          });
        }
        return HttpResponse.json([{ n: 3 }]);
      }),
    );

    const items = await client().requestAllPages("/items", isRecordArray);

    expect(items.map((item) => item.n)).toEqual([1, 2, 3]);
  });

  it("requests the maximum page size so a large pull request costs fewer calls", async () => {
    let seen = "";
    server.use(
      http.get(`${ORIGIN}/items`, ({ request }) => {
        seen = new URL(request.url).searchParams.get("per_page") ?? "";
        return HttpResponse.json([]);
      }),
    );

    await client().requestAllPages("/items", isRecordArray);

    expect(seen).toBe("100");
  });

  it("stops when there is no next link", async () => {
    let calls = 0;
    server.use(
      http.get(`${ORIGIN}/items`, () => {
        calls += 1;
        return HttpResponse.json([{ n: 1 }], {
          headers: { link: `<${ORIGIN}/items?page=1>; rel="prev"` },
        });
      }),
    );

    await client().requestAllPages("/items", isRecordArray);

    expect(calls).toBe(1);
  });
});

describe("parseNextLink", () => {
  it("finds next among several relations", () => {
    const header = `<https://api.github.com/x?page=2>; rel="next", <https://api.github.com/x?page=9>; rel="last"`;
    expect(parseNextLink(header)).toBe("https://api.github.com/x?page=2");
  });

  it("tolerates unquoted and loosely spaced attributes", () => {
    expect(parseNextLink(`<https://api.github.com/x>;rel=next`)).toBe("https://api.github.com/x");
    expect(parseNextLink(`<https://api.github.com/x> ;  rel = "next"`)).toBe(
      "https://api.github.com/x",
    );
  });

  it("returns null when there is no next relation", () => {
    expect(parseNextLink(null)).toBeNull();
    expect(parseNextLink("")).toBeNull();
    expect(parseNextLink(`<https://api.github.com/x>; rel="prev"`)).toBeNull();
    // "nextpage" must not match "next".
    expect(parseNextLink(`<https://api.github.com/x>; rel="nextpage"`)).toBeNull();
  });
});

describe("GraphQL", () => {
  const isData = (value: unknown): value is { ok: boolean } =>
    isRecord(value) && typeof value.ok === "boolean";

  it("posts the query and returns data", async () => {
    server.use(http.post(`${ORIGIN}/graphql`, () => HttpResponse.json({ data: { ok: true } })));

    await expect(client().graphql("query {}", {}, isData)).resolves.toEqual({ ok: true });
  });

  it("treats an errors array in a 200 as a failure", async () => {
    // GraphQL reports failure inside a successful HTTP response.
    server.use(
      http.post(`${ORIGIN}/graphql`, () =>
        HttpResponse.json({ data: null, errors: [{ message: "Bad credentials" }] }),
      ),
    );

    const error = await captureError(() => client().graphql("query {}", {}, isData));
    expect(error?.code).toBe("malformed-response");
  });

  it("does not copy a GraphQL error message into the app error", async () => {
    server.use(
      http.post(`${ORIGIN}/graphql`, () =>
        HttpResponse.json({ errors: [{ message: `leaked ${TOKEN}` }] }),
      ),
    );

    const error = await captureError(() => client().graphql("query {}", {}, isData));
    expect(JSON.stringify(error)).not.toContain(TOKEN);
  });

  it("walks a connection to the end using pageInfo", async () => {
    const pages = [
      { nodes: ["a"], hasNextPage: true, endCursor: "c1" },
      { nodes: ["b"], hasNextPage: true, endCursor: "c2" },
      { nodes: ["c"], hasNextPage: false, endCursor: null },
    ];
    const seen: (string | null)[] = [];

    const all = await client().graphqlAllPages<string>(async (cursor) => {
      seen.push(cursor);
      return pages[seen.length - 1];
    });

    expect(all).toEqual(["a", "b", "c"]);
    expect(seen).toEqual([null, "c1", "c2"]);
  });

  it("stops instead of spinning when a connection repeats its cursor", async () => {
    const error = await captureError(() =>
      client().graphqlAllPages<string>(async () => ({
        nodes: ["x"],
        hasNextPage: true,
        endCursor: "same",
      })),
    );
    expect(error?.code).toBe("malformed-response");
  });
});

describe("raw content", () => {
  it("requests the raw media type and returns text", async () => {
    let accept = "";
    server.use(
      http.get(`${ORIGIN}/repos/o/r/contents/a.md`, ({ request }) => {
        accept = request.headers.get("accept") ?? "";
        return HttpResponse.text("# 제목\n본문");
      }),
    );

    const text = await client().requestRaw("/repos/o/r/contents/a.md");

    expect(accept).toBe("application/vnd.github.raw");
    // plan.md 4.5: translation content is non-ASCII by definition.
    expect(text).toBe("# 제목\n본문");
  });
});

describe("mutations", () => {
  it("sends a JSON body exactly once and does not retry", async () => {
    // plan.md 3.2 and 6: a retried comment would post twice.
    let calls = 0;
    server.use(
      http.post(`${ORIGIN}/repos/o/r/pulls/1/comments`, async () => {
        calls += 1;
        return HttpResponse.json({}, { status: 500 });
      }),
    );

    await captureError(() =>
      client().requestJson("/repos/o/r/pulls/1/comments", isRecord, {
        method: "POST",
        body: { body: "note" },
      }),
    );

    expect(calls).toBe(1);
  });

  it("sets a JSON content type only when there is a body", async () => {
    let withBody = "";
    let withoutBody = "";
    server.use(
      http.post(`${ORIGIN}/a`, ({ request }) => {
        withBody = request.headers.get("content-type") ?? "";
        return HttpResponse.json({});
      }),
      http.get(`${ORIGIN}/b`, ({ request }) => {
        withoutBody = request.headers.get("content-type") ?? "";
        return HttpResponse.json({});
      }),
    );

    await client().requestJson("/a", isRecord, { method: "POST", body: { x: 1 } });
    await client().requestJson("/b", isRecord);

    expect(withBody).toContain("application/json");
    expect(withoutBody).toBe("");
  });
});
