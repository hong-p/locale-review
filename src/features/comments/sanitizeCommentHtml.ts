import DOMPurify from "dompurify";

/**
 * Sanitising the HTML GitHub renders for a comment body (plan.md 4.8).
 *
 * GitHub's own output is trusted to be safe, but plan.md 4.8 re-sanitises it
 * anyway: this app never inserts HTML it has not checked itself.
 */

/**
 * plan.md 4.8: images are replaced with a link to the original.
 *
 * The app then needs no `img-src` beyond the avatar origin, and no request
 * leaves the page for a screenshot someone attached to a review.
 */
function replaceImagesWithLinks(root: Document | DocumentFragment | Element): void {
  for (const image of Array.from(root.querySelectorAll("img"))) {
    const src = image.getAttribute("src");
    const link = image.ownerDocument.createElement("a");
    link.setAttribute("href", src ?? "#");
    link.setAttribute("rel", "noreferrer noopener nofollow");
    link.setAttribute("target", "_blank");
    link.textContent = image.getAttribute("alt") || IMAGE_LINK_LABEL;
    image.replaceWith(link);
  }
}

export const IMAGE_LINK_LABEL = "View image on GitHub";

let hooksInstalled = false;

function installHooks(): void {
  if (hooksInstalled) return;
  hooksInstalled = true;

  DOMPurify.addHook("afterSanitizeAttributes", (node) => {
    if (!(node instanceof Element)) return;
    if (node.tagName !== "A") return;

    const href = node.getAttribute("href") ?? "";
    // An in-page anchor stays in the app; only a link leaving it gets a tab.
    if (!/^https?:/i.test(href)) return;

    // DOMPurify strips `target` whatever the allow-list says, to prevent
    // tabnabbing, so it is re-added here together with the rel that makes it
    // safe. A comment link should not navigate the review away.
    node.setAttribute("target", "_blank");
    node.setAttribute("rel", "noreferrer noopener nofollow");
  });
}

const ALLOWED_TAGS = [
  "p",
  "br",
  "hr",
  "a",
  "em",
  "strong",
  "del",
  "code",
  "pre",
  "blockquote",
  "ul",
  "ol",
  "li",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "table",
  "thead",
  "tbody",
  "tr",
  "th",
  "td",
  "span",
  "div",
  "sup",
  "sub",
  "details",
  "summary",
];

const ALLOWED_ATTR = ["href", "title", "lang", "dir", "align", "start"];

/**
 * `input` is absent from the allowed tags on purpose.
 *
 * GitHub renders a task list item as a disabled checkbox, but DOMPurify strips
 * an input's `type` unconditionally as a DOM-clobbering precaution, and a
 * typeless input renders as an editable text box. Dropping the element leaves
 * the item's text, which is what carries the meaning.
 */

/**
 * Returns HTML safe to insert.
 *
 * `img` is deliberately absent from the allowed tags and handled before
 * sanitising, so an image becomes a link rather than being dropped silently.
 */
export function sanitizeCommentHtml(html: string): string {
  installHooks();

  // Parse first so images can be rewritten before the allow-list removes them.
  const parsed = new DOMParser().parseFromString(html, "text/html");
  replaceImagesWithLinks(parsed.body);

  return DOMPurify.sanitize(parsed.body.innerHTML, {
    ALLOWED_TAGS,
    ALLOWED_ATTR,
    // A data: or javascript: href must not survive.
    ALLOWED_URI_REGEXP: /^(?:https?:|mailto:|#)/i,
    RETURN_TRUSTED_TYPE: false,
  });
}
