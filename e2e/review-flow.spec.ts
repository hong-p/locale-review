import { expect, test } from "@playwright/test";

import { mockGitHub, openPullRequest } from "./support/github";

/**
 * plan.md 9's browser checklist, run against the built bundle.
 *
 * These exist for what jsdom cannot answer: real layout, real scrolling, real
 * media queries. A component test can prove a handler was called; only a
 * browser can prove the reviewer can see and reach the thing.
 */

test("opens an authorised pull request and shows all three panels", async ({ page }) => {
  // Explicitly wide: below the breakpoint the app deliberately shows one panel
  // at a time, which the narrow-screen test covers.
  await page.setViewportSize({ width: 1400, height: 900 });
  await mockGitHub(page);
  await openPullRequest(page);

  await expect(page.getByRole("heading", { name: /설치 안내 번역 업데이트/ })).toBeVisible();
  for (const name of ["Source", "Before", "After"]) {
    await expect(page.getByRole("region", { name, exact: true })).toBeVisible();
  }
});

test("lays the panels out side by side on a wide screen", async ({ page }) => {
  // jsdom applies no CSS, so this is the first check that the grid is a grid.
  await page.setViewportSize({ width: 1400, height: 900 });
  await mockGitHub(page);
  await openPullRequest(page);

  const boxes = await Promise.all(
    ["Source", "Before", "After"].map((name) =>
      page.getByRole("region", { name, exact: true }).boundingBox(),
    ),
  );

  const tops = boxes.map((box) => box?.y ?? 0);
  const lefts = boxes.map((box) => box?.x ?? 0);

  // Same row, increasing x: three columns rather than three stacked blocks.
  expect(Math.max(...tops) - Math.min(...tops)).toBeLessThan(4);
  expect(lefts[0]).toBeLessThan(lefts[1]);
  expect(lefts[1]).toBeLessThan(lefts[2]);
});

test("hiding a panel widens the remaining ones", async ({ page }) => {
  await page.setViewportSize({ width: 1400, height: 900 });
  await mockGitHub(page);
  await openPullRequest(page);

  const before = await page.getByRole("region", { name: "After", exact: true }).boundingBox();
  await page.getByRole("checkbox", { name: "Source", exact: true }).uncheck();

  await expect(page.getByRole("region", { name: "Source", exact: true })).toBeHidden();
  const after = await page.getByRole("region", { name: "After", exact: true }).boundingBox();
  expect(after?.width ?? 0).toBeGreaterThan(before?.width ?? 0);
});

test("sync scrolling moves the other panels proportionally", async ({ page }) => {
  // The core reason this test exists: jsdom reports scrollHeight as 0, so the
  // proportional sync has never actually run before now.
  await page.setViewportSize({ width: 1400, height: 700 });
  await mockGitHub(page);
  await openPullRequest(page);

  const scroller = (name: string) =>
    page.getByRole("region", { name, exact: true }).locator("div").first();

  const ratio = (name: string) =>
    scroller(name).evaluate((el) => {
      const scrollable = el.scrollHeight - el.clientHeight;
      return scrollable <= 0 ? -1 : el.scrollTop / scrollable;
    });

  // Nothing to synchronise if the content does not overflow.
  expect(await ratio("After")).toBeGreaterThanOrEqual(0);

  await page.getByRole("checkbox", { name: /sync scrolling/i }).check();
  await scroller("After").evaluate((el) => {
    el.scrollTop = (el.scrollHeight - el.clientHeight) / 2;
    el.dispatchEvent(new Event("scroll"));
  });

  await expect.poll(async () => await ratio("Before"), { timeout: 4000 }).toBeGreaterThan(0.3);
  expect(await ratio("Source")).toBeGreaterThan(0.3);
});

test("panels scroll independently when sync is off", async ({ page }) => {
  await page.setViewportSize({ width: 1400, height: 700 });
  await mockGitHub(page);
  await openPullRequest(page);

  const scroller = (name: string) =>
    page.getByRole("region", { name, exact: true }).locator("div").first();

  await scroller("After").evaluate((el) => {
    el.scrollTop = 400;
    el.dispatchEvent(new Event("scroll"));
  });

  expect(await scroller("Before").evaluate((el) => el.scrollTop)).toBe(0);
});

