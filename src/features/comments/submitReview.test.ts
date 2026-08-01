import { HttpResponse, http } from "msw";
import { describe, expect, it } from "vitest";

import { createGitHubClient } from "../../api/client";
import { server } from "../../test/msw/server";
import {
  addPendingComment,
  ensurePendingReview,
  findPendingReview,
  postImmediateComment,
  replyToComment,
  submitReview,
} from "./submitReview";

const ORIGIN = "https://api.github.com";
const REF = { owner: "example-org", repository: "docs-site", number: 7 };
const PULLS = `${ORIGIN}/repos/example-org/docs-site/pulls/7`;
const HEAD = "head-sha";

const client = () => createGitHubClient({ token: "ghp_test" });

describe("postImmediateComment", () => {
  it("places the comment with commit_id, line, and side rather than position", async () => {
    // plan.md 4.9: `position` is deprecated.
    let body: Record<string, unknown> = {};
    server.use(
      http.post(`${PULLS}/comments`, async ({ request }) => {
        body = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json({ id: 1 });
      }),
    );

    await postImmediateComment(client(), REF, HEAD, {
      path: "content/ko/guide.md",
      line: 12,
      side: "RIGHT",
      body: "어색합니다",
    });

    expect(body).toMatchObject({
      commit_id: HEAD,
      path: "content/ko/guide.md",
      line: 12,
      side: "RIGHT",
      body: "어색합니다",
    });
    expect(body).not.toHaveProperty("position");
  });

  it("sends LEFT for a comment on the before panel", async () => {
    let body: Record<string, unknown> = {};
    server.use(
      http.post(`${PULLS}/comments`, async ({ request }) => {
        body = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json({ id: 1 });
      }),
    );

    await postImmediateComment(client(), REF, HEAD, {
      path: "a.md",
      line: 3,
      side: "LEFT",
      body: "x",
    });

    expect(body.side).toBe("LEFT");
  });

  it("adds start_line and start_side for a multi-line comment", async () => {
    let body: Record<string, unknown> = {};
    server.use(
      http.post(`${PULLS}/comments`, async ({ request }) => {
        body = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json({ id: 1 });
      }),
    );

    await postImmediateComment(client(), REF, HEAD, {
      path: "a.md",
      line: 10,
      side: "RIGHT",
      startLine: 8,
      body: "x",
    });

    expect(body).toMatchObject({ start_line: 8, start_side: "RIGHT" });
  });

  it("does not retry a failed post", async () => {
    // plan.md 3.2: a retried comment posts twice.
    let calls = 0;
    server.use(
      http.post(`${PULLS}/comments`, () => {
        calls += 1;
        return HttpResponse.json({}, { status: 500 });
      }),
    );

    await expect(
      postImmediateComment(client(), REF, HEAD, {
        path: "a.md",
        line: 1,
        side: "RIGHT",
        body: "x",
      }),
    ).rejects.toThrow();
    expect(calls).toBe(1);
  });
});

describe("replyToComment", () => {
  it("posts to the reply endpoint of the thread root", async () => {
    let path = "";
    server.use(
      http.post(`${PULLS}/comments/:id/replies`, ({ request }) => {
        path = new URL(request.url).pathname;
        return HttpResponse.json({ id: 2 });
      }),
    );

    await replyToComment(client(), REF, 55, "동의합니다");

    expect(path).toContain("/comments/55/replies");
  });
});

describe("pending review", () => {
  const reviews = (...items: Record<string, unknown>[]) =>
    server.use(http.get(`${PULLS}/reviews`, () => HttpResponse.json(items)));

  it("finds the viewer's own pending review", async () => {
    reviews(
      { id: 1, state: "APPROVED", user: { login: "someone" } },
      { id: 2, state: "PENDING", user: { login: "translator" }, body: "wip" },
    );

    expect(await findPendingReview(client(), REF, "translator")).toEqual({ id: 2, body: "wip" });
  });

  it("ignores another user's pending review", async () => {
    reviews({ id: 2, state: "PENDING", user: { login: "someone-else" } });

    expect(await findPendingReview(client(), REF, "translator")).toBeNull();
  });

  it("reuses an existing pending review instead of creating a second", async () => {
    // GitHub allows only one per user per pull request.
    let created = 0;
    reviews({ id: 9, state: "PENDING", user: { login: "translator" }, body: "" });
    server.use(
      http.post(`${PULLS}/reviews`, () => {
        created += 1;
        return HttpResponse.json({ id: 10 });
      }),
    );

    const review = await ensurePendingReview(client(), REF, "translator");

    expect(review.id).toBe(9);
    expect(created).toBe(0);
  });

  it("creates one when the user has none", async () => {
    reviews();
    server.use(http.post(`${PULLS}/reviews`, () => HttpResponse.json({ id: 11 })));

    expect((await ensurePendingReview(client(), REF, "translator")).id).toBe(11);
  });

  it("recovers the existing review when creation races and returns 422", async () => {
    // plan.md 4.9: another tab may have created one in between.
    let listCalls = 0;
    server.use(
      http.get(`${PULLS}/reviews`, () => {
        listCalls += 1;
        return HttpResponse.json(
          listCalls === 1 ? [] : [{ id: 12, state: "PENDING", user: { login: "translator" } }],
        );
      }),
      http.post(`${PULLS}/reviews`, () => HttpResponse.json({}, { status: 422 })),
    );

    expect((await ensurePendingReview(client(), REF, "translator")).id).toBe(12);
  });

  it("fails loudly when a 422 cannot be explained by an existing review", async () => {
    reviews();
    server.use(http.post(`${PULLS}/reviews`, () => HttpResponse.json({}, { status: 422 })));

    await expect(ensurePendingReview(client(), REF, "translator")).rejects.toThrow();
  });
});

describe("addPendingComment", () => {
  it("adds to the review rather than posting immediately", async () => {
    let path = "";
    server.use(
      http.post(`${PULLS}/reviews/:id/comments`, ({ request }) => {
        path = new URL(request.url).pathname;
        return HttpResponse.json({ id: 3 });
      }),
    );

    await addPendingComment(client(), REF, 9, HEAD, {
      path: "a.md",
      line: 1,
      side: "RIGHT",
      body: "x",
    });

    expect(path).toContain("/reviews/9/comments");
  });
});

describe("submitReview", () => {
  const events: Array<"COMMENT" | "APPROVE" | "REQUEST_CHANGES"> = [
    "COMMENT",
    "APPROVE",
    "REQUEST_CHANGES",
  ];

  for (const event of events) {
    it(`submits ${event}`, async () => {
      let body: Record<string, unknown> = {};
      server.use(
        http.post(`${PULLS}/reviews/:id/events`, async ({ request }) => {
          body = (await request.json()) as Record<string, unknown>;
          return HttpResponse.json({ id: 9 });
        }),
      );

      await submitReview(client(), REF, 9, event, "전반적으로 좋습니다");

      expect(body).toEqual({ event, body: "전반적으로 좋습니다" });
    });
  }

  it("does not retry a failed submission", async () => {
    let calls = 0;
    server.use(
      http.post(`${PULLS}/reviews/:id/events`, () => {
        calls += 1;
        return HttpResponse.json({}, { status: 500 });
      }),
    );

    await expect(submitReview(client(), REF, 9, "APPROVE", "")).rejects.toThrow();
    expect(calls).toBe(1);
  });
});
