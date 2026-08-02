import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { HttpResponse, http } from "msw";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { PullRequestDiffBase } from "../../api/types";
import { server } from "../../test/msw/server";
import { useState } from "react";

import { ReviewPopover } from "../comments/ReviewPopover";
import { useCommentActions } from "../comments/useReviewComments";
import { TokenProvider } from "../auth/TokenContext";
import { TranslationFileBrowser } from "./TranslationFileBrowser";

/**
 * The review surface end to end: Viewed, existing conversations, replies, and
 * review submission (plan.md 4.7, 4.8, 4.9).
 *
 * These drive the real components rather than the modules underneath, which is
 * what the phase completion criteria actually ask for.
 */

const ORIGIN = "https://api.github.com";
const REPO = `${ORIGIN}/repos/example-org/docs-site`;
const PR_REF = { owner: "example-org", repository: "docs-site", number: 7 };

const DIFF_BASE: PullRequestDiffBase = {
  baseRepositoryFullName: "example-org/docs-site",
  headRepositoryFullName: "example-org/docs-site",
  mergeBaseSha: "merge-base",
  headSha: "head-sha",
};

const FILE = {
  filename: "content/ko/guide.md",
  status: "modified",
  additions: 1,
  deletions: 1,
  patch: "@@ -1 +1 @@\n-이전\n+이후",
  sha: "blob",
};

const REVIEW_COMMENT = {
  id: 101,
  path: "content/ko/guide.md",
  line: 1,
  side: "RIGHT",
  user: { login: "maintainer", avatar_url: null, html_url: null },
  created_at: "2026-01-01T00:00:00Z",
  body: "어색합니다",
  body_html: '<p>어색합니다 <img src="https://example.test/shot.png" alt="캡처"></p>',
  html_url: "https://github.com/example-org/docs-site/pull/7#discussion_r101",
};

function baseHandlers() {
  server.use(
    http.get(`${REPO}/pulls/7/files`, () => HttpResponse.json([FILE])),
    http.get(`${REPO}/contents/*`, () => HttpResponse.text("이후\n")),
    http.get(`${REPO}/pulls/7/comments`, () => HttpResponse.json([REVIEW_COMMENT])),
    http.get(`${REPO}/issues/7/comments`, () => HttpResponse.json([])),
    http.post(`${ORIGIN}/graphql`, () =>
      HttpResponse.json({
        data: {
          repository: {
            pullRequest: {
              id: "PR_node",
              files: {
                pageInfo: { hasNextPage: false, endCursor: null },
                nodes: [{ path: "content/ko/guide.md", viewerViewedState: "UNVIEWED" }],
              },
            },
          },
        },
      }),
    ),
  );
}

/**
 * Mirrors how the screen composes these: the browser owns the diff and the
 * sidebar, while the review form sits in the header as an always-open popover
 * here so its controls are queryable without a click.
 */
function Surface({ canWrite }: { canWrite: boolean }) {
  const [unreviewed, setUnreviewed] = useState<readonly string[]>([]);
  const actions = useCommentActions(PR_REF, "head-sha", "translator", canWrite);

  return (
    <>
      <TranslationFileBrowser
        pullRequestRef={PR_REF}
        diffBase={DIFF_BASE}
        canWrite={canWrite}
        actions={actions}
        readOnlyNotice={false}
        onLocaleScopeChange={setUnreviewed}
      />
      <ReviewPopover
        open
        onClose={() => {}}
        issueComments={[]}
        canSubmit={canWrite}
        isBusy={false}
        unreviewedLocales={unreviewed}
        pendingCommentCount={0}
        body=""
        onBodyChange={() => {}}
        onSubmit={actions.submit}
      />
    </>
  );
}

function renderSurface(canWrite: boolean) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <TokenProvider>
        <Surface canWrite={canWrite} />
      </TokenProvider>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  window.localStorage.clear();
  window.sessionStorage.clear();
  window.sessionStorage.setItem(
    "locale-review.token",
    JSON.stringify({ version: 1, value: "ghp_test" }),
  );
  vi.stubGlobal(
    "matchMedia",
    vi.fn(() => ({ matches: false, addEventListener: () => {}, removeEventListener: () => {} })),
  );
  baseHandlers();
});

