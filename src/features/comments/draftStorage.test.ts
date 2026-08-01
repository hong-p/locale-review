import { beforeEach, describe, expect, it } from "vitest";

import { parsePatch } from "../diff/patchPositions";
import {
  type CommentDraft,
  draftKey,
  draftSlot,
  hasUnsentWork,
  remapDrafts,
  removeDraft,
  upsertDraft,
} from "./draftStorage";

const draft = (overrides: Partial<CommentDraft> = {}): CommentDraft => ({
  id: "d1",
  path: "content/ko/guide.md",
  line: 3,
  side: "RIGHT",
  body: "어색합니다",
  unmapped: false,
  ...overrides,
});

beforeEach(() => {
  window.sessionStorage.clear();
  window.localStorage.clear();
});

describe("draftKey", () => {
  it("separates two pull requests so their drafts never mix", () => {
    expect(draftKey("o", "r", 1)).not.toBe(draftKey("o", "r", 2));
  });
});

describe("persistence", () => {
  it("keeps unsent text in sessionStorage, not localStorage", () => {
    // plan.md 5.3: unsent work belongs to this tab.
    const slot = draftSlot(draftKey("o", "r", 1));
    slot.write({ drafts: [draft()], reviewBody: "요약" });

    expect(window.sessionStorage.length).toBe(1);
    expect(window.localStorage.length).toBe(0);
  });

  it("survives a reload of the same tab", () => {
    const key = draftKey("o", "r", 1);
    draftSlot(key).write({ drafts: [draft()], reviewBody: "요약" });

    const restored = draftSlot(key).read();

    expect(restored.drafts[0].body).toBe("어색합니다");
    expect(restored.reviewBody).toBe("요약");
  });

  it("falls back to empty rather than throwing on corrupt data", () => {
    const key = draftKey("o", "r", 1);
    window.sessionStorage.setItem(`locale-review.drafts.${key}`, "{broken");

    expect(draftSlot(key).read()).toEqual({ drafts: [], reviewBody: "" });
  });

  it("discards a stored bundle whose shape no longer matches", () => {
    const key = draftKey("o", "r", 1);
    window.sessionStorage.setItem(
      `locale-review.drafts.${key}`,
      JSON.stringify({ version: 1, value: { drafts: [{ id: 1 }], reviewBody: "" } }),
    );

    expect(draftSlot(key).read().drafts).toEqual([]);
  });
});

describe("remapDrafts", () => {
  const patch = parsePatch("@@ -1,3 +1,3 @@\n a\n-old\n+new\n b");
  const patches = new Map([["content/ko/guide.md", patch]]);

  it("keeps a draft whose line still accepts a comment", () => {
    const [result] = remapDrafts([draft({ line: 2, side: "RIGHT" })], patches);

    expect(result.unmapped).toBe(false);
    expect(result.body).toBe("어색합니다");
  });

  it("flags a draft whose line is gone rather than deleting it", () => {
    // plan.md 4.10: the text has to remain recoverable.
    const [result] = remapDrafts([draft({ line: 999 })], patches);

    expect(result.unmapped).toBe(true);
    expect(result.body).toBe("어색합니다");
  });

  it("flags a draft whose file is no longer in the pull request", () => {
    const [result] = remapDrafts([draft({ path: "content/ko/gone.md" })], patches);

    expect(result.unmapped).toBe(true);
  });

  it("restores a previously unmapped draft when its line comes back", () => {
    const [result] = remapDrafts([draft({ line: 2, unmapped: true })], patches);

    expect(result.unmapped).toBe(false);
  });

  it("does not mutate the input", () => {
    const original = draft({ line: 999 });
    remapDrafts([original], patches);

    expect(original.unmapped).toBe(false);
  });
});

describe("editing the draft list", () => {
  it("adds a new draft", () => {
    expect(upsertDraft([], draft())).toHaveLength(1);
  });

  it("replaces a draft with the same id instead of duplicating", () => {
    const result = upsertDraft([draft()], draft({ body: "수정됨" }));

    expect(result).toHaveLength(1);
    expect(result[0].body).toBe("수정됨");
  });

  it("removes by id", () => {
    expect(removeDraft([draft(), draft({ id: "d2" })], "d1").map((d) => d.id)).toEqual(["d2"]);
  });
});

describe("hasUnsentWork", () => {
  it("is true when a draft has text", () => {
    expect(hasUnsentWork({ drafts: [draft()], reviewBody: "" })).toBe(true);
  });

  it("is true when only the review body has text", () => {
    expect(hasUnsentWork({ drafts: [], reviewBody: "요약" })).toBe(true);
  });

  it("is false for empty and whitespace-only text", () => {
    expect(hasUnsentWork({ drafts: [], reviewBody: "" })).toBe(false);
    expect(hasUnsentWork({ drafts: [draft({ body: "   " })], reviewBody: "  " })).toBe(false);
  });
});