test("Changes only compresses the translation and keeps the source whole", async ({ page }) => {
  await page.setViewportSize({ width: 1400, height: 900 });
  await mockGitHub(page);
  await openPullRequest(page);

  await page.getByRole("checkbox", { name: /changes only/i }).check();

  // plan.md 4.6: the source must not lose the sentence being translated.
  await expect(page.getByRole("region", { name: "Source", exact: true })).toContainText(
    "English source line 1.",
  );
  await expect(page.getByRole("region", { name: "After", exact: true })).not.toContainText(
    "한국어 본문 1번 줄",
  );
  await expect(page.getByRole("region", { name: "After", exact: true })).toContainText(
    "60번 줄을 수정했습니다",
  );

  await expect(page.getByRole("checkbox", { name: /sync scrolling/i })).toBeDisabled();
  await expect(page.getByText(/scroll sync is off in changes only/i)).toBeVisible();
});

test("switches to one panel at a time on a narrow screen", async ({ page }) => {
  // plan.md 4.6 and 7: three columns are unreadable below the breakpoint.
  await page.setViewportSize({ width: 380, height: 720 });
  await mockGitHub(page);
  await openPullRequest(page);

  await expect(page.getByRole("region", { name: "After", exact: true })).toBeVisible();
  await expect(page.getByRole("region", { name: "Source", exact: true })).toBeHidden();

  await page.getByRole("radio", { name: "Source", exact: true }).check();
  await expect(page.getByRole("region", { name: "Source", exact: true })).toBeVisible();
  await expect(page.getByRole("region", { name: "After", exact: true })).toBeHidden();

  const overflow = await page.evaluate(() => document.body.scrollWidth - document.body.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
});

test("renders right-to-left text without flipping the line numbers", async ({ page }) => {
  await page.setViewportSize({ width: 1400, height: 900 });
  await mockGitHub(page, {
    extraFiles: [{ filename: "content/ar/guide.md" }],
    contentFor: (path) =>
      path.includes("/content/ar/") ? "إنشاء وحدة تخزين دائمة\nسطر آخر\n" : null,
  });
  await page.goto("/#/github/example-org/docs-site/pull/7");

  await page.getByRole("checkbox", { name: /^ar/ }).check();
  await page.getByLabel(/^file$/i).selectOption("content/ar/guide.md");

  const body = page
    .getByRole("region", { name: "After", exact: true })
    .locator('[lang="ar"]')
    .first();
  await expect(body).toHaveAttribute("dir", "rtl");

  // plan.md 4.4: the number column stays on the left even beside RTL text.
  const numberBox = await page
    .getByRole("region", { name: "After", exact: true })
    .locator("span")
    .filter({ hasText: /^1$/ })
    .first()
    .boundingBox();
  const textBox = await body.boundingBox();
  expect(numberBox?.x ?? 0).toBeLessThan(textBox?.x ?? 0);
});

test("filters files by locale and loads content only for the selected one", async ({ page }) => {
  const recorder = await mockGitHub(page, {
    extraFiles: [{ filename: "content/ja/guide.md" }],
  });
  await openPullRequest(page);

  // ko is the default preference, so the Japanese file is hidden.
  await expect(page.getByRole("option", { name: "content/ko/guide.md" })).toBeAttached();
  await expect(page.getByRole("option", { name: "content/ja/guide.md" })).toHaveCount(0);

  expect(recorder.contentRequests.some((path) => path.includes("/content/ja/"))).toBe(false);

  await page.getByRole("checkbox", { name: /^ja/ }).check();
  await page.getByLabel(/^file$/i).selectOption("content/ja/guide.md");

  await expect
    .poll(() => recorder.contentRequests.some((path) => path.includes("/content/ja/")))
    .toBe(true);
});

test("finds text in the panels", async ({ page }) => {
  await mockGitHub(page);
  await openPullRequest(page);

  await page.getByLabel(/find in panels/i).fill("60번 줄을 수정");

  const hits = page
    .getByRole("region", { name: "After", exact: true })
    .locator('[class*="searchHit"]');
  await expect(hits).toHaveCount(1);
});

test("marks a file viewed through GitHub", async ({ page }) => {
  const recorder = await mockGitHub(page);
  await openPullRequest(page);

  // The checkbox reflects GitHub rather than a local copy (plan.md 4.7), and
  // this fixture always answers UNVIEWED, so the assertion is on the mutation
  // reaching GitHub rather than on the box staying ticked.
  await page.getByRole("checkbox", { name: /^viewed$/i }).click();

  await expect.poll(() => recorder.graphqlMutations).toContain("mark");
});

test("shows an existing conversation and sends a reply", async ({ page }) => {
  const recorder = await mockGitHub(page, {
    reviewComments: [
      {
        id: 101,
        path: "content/ko/guide.md",
        line: 60,
        side: "RIGHT",
        user: { login: "maintainer", avatar_url: null, html_url: null },
        created_at: "2026-01-01T00:00:00Z",
        body: "어색합니다",
        body_html: '<p>어색합니다 <img src="https://example.test/s.png" alt="캡처"></p>',
        html_url: "https://github.com/example-org/docs-site/pull/7#discussion_r101",
      },
    ],
  });
  await openPullRequest(page);

  const thread = page.getByRole("region", { name: /conversation on/i });
  await expect(thread).toContainText("maintainer");
  await expect(thread).toContainText("어색합니다");

  // plan.md 4.8: the image is a link, and no image request is made.
  await expect(thread.locator("img")).toHaveCount(0);
  await expect(thread.getByRole("link", { name: /캡처/ })).toBeVisible();

  await page.getByLabel(/^reply$/i).fill("동의합니다");
  await page.getByRole("button", { name: /send reply/i }).click();

  await expect.poll(() => recorder.posted.map((p) => p.url).join(" ")).toContain("/replies");
});

test("submits a review and warns about locales the filter hid", async ({ page }) => {
  const recorder = await mockGitHub(page, {
    extraFiles: [{ filename: "content/ja/guide.md" }],
  });
  await openPullRequest(page);

  await page.getByRole("button", { name: /^review changes$/i }).click();
  await page.getByRole("radio", { name: /^approve$/i }).check();

  // plan.md 4.3: a verdict covers every locale in the pull request.
  await expect(page.getByText(/applies to the whole pull request/i)).toContainText("ja");
  await expect(page.getByRole("button", { name: /^submit review$/i })).toBeDisabled();

  await page.getByRole("checkbox", { name: /i understand/i }).check();
  await page.getByRole("button", { name: /^submit review$/i }).click();

  await expect
    .poll(() => recorder.posted.find((p) => p.url.includes("/events"))?.body)
    .toMatchObject({ event: "APPROVE" });
});

test("keeps reviewing available without push access", async ({ page }) => {
  // GitHub allows comments, approvals, and change requests with read access,
  // and Viewed is a per-user state. Gating these on push would block reviewing
  // other people's open-source repositories, which is the point of this app.
  await mockGitHub(page, { canWrite: false });
  await openPullRequest(page);

  await expect(page.getByRole("checkbox", { name: /^viewed$/i })).toBeEnabled();

  await page.getByRole("button", { name: /^review changes$/i }).click();
  await expect(page.getByLabel(/review summary/i)).toBeEnabled();
  await expect(page.getByRole("radio", { name: /^approve$/i })).toBeEnabled();
});

test("keeps the review summary across a reload", async ({ page }) => {
  // plan.md 4.10: unsent writing survives a reload of the same tab.
  await mockGitHub(page);
  await openPullRequest(page);

  await page.getByRole("button", { name: /^review changes$/i }).click();
  await page.getByLabel(/review summary/i).fill("전반적으로 좋습니다");
  await page.keyboard.press("Escape");

  await page.reload();
  await page.getByRole("region", { name: "After", exact: true }).waitFor();

  await page.getByRole("button", { name: /^review changes$/i }).click();
  await expect(page.getByLabel(/review summary/i)).toHaveValue("전반적으로 좋습니다");
});

test("warns before a refresh that could disturb unsent text", async ({ page }) => {
  await mockGitHub(page);
  await openPullRequest(page);

  await page.getByRole("button", { name: /^review changes$/i }).click();
  await page.getByLabel(/review summary/i).fill("작성 중");
  await page.keyboard.press("Escape");

  await page.getByRole("button", { name: /^refresh$/i }).click();
  await expect(page.getByText(/you have unsent text/i)).toBeVisible();
  await page.getByRole("button", { name: /keep editing/i }).click();

  await page.getByRole("button", { name: /^review changes$/i }).click();
  await expect(page.getByLabel(/review summary/i)).toHaveValue("작성 중");
});

test("writes an inline comment from the line it belongs to", async ({ page }) => {
  // The add button used to be revealed on hover only, which made the whole
  // feature undiscoverable; it is now visible on every commentable line.
  const recorder = await mockGitHub(page);
  await openPullRequest(page);

  const after = page.getByRole("region", { name: "After", exact: true });
  await after.getByRole("button", { name: /add a comment on line 60/i }).click();

  await page.getByLabel(/new comment on line 60/i).fill("여기 표현이 어색합니다");
  await page.getByRole("button", { name: /^comment now$/i }).click();

  await expect
    .poll(() => recorder.posted.find((p) => p.url.endsWith("/comments"))?.body)
    .toMatchObject({ line: 60, side: "RIGHT", body: "여기 표현이 어색합니다" });
});

test("adds an inline comment to the pending review instead of posting it", async ({ page }) => {
  const recorder = await mockGitHub(page);
  await openPullRequest(page);

  const after = page.getByRole("region", { name: "After", exact: true });
  await after.getByRole("button", { name: /add a comment on line 60/i }).click();
  await page.getByLabel(/new comment on line 60/i).fill("리뷰에 모아둡니다");
  await page.getByRole("button", { name: /^add to review$/i }).click();

  // The pending route carries the review id; the immediate route does not.
  await expect
    .poll(() => recorder.posted.map((p) => p.url).join(" "))
    .toContain("/reviews/55/comments");
});

test("offers no add button on a line outside the patch", async ({ page }) => {
  // plan.md 4.9: GitHub rejects a position its own diff does not contain.
  await mockGitHub(page);
  await openPullRequest(page);

  const after = page.getByRole("region", { name: "After", exact: true });
  await expect(after.getByRole("button", { name: /add a comment on line 1$/i })).toHaveCount(0);
  await expect(after.getByRole("button", { name: /add a comment on line 60/i })).toBeVisible();
});

test("shows an existing conversation beside the code, not in the gutter", async ({ page }) => {
  await mockGitHub(page, {
    reviewComments: [
      {
        id: 101,
        path: "content/ko/guide.md",
        line: 60,
        side: "RIGHT",
        user: { login: "maintainer", avatar_url: null, html_url: null },
        created_at: "2026-01-01T00:00:00Z",
        body: "어색합니다",
        body_html: "<p>어색합니다</p>",
        html_url: "https://github.com/example-org/docs-site/pull/7#discussion_r101",
      },
    ],
  });
  await page.setViewportSize({ width: 1400, height: 900 });
  await openPullRequest(page);

  const thread = page.getByRole("region", { name: /conversation on/i });
  await expect(thread).toBeVisible();

  // It should be wide enough to read, not squeezed into the number column.
  const box = await thread.boundingBox();
  const panel = await page.getByRole("region", { name: "After", exact: true }).boundingBox();
  expect((box?.width ?? 0) / (panel?.width ?? 1)).toBeGreaterThan(0.5);
});

test("Close review returns to the start screen", async ({ page }) => {
  await mockGitHub(page);
  await openPullRequest(page);

  await page.getByRole("button", { name: /^close review$/i }).click();

  await expect(page.getByRole("heading", { name: /open a pull request/i })).toBeVisible();
  expect(page.url()).toContain("#/");
  expect(page.url()).not.toContain("/pull/");
});

test("switches to another pull request from the review header", async ({ page }) => {
  await mockGitHub(page);
  await openPullRequest(page);

  // A second pull request, so the switch has somewhere to land.
  await page.route("https://api.github.com/repos/example-org/docs-site/pulls/9", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        number: 9,
        title: "다른 번역 PR",
        state: "open",
        draft: false,
        merged_at: null,
        html_url: "https://github.com/example-org/docs-site/pull/9",
        user: { login: "translator" },
        base: { ref: "main", sha: "b", repo: { full_name: "example-org/docs-site" } },
        head: { ref: "ko-2", sha: "head-sha", repo: { full_name: "example-org/docs-site" } },
      }),
    }),
  );
  await page.route("https://api.github.com/repos/example-org/docs-site/pulls/9/files**", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: "[]" }),
  );

  await page
    .getByPlaceholder(/another pull request url/i)
    .fill("https://github.com/example-org/docs-site/pull/9");
  await page.getByRole("button", { name: /^open$/i }).click();

  await expect(page.getByRole("heading", { name: /다른 번역 PR/ })).toBeVisible();
});