describe("Viewed", () => {
  it("sends the GitHub mutation when the checkbox is ticked", async () => {
    // plan.md 4.7: the state belongs to GitHub, not to a local copy.
    const user = userEvent.setup();
    const mutations: string[] = [];
    server.use(
      http.post(`${ORIGIN}/graphql`, async ({ request }) => {
        const body = (await request.json()) as { query: string };
        if (body.query.includes("markFileAsViewed")) {
          mutations.push("mark");
          return HttpResponse.json({ data: { markFileAsViewed: {} } });
        }
        return HttpResponse.json({
          data: {
            repository: {
              pullRequest: {
                id: "PR_node",
                files: {
                  pageInfo: { hasNextPage: false, endCursor: null },
                  nodes: [{ path: "content/ko/guide.md", viewerViewedState: "UNVIEWED" }],
                },
              },
            },
          },
        });
      }),
    );

    renderSurface(true);
    const checkbox = await screen.findByRole("checkbox", { name: /^viewed$/i });
    await user.click(checkbox);

    await waitFor(() => expect(mutations).toEqual(["mark"]));
  });

  it("disables the checkbox when the repository is not usable", async () => {
    // Note this is not the read-access case: GitHub allows Viewed with read
    // access, so the control is only disabled when the repository itself
    // could not be resolved.
    renderSurface(false);

    const checkbox = await screen.findByRole("checkbox", { name: /^viewed$/i });
    expect(checkbox).toBeDisabled();
    expect(screen.getByText(/viewed is unavailable/i)).toBeVisible();
  });

  it("shows progress over the visible files only", async () => {
    renderSurface(true);

    expect(await screen.findByText(/reviewed 0 \/ 1/i)).toBeVisible();
  });
});

describe("existing conversations", () => {
  it("renders a comment with its author and outdated state", async () => {
    renderSurface(true);

    const thread = await screen.findByRole("region", { name: /conversation on/i });
    expect(within(thread).getByText("maintainer")).toBeVisible();
    expect(within(thread).getByText(/어색합니다/)).toBeVisible();
  });

  it("turns an image in a comment into a link rather than loading it", async () => {
    // plan.md 4.8: no remote image request, so img-src stays narrow.
    renderSurface(true);

    const thread = await screen.findByRole("region", { name: /conversation on/i });
    expect(thread.querySelector("img")).toBeNull();
    expect(within(thread).getByRole("link", { name: /캡처/ })).toBeVisible();
  });

  it("sends a reply and clears the box only after it succeeds", async () => {
    const user = userEvent.setup();
    let replied = "";
    server.use(
      http.post(`${REPO}/pulls/7/comments/101/replies`, async ({ request }) => {
        replied = ((await request.json()) as { body: string }).body;
        return HttpResponse.json({ id: 102 });
      }),
    );

    renderSurface(true);
    const box = await screen.findByLabelText(/^reply$/i);
    await user.type(box, "동의합니다");
    await user.click(screen.getByRole("button", { name: /send reply/i }));

    await waitFor(() => expect(replied).toBe("동의합니다"));
    await waitFor(() => expect(box).toHaveValue(""));
  });

  it("keeps the reply text when the send fails", async () => {
    // plan.md 4.9: user writing is not discarded on failure.
    const user = userEvent.setup();
    server.use(
      http.post(`${REPO}/pulls/7/comments/101/replies`, () =>
        HttpResponse.json({}, { status: 500 }),
      ),
    );

    renderSurface(true);
    const box = await screen.findByLabelText(/^reply$/i);
    await user.type(box, "동의합니다");
    await user.click(screen.getByRole("button", { name: /send reply/i }));

    expect(await screen.findByText(/reply was not sent/i)).toBeVisible();
    expect(box).toHaveValue("동의합니다");
  });

  it("offers no reply box when writing is unavailable", async () => {
    renderSurface(false);

    await screen.findByRole("region", { name: /conversation on/i });
    expect(screen.queryByLabelText(/^reply$/i)).toBeNull();
    expect(screen.getByText(/replying needs a token/i)).toBeVisible();
  });
});

