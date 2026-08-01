import { diffLines } from "diff";

/**
 * The line-level diff the viewer renders (plan.md 4.6).
 *
 * This is display only. plan.md 3.5 forbids using it as the source of a GitHub
 * comment position, which comes from the patch instead.
 */

export type LineChange = "unchanged" | "added" | "removed";

export type DiffLine = {
  change: LineChange;
  text: string;
  /** Real line number in the before file; null for an added line. */
  beforeLine: number | null;
  /** Real line number in the after file; null for a removed line. */
  afterLine: number | null;
  /**
   * Index of the line this one is paired with on the other side, when a removal
   * and an addition line up one-to-one. Only such a pair gets intra-line
   * highlighting (plan.md 4.6).
   */
  pairedWith: number | null;
};

/** Splits without inventing a trailing empty line for a file ending in a newline. */
export function splitLines(text: string): string[] {
  if (text === "") return [];
  const lines = text.split("\n");
  if (lines[lines.length - 1] === "") lines.pop();
  return lines;
}

export function computeLineDiff(before: string, after: string): DiffLine[] {
  const parts = diffLines(before, after);
  const lines: DiffLine[] = [];

  let beforeLine = 1;
  let afterLine = 1;

  for (const part of parts) {
    const partLines = splitLines(part.value);
    for (const text of partLines) {
      if (part.added) {
        lines.push({ change: "added", text, beforeLine: null, afterLine, pairedWith: null });
        afterLine += 1;
      } else if (part.removed) {
        lines.push({ change: "removed", text, beforeLine, afterLine: null, pairedWith: null });
        beforeLine += 1;
      } else {
        lines.push({ change: "unchanged", text, beforeLine, afterLine, pairedWith: null });
        beforeLine += 1;
        afterLine += 1;
      }
    }
  }

  return pairAdjacentChanges(lines);
}

/**
 * Links a run of removals to the run of additions that immediately follows,
 * one for one.
 *
 * Only a confident pairing earns intra-line highlighting: plan.md 4.6 says an
 * uncertain correspondence must fall back to whole-line marking rather than
 * inventing a word-level comparison between unrelated sentences.
 */
function pairAdjacentChanges(lines: DiffLine[]): DiffLine[] {
  let index = 0;

  while (index < lines.length) {
    if (lines[index].change !== "removed") {
      index += 1;
      continue;
    }

    const removedStart = index;
    while (index < lines.length && lines[index].change === "removed") index += 1;
    const removedEnd = index;

    const addedStart = index;
    while (index < lines.length && lines[index].change === "added") index += 1;
    const addedEnd = index;

    const removedCount = removedEnd - removedStart;
    const addedCount = addedEnd - addedStart;
    // Unequal runs mean lines were inserted or dropped, so which line replaced
    // which is a guess.
    if (removedCount === 0 || removedCount !== addedCount) continue;

    for (let offset = 0; offset < removedCount; offset += 1) {
      lines[removedStart + offset].pairedWith = addedStart + offset;
      lines[addedStart + offset].pairedWith = removedStart + offset;
    }
  }

  return lines;
}

/** The lines of one side, in file order, for a panel that shows a whole file. */
export function sideLines(lines: readonly DiffLine[], side: "before" | "after"): DiffLine[] {
  const excluded: LineChange = side === "before" ? "added" : "removed";
  return lines.filter((line) => line.change !== excluded);
}

/** Indices of the changed regions, for previous/next change navigation (plan.md 4.6). */
export function changeAnchors(lines: readonly DiffLine[]): number[] {
  const anchors: number[] = [];
  let previousWasChange = false;

  lines.forEach((line, index) => {
    const isChange = line.change !== "unchanged";
    // One anchor per contiguous run, so navigation steps between changes
    // rather than between lines.
    if (isChange && !previousWasChange) anchors.push(index);
    previousWasChange = isChange;
  });

  return anchors;
}