test("rejects a bad URL typed into the review header", async ({ page }) => {
  await mockGitHub(page);
  await openPullRequest(page);

  await page.getByPlaceholder(/another pull request url/i).fill("https://gitlab.com/a/b/pull/1");
  await page.getByRole("button", { name: /^open$/i }).click();

  await expect(page.getByRole("alert")).toContainText(/owner\/repository\/pull/i);
  // Still on the original pull request.
  await expect(page.getByRole("region", { name: "After", exact: true })).toBeVisible();
});

test("does not claim new changes when nothing moved", async ({ page }) => {
  // The banner used to appear on every tab return because the baseline was
  // compared against an empty marker rather than the pull request's own.
  await mockGitHub(page);
  await openPullRequest(page);

  await page.evaluate(() => {
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      get: () => "visible",
    });
    document.dispatchEvent(new Event("visibilitychange"));
  });

  await page.waitForTimeout(500);
  await expect(page.getByText(/new changes are available/i)).toHaveCount(0);
});

test("says why a refused Viewed change failed", async ({ page }) => {
  await mockGitHub(page);
  await page.route("https://api.github.com/graphql", async (route) => {
    const body = route.request().postDataJSON() as { query?: string };
    if (body?.query?.includes("markFileAsViewed")) {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ errors: [{ type: "FORBIDDEN", message: "not accessible" }] }),
      });
    }
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
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
    });
  });
  await openPullRequest(page);

  await page.getByRole("checkbox", { name: /^viewed$/i }).click();

  // Not "GitHub did not accept that change", which gave nothing to act on.
  // The wording names the fine-grained limitation too, since a fine-grained
  // token can never write to a repository the user does not own.
  await expect(page.getByText(/pull requests: read and write/i)).toBeVisible();
  await expect(page.getByText(/public_repo/i)).toBeVisible();
});

