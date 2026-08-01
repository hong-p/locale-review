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
  await page.getByRole("button", { name: /content\/ar\/guide\.md/ }).click();

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
  await expect(page.getByRole("button", { name: /content\/ko\/guide\.md/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /content\/ja\/guide\.md/ })).toBeHidden();

  expect(recorder.contentRequests.some((path) => path.includes("/content/ja/"))).toBe(false);

  await page.getByRole("checkbox", { name: /^ja/ }).check();
  await page.getByRole("button", { name: /content\/ja\/guide\.md/ }).click();

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

test("disables every write control for a token that cannot write", async ({ page }) => {
  await mockGitHub(page, { canWrite: false });
  await openPullRequest(page);

  await expect(page.getByRole("checkbox", { name: /^viewed$/i })).toBeDisabled();
  await expect(page.getByLabel(/review summary/i)).toBeDisabled();
  await expect(page.getByRole("radio", { name: /^approve$/i })).toBeDisabled();
  await expect(page.getByRole("button", { name: /^submit review$/i })).toBeDisabled();
});

test("keeps the review summary across a reload", async ({ page }) => {
  // plan.md 4.10: unsent writing survives a reload of the same tab.
  await mockGitHub(page);
  await openPullRequest(page);

  await page.getByLabel(/review summary/i).fill("전반적으로 좋습니다");
  await page.reload();
  await page.getByRole("region", { name: "After", exact: true }).waitFor();

  await expect(page.getByLabel(/review summary/i)).toHaveValue("전반적으로 좋습니다");
});

test("warns before a refresh that could disturb unsent text", async ({ page }) => {
  await mockGitHub(page);
  await openPullRequest(page);

  await page.getByLabel(/review summary/i).fill("작성 중");
  await page.getByRole("button", { name: /^refresh$/i }).click();

  await expect(page.getByText(/you have unsent text/i)).toBeVisible();
  await page.getByRole("button", { name: /keep editing/i }).click();
  await expect(page.getByLabel(/review summary/i)).toHaveValue("작성 중");
});
