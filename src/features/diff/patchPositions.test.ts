import { describe, expect, it } from "vitest";

import { hunkRanges, isCommentable, parsePatch } from "./patchPositions";

const PATCH = [
  "@@ -1,4 +1,5 @@",
  " # Guide",
  " ",
  "-Old sentence.",
  "+New sentence.",
  "+Extra sentence.",
  " End.",
].join("\n");

describe("parsePatch", () => {
  it("reads the hunk header", () => {
    const { hunks } = parsePatch(PATCH);

    expect(hunks).toEqual([{ oldStart: 1, oldLines: 4, newStart: 1, newLines: 5 }]);
  });

  it("treats an omitted count as one line, per the unified diff format", () => {
    const { hunks } = parsePatch("@@ -5 +7 @@\n-a\n+b");

    expect(hunks).toEqual([{ oldStart: 5, oldLines: 1, newStart: 7, newLines: 1 }]);
  });

  it("marks a removed line commentable on the left at its base line number", () => {
    const patch = parsePatch(PATCH);

    // " # Guide" is 1, " " is 2, so the removal is base line 3.
    expect(isCommentable(patch, "LEFT", 3)).toBe(true);
  });

  it("marks added lines commentable on the right at their head line numbers", () => {
    const patch = parsePatch(PATCH);

    expect(isCommentable(patch, "RIGHT", 3)).toBe(true);
    expect(isCommentable(patch, "RIGHT", 4)).toBe(true);
  });

  it("marks a context line commentable on both sides", () => {
    const patch = parsePatch(PATCH);

    expect(isCommentable(patch, "LEFT", 1)).toBe(true);
    expect(isCommentable(patch, "RIGHT", 1)).toBe(true);
  });

  it("advances the two sides independently", () => {
    const patch = parsePatch(PATCH);

    // "End." is base line 4 but head line 5, because two lines were added.
    expect(isCommentable(patch, "LEFT", 4)).toBe(true);
    expect(isCommentable(patch, "RIGHT", 5)).toBe(true);
    expect(isCommentable(patch, "LEFT", 5)).toBe(false);
  });

  it("refuses a line outside the patch", () => {
    // plan.md 4.9: GitHub rejects a position its own diff does not contain.
    const patch = parsePatch(PATCH);

    expect(isCommentable(patch, "RIGHT", 99)).toBe(false);
    expect(isCommentable(patch, "LEFT", 0)).toBe(false);
  });

  it("handles several hunks with their own offsets", () => {
    const patch = parsePatch(
      ["@@ -1,2 +1,2 @@", " a", "-b", "+B", "@@ -20,2 +20,2 @@", " y", "-z", "+Z"].join("\n"),
    );

    expect(patch.hunks).toHaveLength(2);
    expect(isCommentable(patch, "LEFT", 2)).toBe(true);
    expect(isCommentable(patch, "LEFT", 21)).toBe(true);
    // Between the hunks nothing is commentable.
    expect(isCommentable(patch, "LEFT", 10)).toBe(false);
  });

  it("ignores the no-newline marker without advancing either side", () => {
    const patch = parsePatch(
      ["@@ -1,2 +1,2 @@", " a", "-b", "\\ No newline at end of file", "+B"].join("\n"),
    );

    expect(isCommentable(patch, "LEFT", 2)).toBe(true);
    expect(isCommentable(patch, "RIGHT", 2)).toBe(true);
  });

  it("returns nothing commentable for a missing patch", () => {
    // GitHub omits the patch for a large or binary file.
    for (const value of [null, ""]) {
      const patch = parsePatch(value);
      expect(patch.hunks).toEqual([]);
      expect(patch.commentable.size).toBe(0);
    }
  });

  it("does not throw on a malformed patch", () => {
    for (const value of ["not a patch", "@@ garbage @@", "@@ -1,2 +1,2 @@"]) {
      expect(() => parsePatch(value)).not.toThrow();
    }
  });
});

describe("hunkRanges", () => {
  it("widens each hunk with context lines", () => {
    const { hunks } = parsePatch("@@ -10,2 +10,2 @@\n a\n-b\n+B");

    expect(hunkRanges(hunks, "LEFT", 3)).toEqual([{ start: 7, end: 14 }]);
  });

  it("never starts before the first line", () => {
    const { hunks } = parsePatch("@@ -1,2 +1,2 @@\n a\n-b\n+B");

    expect(hunkRanges(hunks, "LEFT", 3)[0].start).toBe(1);
  });

  it("merges overlapping ranges so no line renders twice", () => {
    const { hunks } = parsePatch(
      ["@@ -10,1 +10,1 @@", "-a", "+A", "@@ -13,1 +13,1 @@", "-b", "+B"].join("\n"),
    );

    expect(hunkRanges(hunks, "LEFT", 3)).toEqual([{ start: 7, end: 16 }]);
  });

  it("keeps distant hunks separate", () => {
    const { hunks } = parsePatch(
      ["@@ -10,1 +10,1 @@", "-a", "+A", "@@ -80,1 +80,1 @@", "-b", "+B"].join("\n"),
    );

    expect(hunkRanges(hunks, "LEFT", 3)).toHaveLength(2);
  });

  it("gives a zero-length side a position anyway", () => {
    // A pure addition occupies no lines on the base side but still has a place.
    const { hunks } = parsePatch("@@ -5,0 +6,2 @@\n+a\n+b");

    expect(hunkRanges(hunks, "LEFT", 0)).toEqual([{ start: 5, end: 5 }]);
  });
});
