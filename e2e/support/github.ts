import type { Page, Route } from "@playwright/test";

/**
 * GitHub fixtures for the browser tests.
 *
 * Interception happens at Playwright's network layer rather than through a
 * mock inside the app, so these run against the same bundle that ships. The
 * app has no test-only code path.
 */

export const OWNER = "example-org";
export const REPO = "docs-site";
export const NUMBER = 7;
export const PR_ROUTE = `/#/github/${OWNER}/${REPO}/pull/${NUMBER}`;
export const TOKEN = "ghp_browser_test_token";

const REPO_API = `https://api.github.com/repos/${OWNER}/${REPO}`;

/** A file long enough that the panels actually scroll (plan.md 4.6). */
function longKorean(edited: boolean): string {
  const lines = Array.from({ length: 120 }, (_, i) => `한국어 본문 ${i + 1}번 줄입니다.`);
  if (edited) lines[59] = "한국어 본문 60번 줄을 수정했습니다.";
  return `${lines.join("\n")}\n`;
}

function longEnglish(): string {
  return `${Array.from({ length: 120 }, (_, i) => `English source line ${i + 1}.`).join("\n")}\n`;
}

export type Overrides = {
  /** Extra changed files beyond the Korean one. */
  extraFiles?: Array<{ filename: string; patch?: string | null }>;
  /** Comments returned for the review conversation. */
  reviewComments?: unknown[];
  /** Viewed state for the Korean file. */
  viewedState?: "VIEWED" | "UNVIEWED";
  /** Whether the token may write to the repository. */
  canWrite?: boolean;
  /** Content served for a path containing this fragment. */
  contentFor?: (path: string) => string | null;
};

export type Recorder = {
  contentRequests: string[];
  graphqlMutations: string[];
  posted: Array<{ url: string; body: unknown }>;
};

/**
 * Seeds the token and installs every handler the app needs.
 *
 * Returns a recorder so a test can assert on what the app actually requested,
 * which is how lazy loading and mutation behaviour are checked.
 */
export async function mockGitHub(page: Page, overrides: Overrides = {}): Promise<Recorder> {
  const recorder: Recorder = { contentRequests: [], graphqlMutations: [], posted: [] };
  const canWrite = overrides.canWrite ?? true;

  // The app reads the token before its first render, so it has to be in place
  // before any script runs.
  await page.addInitScript(
    ([key, value]) => {
      window.sessionStorage.setItem(key, JSON.stringify({ version: 1, value }));
    },
    ["locale-review.token", TOKEN],
  );

  const json = (route: Route, body: unknown, status = 200) =>
    route.fulfill({
      status,
      contentType: "application/json",
      headers: { "access-control-allow-origin": "*" },
      body: JSON.stringify(body),
    });

  await page.route("https://api.github.com/user", (route) =>
    json(route, { login: "translator", avatar_url: null, html_url: null }),
  );

  await page.route(REPO_API, (route) =>
    json(route, { private: false, permissions: { pull: true, push: canWrite } }),
  );

  await page.route(`${REPO_API}/pulls/${NUMBER}`, (route) =>
    json(route, {
      number: NUMBER,
      title: "설치 안내 번역 업데이트",
      state: "open",
      draft: false,
      merged_at: null,
      html_url: `https://github.com/${OWNER}/${REPO}/pull/${NUMBER}`,
      user: { login: "translator", avatar_url: null, html_url: null },
      base: { ref: "main", sha: "base-tip", repo: { full_name: `${OWNER}/${REPO}` } },
      head: { ref: "ko-install", sha: "head-sha", repo: { full_name: `${OWNER}/${REPO}` } },
    }),
  );

  await page.route(`${REPO_API}/compare/**`, (route) =>
    json(route, { merge_base_commit: { sha: "merge-base-sha" } }),
  );

  await page.route(`${REPO_API}/pulls/${NUMBER}/files**`, (route) =>
    json(route, [
      {
        filename: "content/ko/guide.md",
        status: "modified",
        additions: 1,
        deletions: 1,
        patch:
          "@@ -58,3 +58,3 @@\n a\n-한국어 본문 60번 줄입니다.\n+한국어 본문 60번 줄을 수정했습니다.\n a",
        sha: "blob-ko",
      },
      ...(overrides.extraFiles ?? []).map((file) => ({
        status: "modified",
        additions: 1,
        deletions: 1,
        patch: "@@ -1 +1 @@\n-a\n+b",
        sha: "blob-extra",
        ...file,
      })),
    ]),
  );

  await page.route(`${REPO_API}/pulls/${NUMBER}/comments**`, async (route) => {
    if (route.request().method() === "GET") {
      return json(route, overrides.reviewComments ?? []);
    }
    recorder.posted.push({
      url: route.request().url(),
      body: route.request().postDataJSON(),
    });
    return json(route, { id: 999 });
  });

  await page.route(`${REPO_API}/pulls/${NUMBER}/comments/*/replies`, async (route) => {
    recorder.posted.push({ url: route.request().url(), body: route.request().postDataJSON() });
    return json(route, { id: 1000 });
  });

  await page.route(`${REPO_API}/issues/${NUMBER}/comments**`, (route) => json(route, []));

  await page.route(`${REPO_API}/pulls/${NUMBER}/reviews**`, async (route) => {
    const request = route.request();
    if (request.method() === "GET") {
      return json(route, [{ id: 55, state: "PENDING", user: { login: "translator" }, body: "" }]);
    }
    recorder.posted.push({ url: request.url(), body: request.postDataJSON() });
    return json(route, { id: 55 });
  });

  await page.route("https://api.github.com/graphql", async (route) => {
    const body = route.request().postDataJSON() as { query?: string };
    const query = body?.query ?? "";

    if (query.includes("markFileAsViewed")) {
      recorder.graphqlMutations.push("mark");
      return json(route, { data: { markFileAsViewed: {} } });
    }
    if (query.includes("unmarkFileAsViewed")) {
      recorder.graphqlMutations.push("unmark");
      return json(route, { data: { unmarkFileAsViewed: {} } });
    }

    return json(route, {
      data: {
        repository: {
          pullRequest: {
            id: "PR_node",
            files: {
              pageInfo: { hasNextPage: false, endCursor: null },
              nodes: [
                {
                  path: "content/ko/guide.md",
                  viewerViewedState: overrides.viewedState ?? "UNVIEWED",
                },
              ],
            },
          },
        },
      },
    });
  });

  // Content is last so the more specific routes above win.
  await page.route("https://api.github.com/repos/*/*/contents/**", (route) => {
    const url = new URL(route.request().url());
    recorder.contentRequests.push(url.pathname);

    const custom = overrides.contentFor?.(url.pathname);
    if (custom !== undefined && custom !== null) {
      return route.fulfill({ status: 200, contentType: "text/plain", body: custom });
    }

    const isSource = url.pathname.includes("/content/en/");
    const isHead = url.searchParams.get("ref") === "head-sha";
    const body = isSource ? longEnglish() : longKorean(isHead);

    return route.fulfill({ status: 200, contentType: "text/plain", body });
  });

  return recorder;
}

/** Opens the pull request route and waits for the diff to be on screen. */
export async function openPullRequest(page: Page): Promise<void> {
  await page.goto(PR_ROUTE);
  await page.getByRole("region", { name: "After" }).waitFor();
}
