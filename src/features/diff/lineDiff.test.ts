import { describe, expect, it } from "vitest";

import { changeAnchors, computeLineDiff, sideLines, splitLines } from "./lineDiff";

describe("splitLines", () => {
  it("does not invent a trailing line for a file ending in a newline", () => {
    expect(splitLines("a\nb\n")).toEqual(["a", "b"]);
    expect(splitLines("a\nb")).toEqual(["a", "b"]);
  });

  it("returns nothing for an empty file", () => {
    expect(splitLines("")).toEqual([]);
  });

  it("keeps a deliberate blank line", () => {
    expect(splitLines("a\n\nb\n")).toEqual(["a", "", "b"]);
  });
});

describe("computeLineDiff", () => {
  it("keeps real line numbers on each side independently", () => {
    // plan.md 4.6: each panel shows its own file's numbering.
    const lines = computeLineDiff("a\nb\nc\n", "a\nB\nc\nd\n");

    const removed = lines.find((line) => line.change === "removed");
    const added = lines.find((line) => line.change === "added");

    expect(removed?.beforeLine).toBe(2);
    expect(removed?.afterLine).toBeNull();
    expect(added?.afterLine).toBe(2);
    expect(added?.beforeLine).toBeNull();
  });

  it("numbers lines after a change by their own side's count", () => {
    const lines = computeLineDiff("a\nb\n", "a\nx\ny\nb\n");
    const last = lines[lines.length - 1];

    expect(last.text).toBe("b");
    expect(last.beforeLine).toBe(2);
    // Two lines were inserted above it.
    expect(last.afterLine).toBe(4);
  });

  it("marks an unchanged file as entirely unchanged", () => {
    const lines = computeLineDiff("a\nb\n", "a\nb\n");

    expect(lines.every((line) => line.change === "unchanged")).toBe(true);
  });

  it("treats an empty before as all additions", () => {
    const lines = computeLineDiff("", "a\nb\n");

    expect(lines.map((line) => line.change)).toEqual(["added", "added"]);
  });

  it("treats an empty after as all removals", () => {
    const lines = computeLineDiff("a\nb\n", "");

    expect(lines.map((line) => line.change)).toEqual(["removed", "removed"]);
  });

  it("handles non-ASCII content", () => {
    const lines = computeLineDiff("스토리지 볼륨 생성\n", "스토리지 볼륨 만들기\n");

    expect(lines.map((line) => line.change).sort()).toEqual(["added", "removed"]);
  });
});

describe("pairing for intra-line highlighting", () => {
  it("pairs a one-for-one replacement", () => {
    const lines = computeLineDiff("a\nold\nc\n", "a\nnew\nc\n");
    const removed = lines.findIndex((line) => line.change === "removed");
    const added = lines.findIndex((line) => line.change === "added");

    expect(lines[removed].pairedWith).toBe(added);
    expect(lines[added].pairedWith).toBe(removed);
  });

  it("pairs each line of an equal-length run", () => {
    const lines = computeLineDiff("x\n1\n2\ny\n", "x\nA\nB\ny\n");
    const paired = lines.filter((line) => line.pairedWith !== null);

    expect(paired).toHaveLength(4);
  });

  it("leaves unequal runs unpaired, since the correspondence is a guess", () => {
    // plan.md 4.6 requires falling back to whole-line marking when the pairing
    // is uncertain.
    const lines = computeLineDiff("a\n1\nb\n", "a\nA\nB\nC\nb\n");

    expect(lines.every((line) => line.pairedWith === null)).toBe(true);
  });

  it("does not pair a pure addition", () => {
    const lines = computeLineDiff("a\n", "a\nb\n");

    expect(lines.every((line) => line.pairedWith === null)).toBe(true);
  });

  it("does not pair a pure removal", () => {
    const lines = computeLineDiff("a\nb\n", "a\n");

    expect(lines.every((line) => line.pairedWith === null)).toBe(true);
  });
});

describe("sideLines", () => {
  it("shows the whole before file without the additions", () => {
    const lines = computeLineDiff("a\nold\nc\n", "a\nnew\nc\n");
    const before = sideLines(lines, "before");

    expect(before.map((line) => line.text)).toEqual(["a", "old", "c"]);
    expect(before.every((line) => line.beforeLine !== null)).toBe(true);
  });

  it("shows the whole after file without the removals", () => {
    const lines = computeLineDiff("a\nold\nc\n", "a\nnew\nc\n");
    const after = sideLines(lines, "after");

    expect(after.map((line) => line.text)).toEqual(["a", "new", "c"]);
    expect(after.every((line) => line.afterLine !== null)).toBe(true);
  });
});

describe("changeAnchors", () => {
  it("returns one anchor per contiguous run of changes", () => {
    // Navigation should step between changes, not between lines.
    const lines = computeLineDiff("a\n1\n2\nb\nc\n3\nd\n", "a\nA\nB\nb\nc\nC\nd\n");

    expect(changeAnchors(lines)).toHaveLength(2);
  });

  it("is empty for an unchanged file", () => {
    expect(changeAnchors(computeLineDiff("a\n", "a\n"))).toEqual([]);
  });

  it("anchors at the first line when the file starts with a change", () => {
    const lines = computeLineDiff("old\nb\n", "new\nb\n");

    expect(changeAnchors(lines)[0]).toBe(0);
  });
});