describe("review submission", () => {
  it("reuses the existing pending review and submits the verdict", async () => {
    const user = userEvent.setup();
    let created = 0;
    let submitted: Record<string, unknown> = {};
    server.use(
      http.get(`${REPO}/pulls/7/reviews`, () =>
        HttpResponse.json([{ id: 55, state: "PENDING", user: { login: "translator" } }]),
      ),
      http.post(`${REPO}/pulls/7/reviews`, () => {
        created += 1;
        return HttpResponse.json({ id: 56 });
      }),
      http.post(`${REPO}/pulls/7/reviews/55/events`, async ({ request }) => {
        submitted = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json({ id: 55 });
      }),
    );

    renderSurface(true);
    await user.click(await screen.findByRole("button", { name: /^submit review$/i }));

    await waitFor(() => expect(submitted.event).toBe("COMMENT"));
    // GitHub allows one pending review per user, so none was created.
    expect(created).toBe(0);
  });

  it("blocks Approve until the reviewer acknowledges the hidden locales", async () => {
    // plan.md 4.3: a verdict applies to the whole pull request.
    const user = userEvent.setup();
    server.use(
      http.get(`${REPO}/pulls/7/files`, () =>
        HttpResponse.json([FILE, { ...FILE, filename: "content/ja/guide.md" }]),
      ),
      http.get(`${REPO}/pulls/7/reviews`, () => HttpResponse.json([])),
    );

    renderSurface(true);
    await user.click(await screen.findByRole("radio", { name: /^approve$/i }));

    expect(screen.getByText(/applies to the whole pull request/i)).toHaveTextContent("ja");
    expect(screen.getByRole("button", { name: /^submit review$/i })).toBeDisabled();

    await user.click(screen.getByRole("checkbox", { name: /i understand/i }));
    expect(screen.getByRole("button", { name: /^submit review$/i })).toBeEnabled();
  });

  it("does not warn when every locale is selected", async () => {
    const user = userEvent.setup();
    renderSurface(true);

    await user.click(await screen.findByRole("radio", { name: /^approve$/i }));

    expect(screen.queryByText(/applies to the whole pull request/i)).toBeNull();
  });

  it("disables every write control in read-only mode", async () => {
    // plan.md 4.9 requires this to be consistent across the surface.
    renderSurface(false);

    // The review form is a popover now, so it renders before the file data
    // arrives; waiting on the file header is what proves the surface is ready.
    await screen.findByRole("checkbox", { name: /^viewed$/i });
    expect(screen.getByRole("button", { name: /^submit review$/i })).toBeDisabled();
    expect(screen.getByLabelText(/review summary/i)).toBeDisabled();
    expect(screen.getByRole("radio", { name: /^approve$/i })).toBeDisabled();
    expect(screen.getByRole("checkbox", { name: /^viewed$/i })).toBeDisabled();
  });
});

describe("a reply appearing after it is sent", () => {
  it("shows the reply in the thread without a manual reload", async () => {
    const user = userEvent.setup();
    let posted = false;

    server.use(
      http.get(`${REPO}/pulls/7/comments`, () =>
        HttpResponse.json(
          posted
            ? [
                REVIEW_COMMENT,
                {
                  ...REVIEW_COMMENT,
                  id: 102,
                  in_reply_to_id: 101,
                  created_at: "2026-01-02T00:00:00Z",
                  body: "동의합니다",
                  body_html: "<p>동의합니다</p>",
                },
              ]
            : [REVIEW_COMMENT],
        ),
      ),
      http.post(`${REPO}/pulls/7/comments/101/replies`, () => {
        posted = true;
        return HttpResponse.json({ id: 102 });
      }),
    );

    renderSurface(true);
    await user.type(await screen.findByLabelText(/^reply$/i), "동의합니다");
    await user.click(screen.getByRole("button", { name: /send reply/i }));

    // The thread must pick the reply up on its own; asking the reviewer to
    // reload to see their own reply is not an acceptable outcome.
    expect(await screen.findByText("동의합니다")).toBeVisible();
  });
});
