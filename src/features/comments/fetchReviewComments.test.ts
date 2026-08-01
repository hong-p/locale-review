import { HttpResponse, http } from "msw";
import { describe, expect, it } from "vitest";

import { createGitHubClient } from "../../api/client";
import { server } from "../../test/msw/server";
import {
  type ReviewComment,
  fetchIssueComments,
  fetchReviewComments,
  groupIntoThreads,
  threadsForFile,
} from "./fetchReviewComments";

const ORIGIN = "https://api.github.com";
const REF = { owner: "example-org", repository: "docs-site", number: 7 };
const COMMENTS = `${ORIGIN}/repos/example-org/docs-site/pulls/7/comments`;
const client = () => createGitHubClient({ token: "ghp_test" });

const raw = (overrides: Record<string, unknown> = {}) => ({
  id: 1,
  path: "content/ko/guide.md",
  line: 12,
  side: "RIGHT",
  user: { login: "reviewer", avatar_url: "https://avatars.test/r.png", html_url: null },
  created_at: "2026-01-01T00:00:00Z",
  body: "어색합니다",
  body_html: "<p>어색합니다</p>",
  html_url: "https://github.com/example-org/docs-site/pull/7#discussion_r1",
  ...overrides,
});

describe("fetchReviewComments", () => {
  it("asks for the full media type so raw and rendered arrive together", async () => {
    // plan.md 4.8: rendered HTML for display, raw markdown for editing.
    let accept = "";
    server.use(
      http.get(COMMENTS, ({ request }) => {
        accept = request.headers.get("accept") ?? "";
        return HttpResponse.json([raw()]);
      }),
    );

    const comments = await fetchReviewComments(client(), REF);

    expect(accept).toContain("full");
    expect(comments[0].body).toBe("어색합니다");
    expect(comments[0].bodyHtml).toBe("<p>어색합니다</p>");
  });

  it("marks a comment outdated when GitHub no longer gives it a line", async () => {
    server.use(http.get(COMMENTS, () => HttpResponse.json([raw({ line: null })])));

    const [comment] = await fetchReviewComments(client(), REF);

    expect(comment.outdated).toBe(true);
    expect(comment.line).toBeNull();
  });

  it("keeps the side the comment was made on", async () => {
    server.use(http.get(COMMENTS, () => HttpResponse.json([raw({ side: "LEFT" })])));

    expect((await fetchReviewComments(client(), REF))[0].side).toBe("LEFT");
  });

  it("tolerates a deleted author", async () => {
    server.use(http.get(COMMENTS, () => HttpResponse.json([raw({ user: null })])));

    expect((await fetchReviewComments(client(), REF))[0].author).toBeNull();
  });

  it("follows pagination", async () => {
    server.use(
      http.get(COMMENTS, ({ request }) => {
        const page = new URL(request.url).searchParams.get("page") ?? "1";
        if (page === "1") {
          return HttpResponse.json([raw({ id: 1 })], {
            headers: { link: `<${COMMENTS}?page=2>; rel="next"` },
          });
        }
        return HttpResponse.json([raw({ id: 2 })]);
      }),
    );

    expect(await fetchReviewComments(client(), REF)).toHaveLength(2);
  });
});

describe("fetchIssueComments", () => {
  it("reads the overall review conversation", async () => {
    server.use(
      http.get(`${ORIGIN}/repos/example-org/docs-site/issues/7/comments`, () =>
        HttpResponse.json([
          {
            id: 5,
            user: { login: "maintainer" },
            body: "감사합니다",
            body_html: "<p>감사합니다</p>",
          },
        ]),
      ),
    );

    const [comment] = await fetchIssueComments(client(), REF);

    expect(comment.id).toBe(5);
    expect(comment.author?.login).toBe("maintainer");
  });
});

describe("groupIntoThreads", () => {
  const comment = (overrides: Partial<ReviewComment>): ReviewComment => ({
    id: 1,
    inReplyToId: null,
    path: "a.md",
    line: 1,
    side: "RIGHT",
    author: null,
    createdAt: "2026-01-01T00:00:00Z",
    body: "",
    bodyHtml: "",
    htmlUrl: "",
    outdated: false,
    ...overrides,
  });

  it("groups a reply with the comment it answers", () => {
    const threads = groupIntoThreads([
      comment({ id: 1 }),
      comment({ id: 2, inReplyToId: 1, createdAt: "2026-01-02T00:00:00Z" }),
    ]);

    expect(threads).toHaveLength(1);
    expect(threads[0].comments.map((c) => c.id)).toEqual([1, 2]);
  });

  it("keeps separate conversations apart", () => {
    const threads = groupIntoThreads([comment({ id: 1, line: 1 }), comment({ id: 5, line: 20 })]);

    expect(threads).toHaveLength(2);
  });

  it("orders a thread by time rather than by response order", () => {
    const threads = groupIntoThreads([
      comment({ id: 3, inReplyToId: 1, createdAt: "2026-01-03T00:00:00Z" }),
      comment({ id: 1, createdAt: "2026-01-01T00:00:00Z" }),
      comment({ id: 2, inReplyToId: 1, createdAt: "2026-01-02T00:00:00Z" }),
    ]);

    expect(threads[0].comments.map((c) => c.id)).toEqual([1, 2, 3]);
  });

  it("keeps a reply whose root is missing rather than dropping it", () => {
    // The root may have been deleted, and losing the reply would lose context.
    const threads = groupIntoThreads([comment({ id: 9, inReplyToId: 999 })]);

    expect(threads).toHaveLength(1);
    expect(threads[0].rootId).toBe(9);
  });

  it("returns nothing for no comments", () => {
    expect(groupIntoThreads([])).toEqual([]);
  });
});

describe("threadsForFile", () => {
  it("selects only the threads anchored to one file", () => {
    const threads = groupIntoThreads([
      {
        id: 1,
        inReplyToId: null,
        path: "a.md",
        line: 1,
        side: "RIGHT",
        author: null,
        createdAt: "",
        body: "",
        bodyHtml: "",
        htmlUrl: "",
        outdated: false,
      },
      {
        id: 2,
        inReplyToId: null,
        path: "b.md",
        line: 1,
        side: "RIGHT",
        author: null,
        createdAt: "",
        body: "",
        bodyHtml: "",
        htmlUrl: "",
        outdated: false,
      },
    ]);

    expect(threadsForFile(threads, "a.md")).toHaveLength(1);
  });
});
