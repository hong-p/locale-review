import { describe, expect, it } from "vitest";

import { IMAGE_LINK_LABEL, sanitizeCommentHtml } from "./sanitizeCommentHtml";

describe("dangerous content", () => {
  it("removes a script tag", () => {
    const clean = sanitizeCommentHtml("<p>hi</p><script>alert(1)</script>");

    expect(clean).toContain("hi");
    expect(clean).not.toContain("script");
  });

  it("removes an inline event handler", () => {
    const clean = sanitizeCommentHtml('<p onclick="steal()">text</p>');

    expect(clean).not.toContain("onclick");
    expect(clean).toContain("text");
  });

  it("removes a javascript: link", () => {
    const clean = sanitizeCommentHtml('<a href="javascript:alert(1)">click</a>');

    expect(clean).not.toContain("javascript:");
  });

  it("removes a data: link", () => {
    const clean = sanitizeCommentHtml('<a href="data:text/html,<script>x</script>">click</a>');

    expect(clean).not.toContain("data:");
  });

  it("removes an iframe", () => {
    expect(sanitizeCommentHtml('<iframe src="https://evil.test"></iframe>')).not.toContain(
      "iframe",
    );
  });

  it("removes a form, which could phish inside a comment", () => {
    const clean = sanitizeCommentHtml(
      '<form action="https://evil.test"><input name="token"></form>',
    );

    expect(clean).not.toContain("<form");
  });

  it("removes a style attribute", () => {
    expect(sanitizeCommentHtml('<p style="position:fixed">x</p>')).not.toContain("style");
  });
});

describe("images", () => {
  it("replaces an image with a link rather than loading it", () => {
    // plan.md 4.8: no remote image request leaves the page, so img-src stays
    // limited to the avatar origin.
    const clean = sanitizeCommentHtml(
      '<p><img src="https://private-user-images.githubusercontent.com/a.png" alt="screenshot"></p>',
    );

    expect(clean).not.toContain("<img");
    expect(clean).toContain("private-user-images.githubusercontent.com/a.png");
    expect(clean).toContain("screenshot");
  });

  it("labels an image with no alt text", () => {
    const clean = sanitizeCommentHtml('<img src="https://example.test/a.png">');

    expect(clean).toContain(IMAGE_LINK_LABEL);
  });

  it("does not turn a javascript: image source into a usable link", () => {
    const clean = sanitizeCommentHtml('<img src="javascript:alert(1)">');

    expect(clean).not.toContain("javascript:");
  });
});

describe("links", () => {
  it("keeps an ordinary link", () => {
    const clean = sanitizeCommentHtml('<a href="https://example.test/x">docs</a>');

    expect(clean).toContain('href="https://example.test/x"');
    expect(clean).toContain("docs");
  });

  it("opens an external link in a new tab with rel protection", () => {
    const clean = sanitizeCommentHtml('<a href="https://example.test">x</a>');

    expect(clean).toContain('target="_blank"');
    expect(clean).toContain("noopener");
    expect(clean).toContain("noreferrer");
  });

  it("leaves an in-page anchor without a target", () => {
    expect(sanitizeCommentHtml('<a href="#top">x</a>')).not.toContain("target");
  });

  it("keeps an anchor link to another comment", () => {
    expect(sanitizeCommentHtml('<a href="#issuecomment-1">ref</a>')).toContain(
      'href="#issuecomment-1"',
    );
  });
});

describe("content GitHub actually renders", () => {
  it("keeps formatting, code, lists, and tables", () => {
    const clean = sanitizeCommentHtml(
      "<p><strong>bold</strong> <em>em</em> <code>x</code></p>" +
        "<pre><code>block</code></pre>" +
        "<ul><li>one</li></ul>" +
        "<table><tbody><tr><td>cell</td></tr></tbody></table>" +
        "<blockquote><p>quoted</p></blockquote>",
    );

    for (const fragment of [
      "<strong>",
      "<em>",
      "<code>",
      "<pre>",
      "<li>",
      "<td>",
      "<blockquote>",
    ]) {
      expect(clean, fragment).toContain(fragment);
    }
  });

  it("keeps non-ASCII text intact", () => {
    const clean = sanitizeCommentHtml("<p>번역이 어색합니다. 「만들기」가 더 자연스럽습니다.</p>");

    expect(clean).toContain("「만들기」");
  });

  it("drops a task list checkbox but keeps the item text", () => {
    // DOMPurify strips an input's `type` unconditionally, and a typeless input
    // renders as an editable text box, so the element goes rather than
    // appearing as a stray field inside someone's comment.
    const clean = sanitizeCommentHtml(
      '<ul><li><input type="checkbox" checked disabled> done</li></ul>',
    );

    expect(clean).not.toContain("<input");
    expect(clean).toContain("done");
  });

  it("returns an empty string for empty input", () => {
    expect(sanitizeCommentHtml("")).toBe("");
  });
});
