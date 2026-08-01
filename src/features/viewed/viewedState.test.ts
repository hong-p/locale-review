import { HttpResponse, http } from "msw";
import { describe, expect, it } from "vitest";

import { createGitHubClient } from "../../api/client";
import { server } from "../../test/msw/server";
import { fetchViewedState, setFileViewed, toViewedMap, viewedProgress } from "./viewedState";

const ORIGIN = "https://api.github.com";
const REF = { owner: "example-org", repository: "docs-site", number: 7 };
const client = () => createGitHubClient({ token: "ghp_test" });

const page = (nodes: Array<{ path: string; viewerViewedState: string }>, next?: string) => ({
  data: {
    repository: {
      pullRequest: {
        id: "PR_node",
        files: {
          pageInfo: { hasNextPage: next !== undefined, endCursor: next ?? null },
          nodes,
        },
      },
    },
  },
});

describe("fetchViewedState", () => {
  it("reads each file's state and the pull request node id", async () => {
    server.use(
      http.post(`${ORIGIN}/graphql`, () =>
        HttpResponse.json(
          page([
            { path: "content/ko/a.md", viewerViewedState: "VIEWED" },
            { path: "content/ko/b.md", viewerViewedState: "UNVIEWED" },
          ]),
        ),
      ),
    );

    const snapshot = await fetchViewedState(client(), REF);

    expect(snapshot.pullRequestId).toBe("PR_node");
    expect(snapshot.files).toEqual([
      { path: "content/ko/a.md", state: "VIEWED" },
      { path: "content/ko/b.md", state: "UNVIEWED" },
    ]);
  });

  it("walks the cursor to the end rather than reading only the first page", async () => {
    // plan.md 3.4 and 6: a pull request over 100 files would silently lose its
    // Viewed state otherwise.
    let call = 0;
    server.use(
      http.post(`${ORIGIN}/graphql`, () => {
        call += 1;
        return HttpResponse.json(
          call === 1
            ? page([{ path: "a.md", viewerViewedState: "VIEWED" }], "cursor-1")
            : page([{ path: "b.md", viewerViewedState: "UNVIEWED" }]),
        );
      }),
    );

    const snapshot = await fetchViewedState(client(), REF);

    expect(call).toBe(2);
    expect(snapshot.files.map((f) => f.path)).toEqual(["a.md", "b.md"]);
  });

  it("passes the cursor back on the next page", async () => {
    const cursors: unknown[] = [];
    let call = 0;
    server.use(
      http.post(`${ORIGIN}/graphql`, async ({ request }) => {
        const body = (await request.json()) as { variables?: { cursor?: unknown } };
        cursors.push(body.variables?.cursor);
        call += 1;
        return HttpResponse.json(
          call === 1 ? page([{ path: "a.md", viewerViewedState: "VIEWED" }], "c1") : page([]),
        );
      }),
    );

    await fetchViewedState(client(), REF);

    expect(cursors).toEqual([null, "c1"]);
  });

  it("treats an unknown state as unviewed rather than guessing", () => {
    server.use(
      http.post(`${ORIGIN}/graphql`, () =>
        HttpResponse.json(page([{ path: "a.md", viewerViewedState: "SOMETHING_NEW" }])),
      ),
    );

    return expect(fetchViewedState(client(), REF).then((s) => s.files[0].state)).resolves.toBe(
      "UNVIEWED",
    );
  });

  it("returns nothing when the pull request is absent", async () => {
    server.use(
      http.post(`${ORIGIN}/graphql`, () =>
        HttpResponse.json({ data: { repository: { pullRequest: null } } }),
      ),
    );

    expect((await fetchViewedState(client(), REF)).files).toEqual([]);
  });
});

describe("setFileViewed", () => {
  it("marks a file viewed through the GitHub mutation", async () => {
    // plan.md 4.7 forbids a separate local implementation.
    let query = "";
    server.use(
      http.post(`${ORIGIN}/graphql`, async ({ request }) => {
        query = ((await request.json()) as { query: string }).query;
        return HttpResponse.json({ data: { markFileAsViewed: {} } });
      }),
    );

    await setFileViewed(client(), "PR_node", "a.md", true);

    expect(query).toContain("markFileAsViewed");
  });

  it("unmarks through the matching mutation", async () => {
    let query = "";
    server.use(
      http.post(`${ORIGIN}/graphql`, async ({ request }) => {
        query = ((await request.json()) as { query: string }).query;
        return HttpResponse.json({ data: { unmarkFileAsViewed: {} } });
      }),
    );

    await setFileViewed(client(), "PR_node", "a.md", false);

    expect(query).toContain("unmarkFileAsViewed");
  });

  it("surfaces a failure instead of pretending it worked", async () => {
    server.use(
      http.post(`${ORIGIN}/graphql`, () =>
        HttpResponse.json({ errors: [{ message: "Resource not accessible" }] }),
      ),
    );

    await expect(setFileViewed(client(), "PR_node", "a.md", true)).rejects.toThrow();
  });
});

describe("viewedProgress", () => {
  const states = toViewedMap([
    { path: "a.md", state: "VIEWED" },
    { path: "b.md", state: "UNVIEWED" },
    { path: "c.md", state: "VIEWED" },
    { path: "hidden.md", state: "VIEWED" },
  ]);

  it("counts only the files the locale filter is showing", () => {
    // plan.md 4.7: progress reflects what the reviewer is looking at, while
    // each file's own state stays whatever GitHub says.
    expect(viewedProgress(["a.md", "b.md", "c.md"], states)).toEqual({ viewed: 2, total: 3 });
  });

  it("ignores a file outside the current filter", () => {
    expect(viewedProgress(["b.md"], states)).toEqual({ viewed: 0, total: 1 });
  });

  it("treats a dismissed file as not viewed", () => {
    const dismissed = toViewedMap([{ path: "a.md", state: "DISMISSED" }]);

    expect(viewedProgress(["a.md"], dismissed)).toEqual({ viewed: 0, total: 1 });
  });

  it("handles an empty selection", () => {
    expect(viewedProgress([], states)).toEqual({ viewed: 0, total: 0 });
  });
});
