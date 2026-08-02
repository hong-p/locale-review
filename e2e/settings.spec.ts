import { expect, test } from "@playwright/test";

import { mockGitHub, openPullRequest } from "./support/github";

/**
 * The translation layout settings in a real browser (plan.md 4.2, 5.3).
 *
 * The point of these settings is which file the app opens as the source, so
 * that is what the second test asserts: not the form's state, but the request
 * the app makes afterwards.
 */

test("keeps the layout settings across a reload", async ({ page }) => {
  await page.goto("/#/settings");

  await page.getByLabel(/source locale/i).fill("ja");
  await page.getByLabel(/content root/i).fill("docs/i18n");
  await page.getByRole("button", { name: /save settings/i }).click();

  await expect(page.getByRole("status")).toContainText(/settings saved/i);

  await page.reload();

  await expect(page.getByLabel(/source locale/i)).toHaveValue("ja");
  await expect(page.getByLabel(/content root/i)).toHaveValue("docs/i18n");
});

test("previews where the source will be looked up", async ({ page }) => {
  await page.goto("/#/settings");

  await expect(page.getByText("content/ko/guide.md")).toBeVisible();
  await expect(page.getByText("content/en/guide.md")).toBeVisible();

  await page.getByLabel(/source locale/i).fill("ja");

  await expect(page.getByText("content/ja/guide.md")).toBeVisible();
});

test("a changed source locale changes which file the review opens as the source", async ({
  page,
}) => {
  const recorder = await mockGitHub(page);

  await openPullRequest(page);
  await expect
    .poll(() => recorder.contentRequests.some((path) => path.endsWith("/content/en/guide.md")))
    .toBe(true);

  // The header carries the way into settings, so the reviewer does not lose
  // the pull request to change a rule (plan.md 3.3, 7).
  await page.getByRole("link", { name: /^settings$/i }).click();
  await page.getByLabel(/source locale/i).fill("ja");
  await page.getByRole("button", { name: /save settings/i }).click();

  await page.goBack();
  await page.getByRole("region", { name: "After" }).waitFor();

  await expect
    .poll(() => recorder.contentRequests.some((path) => path.endsWith("/content/ja/guide.md")))
    .toBe(true);
});

test("a changed content root brings a different set of files into review", async ({ page }) => {
  await mockGitHub(page, { extraFiles: [{ filename: "docs/ko/install.md" }] });

  await openPullRequest(page);
  const files = page.getByLabel(/^file$/i);
  await expect(files).toContainText("content/ko/guide.md");
  await expect(files).not.toContainText("docs/ko/install.md");

  await page.getByRole("link", { name: /^settings$/i }).click();
  await page.getByLabel(/content root/i).fill("docs");
  await page.getByRole("button", { name: /save settings/i }).click();

  await page.goBack();

  await expect(page.getByLabel(/^file$/i)).toContainText("docs/ko/install.md");
  await expect(page.getByLabel(/^file$/i)).not.toContainText("content/ko/guide.md");
});

test("says what it was looking for when nothing matches, and offers the way out", async ({
  page,
}) => {
  await mockGitHub(page);

  await page.goto("/#/settings");
  await page.getByLabel(/content root/i).fill("nowhere");
  await page.getByRole("button", { name: /save settings/i }).click();

  await page.goto("/#/github/example-org/docs-site/pull/7");

  await expect(page.getByRole("heading", { name: /no translation files found/i })).toBeVisible();
  await expect(page.getByText(/active layout/i)).toContainText("nowhere/");
  await expect(page.getByRole("link", { name: /change the layout in settings/i })).toBeVisible();
});
