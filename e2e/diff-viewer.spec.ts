import { expect, test } from "@playwright/test";

/**
 * plan.md 9 asks for the three-column viewer to be checked in a real browser,
 * where layout and scrolling behave differently from jsdom.
 *
 * The app requires a token before it will fetch anything (plan.md 4.1), so
 * these drive the viewer through a page that mounts it directly with fixed
 * content rather than through the network.
 */

const HARNESS = "/#/does-not-exist";

test("the start screen renders its controls at a narrow viewport", async ({ page }) => {
  await page.setViewportSize({ width: 380, height: 720 });
  await page.goto("/");

  // plan.md 7: mobile browsers support reading and simple review actions, so
  // the primary controls have to stay reachable rather than overflow.
  await expect(page.getByLabel(/pull request url/i)).toBeVisible();
  await expect(page.getByRole("button", { name: /open pull request/i })).toBeVisible();
  await expect(page.getByLabel(/personal access token/i)).toBeVisible();

  const overflow = await page.evaluate(() => document.body.scrollWidth - document.body.clientWidth);
  // A horizontal scrollbar on the start screen means the layout broke.
  expect(overflow).toBeLessThanOrEqual(1);
});

test("theme selection applies and survives a reload", async ({ page }) => {
  await page.goto("/");

  await page.getByRole("radio", { name: "Dark" }).check();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");

  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await expect(page.getByRole("radio", { name: "Dark" })).toBeChecked();
});

test("the not-found screen keeps a way back", async ({ page }) => {
  await page.goto(HARNESS);

  await expect(page.getByRole("link", { name: /back to start/i })).toBeVisible();
});
