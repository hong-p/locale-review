import { describe, expect, it } from "vitest";

import {
  buildDiffRows,
  buildSourceRows,
  collapseToChanges,
  rowChangeAnchors,
  searchMatches,
} from "./buildPanelRows";
import { computeLineDiff } from "./lineDiff";
import { parsePatch } from "./patchPositions";

describe("buildDiffRows", () => {
  const lines = computeLineDiff("a\nold\nc\n", "a\nnew\nc\n");

  it("gives the before panel the whole before file", () => {
    expect(buildDiffRows(lines, "before").map((row) => row.line.text)).toEqual(["a", "old", "c"]);
  });

  it("gives the after panel the whole after file", () => {
    expect(buildDiffRows(lines, "after").map((row) => row.line.text)).toEqual(["a", "new", "c"]);
  });

  it("attaches the paired counterpart for intra-line marking", () => {
    const after = buildDiffRows(lines, "after");
    const changed = after.find((row) => row.line.change === "added");

    expect(changed?.counterpart).toBe("old");
  });

  it("leaves the counterpart null when the pairing is uncertain", () => {
    const unpaired = computeLineDiff("a\n1\nb\n", "a\nA\nB\nC\nb\n");

    expect(buildDiffRows(unpaired, "after").every((row) => row.counterpart === null)).toBe(true);
  });
});

describe("buildSourceRows", () => {
  it("numbers the source file from one", () => {
    const rows = buildSourceRows("first\nsecond\n");

    expect(rows.map((row) => row.line.beforeLine)).toEqual([1, 2]);
    expect(rows.every((row) => row.line.change === "unchanged")).toBe(true);
  });

  it("produces nothing for an absent source", () => {
    expect(buildSourceRows("")).toEqual([]);
  });
});

describe("collapseToChanges", () => {
  const file = Array.from({ length: 40 }, (_, i) => `line ${i + 1}`).join("\n");
  const changedFile = file.replace("line 20", "line 20 edited");
  const lines = computeLineDiff(`${file}\n`, `${changedFile}\n`);
  const { hunks } = parsePatch("@@ -17,5 +17,5 @@\n l\n l\n-line 20\n+line 20 edited\n l\n l");

  it("keeps only the lines around a hunk", () => {
    const rows = collapseToChanges(buildDiffRows(lines, "after"), hunks, "RIGHT");

    expect(rows.length).toBeLessThan(40);
    expect(rows.some((row) => row.line.text.includes("line 20"))).toBe(true);
    expect(rows.some((row) => row.line.text === "line 1")).toBe(false);
  });

  it("records how many lines were skipped so the gap can be labelled", () => {
    const rows = collapseToChanges(buildDiffRows(lines, "after"), hunks, "RIGHT");
    const gap = rows.find((row) => row.precedingGap !== null);

    expect(gap?.precedingGap).toBeGreaterThan(0);
  });

  it("always keeps a line that exists on only one side", () => {
    // An addition has no before-side number, and is by definition a change.
    const added = computeLineDiff("a\n", "a\nb\n");
    const rows = collapseToChanges(buildDiffRows(added, "after"), hunks, "RIGHT");

    expect(rows.some((row) => row.line.change === "added")).toBe(true);
  });

  it("returns every row when there is no patch to compress against", () => {
    const rows = buildDiffRows(lines, "after");

    expect(collapseToChanges(rows, [], "RIGHT")).toHaveLength(rows.length);
  });
});

describe("rowChangeAnchors", () => {
  it("returns one anchor per run of changes", () => {
    const lines = computeLineDiff("a\n1\n2\nb\nc\n3\nd\n", "a\nA\nB\nb\nc\nC\nd\n");

    expect(rowChangeAnchors(buildDiffRows(lines, "after"))).toHaveLength(2);
  });

  it("is empty when nothing changed", () => {
    expect(rowChangeAnchors(buildDiffRows(computeLineDiff("a\n", "a\n"), "after"))).toEqual([]);
  });
});

describe("searchMatches", () => {
  const rows = buildSourceRows("Alpha\nbeta\nGAMMA alpha\n");

  it("matches case-insensitively", () => {
    expect(searchMatches(rows, "alpha")).toEqual([0, 2]);
  });

  it("returns nothing for an empty term", () => {
    expect(searchMatches(rows, "")).toEqual([]);
  });

  it("returns nothing when the term is absent", () => {
    expect(searchMatches(rows, "delta")).toEqual([]);
  });

  it("matches non-ASCII text", () => {
    expect(searchMatches(buildSourceRows("스토리지 볼륨\n다른 줄\n"), "볼륨")).toEqual([0]);
  });
});