test("comments on a range of lines with shift-click", async ({ page }) => {
  // plan.md 4.9 supports start_line/start_side; the panel exposes it by
  // extending the selection rather than requiring a drag.
  const recorder = await mockGitHub(page);
  await openPullRequest(page);

  const after = page.getByRole("region", { name: "After", exact: true });
  // The fixture's hunk covers 58 to 60, and only those lines take a comment.
  await after.getByRole("button", { name: /add a comment on line 58/i }).click();
  await after
    .getByRole("button", { name: /add a comment on line 60/i })
    .click({ modifiers: ["Shift"] });

  await expect(page.getByLabel(/new comment on lines 58–60/i)).toBeVisible();
  await page.getByLabel(/new comment on lines 58–60/i).fill("이 문단 전체가 어색합니다");
  await page.getByRole("button", { name: /^comment now$/i }).click();

  await expect
    .poll(() => recorder.posted.find((p) => p.url.endsWith("/comments"))?.body)
    .toMatchObject({ line: 60, start_line: 58, side: "RIGHT", start_side: "RIGHT" });
});

test("refresh reports that it ran", async ({ page }) => {
  // It used to invalidate queries whose contents are keyed by commit and
  // marked permanently fresh, so nothing refetched and nothing changed.
  await mockGitHub(page);
  await openPullRequest(page);

  let refetched = 0;
  await page.route(
    "https://api.github.com/repos/example-org/docs-site/pulls/7/files**",
    (route) => {
      refetched += 1;
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify([
          {
            filename: "content/ko/guide.md",
            status: "modified",
            additions: 1,
            deletions: 1,
            patch: "@@ -58,3 +58,3 @@\n a\n-b\n+c\n a",
            sha: "blob-ko",
          },
        ]),
      });
    },
  );

  await page.getByRole("button", { name: /^refresh$/i }).click();

  await expect.poll(() => refetched).toBeGreaterThan(0);
});

