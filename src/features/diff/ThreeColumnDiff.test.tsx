import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { ThreeColumnDiff } from "./ThreeColumnDiff";

const SOURCE = "# Create a volume\n\nVolumes provide storage.\nEnd.\n";
const BEFORE = "# 볼륨 생성\n\n볼륨은 스토리지를 제공합니다.\n끝.\n";
const AFTER = "# 볼륨 만들기\n\n볼륨은 스토리지를 제공합니다.\n끝.\n";
const PATCH =
  "@@ -1,4 +1,4 @@\n-# 볼륨 생성\n+# 볼륨 만들기\n \n 볼륨은 스토리지를 제공합니다.\n 끝.";

const renderDiff = (overrides: Partial<Parameters<typeof ThreeColumnDiff>[0]> = {}) =>
  render(
    <ThreeColumnDiff
      sourceText={SOURCE}
      beforeText={BEFORE}
      afterText={AFTER}
      sourceLocale="en"
      targetLocale="ko"
      patch={PATCH}
      {...overrides}
    />,
  );

const panel = (name: RegExp) => screen.getByRole("region", { name });

describe("three panels", () => {
  it("renders source, before, and after", () => {
    renderDiff();

    expect(panel(/^Source$/)).toBeVisible();
    expect(panel(/^Before$/)).toBeVisible();
    expect(panel(/^After$/)).toBeVisible();
  });

  it("shows each file whole, with its own line numbers", () => {
    // plan.md 4.6: complete files by default, numbered independently.
    renderDiff();

    // Intra-line highlighting splits a changed line across spans, so the
    // assertion runs against the panel's combined text.
    expect(panel(/^Source$/)).toHaveTextContent("Volumes provide storage.");
    expect(panel(/^Before$/)).toHaveTextContent("볼륨 생성");
    expect(panel(/^After$/)).toHaveTextContent("볼륨 만들기");
  });

  it("hides a panel and keeps at least one visible", () => {
    renderDiff();
    const boxes = screen.getAllByRole("checkbox", { name: /^(Source|Before|After)$/ });

    expect(boxes).toHaveLength(3);
    // With one left, that one cannot be turned off.
    expect(boxes.every((box) => !box.hasAttribute("disabled"))).toBe(true);
  });

  it("prevents hiding the last panel", async () => {
    const user = userEvent.setup();
    renderDiff();

    await user.click(screen.getByRole("checkbox", { name: "Source" }));
    await user.click(screen.getByRole("checkbox", { name: "Before" }));

    expect(screen.getByRole("checkbox", { name: "After" })).toBeDisabled();
    expect(panel(/^After$/)).toBeVisible();
  });

  it("removes a hidden panel from the document", async () => {
    const user = userEvent.setup();
    renderDiff();

    await user.click(screen.getByRole("checkbox", { name: "Source" }));

    expect(screen.queryByRole("region", { name: /^Source$/ })).toBeNull();
  });
});

describe("text direction", () => {
  it("gives right-to-left text its direction while numbers stay left-to-right", () => {
    // plan.md 4.4: only the translation body follows the locale.
    renderDiff({
      targetLocale: "ar",
      beforeText: "إنشاء وحدة تخزين\n",
      afterText: "إنشاء وحدة تخزين دائمة\n",
    });

    const body = panel(/^After$/).querySelector('[lang="ar"]');
    expect(body).not.toBeNull();
    expect(body).toHaveAttribute("dir", "rtl");

    // Only the translation body carries the direction. The line number and
    // marker cells must not, or the numbers would render on the wrong side.
    const rtlElements = panel(/^After$/).querySelectorAll('[dir="rtl"]');
    for (const element of rtlElements) {
      expect(element).toHaveAttribute("lang", "ar");
    }
  });

  it("keeps a left-to-right locale left-to-right", () => {
    renderDiff();

    const body = panel(/^After$/).querySelector('[lang="ko"]');
    expect(body).toHaveAttribute("dir", "ltr");
  });
});

