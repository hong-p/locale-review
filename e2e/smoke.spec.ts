import { expect, test } from "@playwright/test";

/**
 * Phase 0 only proves the built static site loads and runs from a relative
 * base path. The real user flows arrive with the routes they exercise.
 */
test("serves the built app without console errors", async ({ page }) => {
  const errors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  page.on("pageerror", (error) => errors.push(error.message));

  await page.goto("/");

  await expect(page).toHaveTitle(/Locale Review/i);
  await expect(page.locator("#root")).not.toBeEmpty();
  expect(errors).toEqual([]);
});

/**
 * plan.md 3.3: a shared hash route must restore directly, without any
 * server-side rewrite, which is the constraint GitHub Pages imposes.
 */
test("restores a shared pull request hash route on direct load", async ({ page }) => {
  await page.goto("/#/github/kubernetes/website/pull/123");

  await expect(page.getByText("kubernetes/website #123")).toBeVisible();
});

test("shows the not-found screen for an unknown hash route", async ({ page }) => {
  await page.goto("/#/does/not/exist");

  await expect(page.getByRole("heading", { name: /page not found/i })).toBeVisible();
});