test("panels take the height the window offers", async ({ page }) => {
  // A 60vh cap left half a large screen unused, which is the opposite of what
  // a three-column reader needs.
  await page.setViewportSize({ width: 1440, height: 1000 });
  await mockGitHub(page);
  await openPullRequest(page);

  const panel = await page.getByRole("region", { name: "After", exact: true }).boundingBox();
  expect((panel?.height ?? 0) / 1000).toBeGreaterThan(0.6);

  // And the page itself does not scroll; the panel does.
  const pageOverflow = await page.evaluate(() => document.body.scrollHeight - window.innerHeight);
  expect(pageOverflow).toBeLessThanOrEqual(1);
});

test("shows the overall conversation beside the review form", async ({ page }) => {
  // plan.md 4.8: these were fetched and never rendered anywhere.
  await mockGitHub(page);
  await page.route(
    "https://api.github.com/repos/example-org/docs-site/issues/7/comments**",
    (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify([
          {
            id: 5,
            user: { login: "maintainer", avatar_url: null, html_url: null },
            created_at: "2026-01-01T00:00:00Z",
            body: "전반적으로 좋습니다",
            body_html: "<p>전반적으로 좋습니다</p>",
            html_url: "https://github.com/example-org/docs-site/pull/7#issuecomment-5",
          },
        ]),
      }),
  );
  await openPullRequest(page);

  await page.getByRole("button", { name: /^review changes$/i }).click();

  const conversation = page.getByRole("region", { name: /overall comments/i });
  await expect(conversation).toContainText("maintainer");
  await expect(conversation).toContainText("전반적으로 좋습니다");
});