describe("changes only", () => {
  it("compresses the translation panels but leaves the source whole", async () => {
    // plan.md 4.6: the source must not lose the sentence the translation
    // corresponds to.
    const user = userEvent.setup();
    const longBefore = Array.from({ length: 40 }, (_, i) => `줄 ${i + 1}`).join("\n");
    const longAfter = longBefore.replace("줄 20", "줄 20 수정");
    const longSource = Array.from({ length: 40 }, (_, i) => `line ${i + 1}`).join("\n");

    renderDiff({
      sourceText: `${longSource}\n`,
      beforeText: `${longBefore}\n`,
      afterText: `${longAfter}\n`,
      patch: "@@ -17,5 +17,5 @@\n a\n a\n-줄 20\n+줄 20 수정\n a\n a",
    });

    await user.click(screen.getByRole("checkbox", { name: /changes only/i }));

    expect(panel(/^Source$/)).toHaveTextContent("line 1");
    expect(panel(/^Source$/)).toHaveTextContent("line 40");
    expect(panel(/^After$/)).toHaveTextContent("줄 20 수정");
    // The far end of the file is compressed away on the translation side.
    expect(panel(/^After$/)).not.toHaveTextContent("줄 40");
  });

  it("disables scroll sync and explains why", async () => {
    const user = userEvent.setup();
    renderDiff();

    await user.click(screen.getByRole("checkbox", { name: /changes only/i }));

    expect(screen.getByRole("checkbox", { name: /sync scrolling/i })).toBeDisabled();
    expect(screen.getByText(/scroll sync is off in changes only/i)).toBeVisible();
  });

  it("labels how many lines a gap skipped", async () => {
    const user = userEvent.setup();
    const longBefore = Array.from({ length: 40 }, (_, i) => `줄 ${i + 1}`).join("\n");

    renderDiff({
      beforeText: `${longBefore}\n`,
      afterText: `${longBefore.replace("줄 20", "줄 20 수정")}\n`,
      patch: "@@ -17,5 +17,5 @@\n a\n a\n-줄 20\n+줄 20 수정\n a\n a",
    });
    await user.click(screen.getByRole("checkbox", { name: /changes only/i }));

    expect(within(panel(/^After$/)).getByText(/unchanged lines skipped/i)).toBeVisible();
  });
});

describe("scroll sync", () => {
  it("is off by default, since panels rarely align line for line", () => {
    renderDiff();

    expect(screen.getByRole("checkbox", { name: /sync scrolling/i })).not.toBeChecked();
  });

  it("can be turned on", async () => {
    const user = userEvent.setup();
    renderDiff();

    await user.click(screen.getByRole("checkbox", { name: /sync scrolling/i }));

    expect(screen.getByRole("checkbox", { name: /sync scrolling/i })).toBeChecked();
  });
});

describe("change navigation", () => {
  it("reports how many changes there are", () => {
    renderDiff();

    expect(screen.getByText(/change 1 \/ 1/i)).toBeVisible();
  });

  it("disables navigation when nothing changed", () => {
    renderDiff({ beforeText: BEFORE, afterText: BEFORE, patch: null });

    expect(screen.getByText(/no changes/i)).toBeVisible();
    expect(screen.getByRole("button", { name: /next change/i })).toBeDisabled();
  });
});

describe("search", () => {
  it("marks the lines containing the term", async () => {
    const user = userEvent.setup();
    renderDiff();

    await user.type(screen.getByLabelText(/find in panels/i), "스토리지");

    const hits = panel(/^After$/).querySelectorAll('[data-change][class*="searchHit"]');
    expect(hits).toHaveLength(1);
    expect(hits[0].textContent).toContain("스토리지");
  });
});

describe("missing source", () => {
  it("says the source file was not found instead of showing an empty panel", () => {
    renderDiff({ sourceText: null, sourceMissing: true });

    expect(within(panel(/^Source$/)).getByText(/source file not found/i)).toBeVisible();
  });
});
