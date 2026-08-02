import { describe, expect, it } from "vitest";

import { applyMarkdown } from "./MarkdownToolbar";

const bold = { key: "b", label: "B", title: "Bold", wrap: "**", placeholder: "text" };
const quote = { key: "q", label: "Q", title: "Quote", linePrefix: "> ", placeholder: "quote" };
const link = { key: "l", label: "L", title: "Link", placeholder: "title" };

describe("applyMarkdown", () => {
  it("wraps the selection", () => {
    const result = applyMarkdown(bold, "make this bold", 5, 9);

    expect(result.text).toBe("make **this** bold");
    // The selection stays on the words, not the markers, so typing replaces
    // what was selected rather than the syntax.
    expect(result.text.slice(result.selectionStart, result.selectionEnd)).toBe("this");
  });

  it("inserts a placeholder when nothing is selected", () => {
    const result = applyMarkdown(bold, "", 0, 0);

    expect(result.text).toBe("**text**");
    expect(result.text.slice(result.selectionStart, result.selectionEnd)).toBe("text");
  });

  it("prefixes every line of a multi-line selection", () => {
    const result = applyMarkdown(quote, "one\ntwo", 0, 7);

    expect(result.text).toBe("> one\n> two");
  });

  it("puts the cursor on the URL of a new link", () => {
    const result = applyMarkdown(link, "see docs", 4, 8);

    expect(result.text).toBe("see [docs](url)");
    expect(result.text.slice(result.selectionStart, result.selectionEnd)).toBe("url");
  });

  it("leaves the rest of the text untouched", () => {
    const result = applyMarkdown(bold, "keep AAA keep", 5, 8);

    expect(result.text.startsWith("keep ")).toBe(true);
    expect(result.text.endsWith(" keep")).toBe(true);
  });

  it("handles non-ASCII selections by codepoint offsets", () => {
    const result = applyMarkdown(bold, "이 표현은 어색합니다", 2, 5);

    expect(result.text).toBe("이 **표현은** 어색합니다");
  });
});