test("the inline editor fills the panel width", async ({ page }) => {
  // It was rendering far narrower than the panel, which left a comment box too
  // small to write a sentence in.
  await page.setViewportSize({ width: 1440, height: 900 });
  await mockGitHub(page);
  await openPullRequest(page);

  const after = page.getByRole("region", { name: "After", exact: true });
  await after.getByRole("button", { name: /add a comment on line 60/i }).click();

  const editor = await page.getByLabel(/new comment on line 60/i).boundingBox();
  const panel = await after.boundingBox();

  // Only the row and composer padding, no gutter indent.
  expect((editor?.width ?? 0) / (panel?.width ?? 1)).toBeGreaterThan(0.88);
});

test("shows a submitted review body in the conversation", async ({ page }) => {
  // A review body is not an issue comment; fetching only issue comments left
  // every "left a comment" review invisible (plan.md 4.8).
  await mockGitHub(page);
  await page.route(
    "https://api.github.com/repos/example-org/docs-site/pulls/7/reviews**",
    (route) => {
      if (route.request().method() !== "GET") {
        return route.fulfill({ status: 200, contentType: "application/json", body: "{}" });
      }
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify([
          {
            id: 70,
            state: "APPROVED",
            user: { login: "maintainer" },
            submitted_at: "2026-01-03T00:00:00Z",
            body: "번역 좋습니다",
            body_html: "<p>번역 좋습니다</p>",
            html_url: "https://github.com/example-org/docs-site/pull/7#pullrequestreview-70",
          },
        ]),
      });
    },
  );
  await openPullRequest(page);

  await page.getByRole("button", { name: /^review changes$/i }).click();

  const conversation = page.getByRole("region", { name: /overall comments/i });
  await expect(conversation).toContainText("번역 좋습니다");
  // plan.md 7: the verdict is a word.
  await expect(conversation).toContainText("Approve");
});

test("offers markdown shortcuts in the comment editor", async ({ page }) => {
  await mockGitHub(page);
  await openPullRequest(page);

  const after = page.getByRole("region", { name: "After", exact: true });
  await after.getByRole("button", { name: /add a comment on line 60/i }).click();

  const editor = page.getByLabel(/new comment on line 60/i);
  await editor.fill("어색합니다");
  await editor.selectText();
  await page.getByRole("button", { name: "Bold", exact: true }).click();

  await expect(editor).toHaveValue("**어색합니다**");
});

test("wraps long prose instead of scrolling sideways", async ({ page }) => {
  // A Markdown paragraph is one very long line. Scrolling sideways through a
  // Korean paragraph is unreadable, and it also dragged comment rows out to
  // the width of the longest line.
  await page.setViewportSize({ width: 1200, height: 800 });
  await mockGitHub(page, {
    contentFor: (path) =>
      path.includes("/content/ko/") ? `${"매우 긴 한국어 문단입니다. ".repeat(40)}\n` : null,
  });
  await openPullRequest(page);

  const scroller = page.getByRole("region", { name: "After", exact: true }).locator("div").first();

  const overflow = await scroller.evaluate((el) => el.scrollWidth - el.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
});

test("a comment row stays the width of the panel beside a long line", async ({ page }) => {
  await page.setViewportSize({ width: 1200, height: 800 });
  await mockGitHub(page, {
    contentFor: (path) =>
      path.includes("/content/ko/")
        ? `${"짧은 줄\n".repeat(58)}${"아주 긴 줄입니다. ".repeat(40)}\n`
        : null,
  });
  await openPullRequest(page);

  const after = page.getByRole("region", { name: "After", exact: true });
  await after.getByRole("button", { name: /add a comment on line 59/i }).click();

  const editor = await page.getByLabel(/new comment on line 59/i).boundingBox();
  const panel = await after.boundingBox();

  expect((editor?.width ?? 0) / (panel?.width ?? 1)).toBeLessThan(1);
  expect((editor?.width ?? 0) / (panel?.width ?? 1)).toBeGreaterThan(0.85);
});
