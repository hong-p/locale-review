import type { CommentThread } from "../comments/fetchReviewComments";
import type { PanelRow } from "./DiffPanel";
import { type DiffLine, splitLines } from "./lineDiff";
import {
  type DiffSide,
  type ParsedPatch,
  type PatchHunk,
  hunkRanges,
  isCommentable,
} from "./patchPositions";

/**
 * Turning a diff into the rows one panel renders (plan.md 4.6).
 *
 * The before and after panels come from the shared diff so their changes line
 * up. The source panel is a different file that this diff says nothing about,
 * so it is rendered plainly.
 */

export type PanelSide = "source" | "before" | "after";

export type DiffRowOptions = {
  /** Existing conversations on this file, placed under the line they answer. */
  threads?: readonly CommentThread[];
  /** GitHub's patch, the only authority on where a comment may go (plan.md 4.9). */
  patch?: ParsedPatch;
};

/** Rows for the before or after panel, with counterparts and threads attached. */
export function buildDiffRows(
  lines: readonly DiffLine[],
  side: "before" | "after",
  options: DiffRowOptions = {},
): PanelRow[] {
  const excluded = side === "before" ? "added" : "removed";
  const diffSide: DiffSide = side === "before" ? "LEFT" : "RIGHT";

  // A thread is anchored by its own side and line, so a comment written on the
  // before side never appears beside the after text.
  const byLine = new Map<number, CommentThread[]>();
  for (const thread of options.threads ?? []) {
    if (thread.line === null || thread.side !== diffSide) continue;
    const existing = byLine.get(thread.line);
    if (existing) existing.push(thread);
    else byLine.set(thread.line, [thread]);
  }

  return lines
    .filter((line) => line.change !== excluded)
    .map((line) => {
      const lineNumber = side === "before" ? line.beforeLine : line.afterLine;
      return {
        line,
        counterpart: line.pairedWith === null ? null : (lines[line.pairedWith]?.text ?? null),
        precedingGap: null,
        threads: lineNumber === null ? [] : (byLine.get(lineNumber) ?? []),
        canComment:
          options.patch !== undefined &&
          lineNumber !== null &&
          isCommentable(options.patch, diffSide, lineNumber),
      };
    });
}

/**
 * Threads GitHub can no longer place on a line (plan.md 4.8's outdated state).
 *
 * They have nowhere to sit in the diff, so the panel shows them above it rather
 * than dropping them.
 */
export function outdatedThreads(threads: readonly CommentThread[]): CommentThread[] {
  return threads.filter((thread) => thread.line === null);
}

/** Rows for the source panel, which has no diff of its own. */
export function buildSourceRows(text: string): PanelRow[] {
  return splitLines(text).map((line, index) => ({
    line: {
      change: "unchanged" as const,
      text: line,
      beforeLine: index + 1,
      afterLine: index + 1,
      pairedWith: null,
    },
    counterpart: null,
    precedingGap: null,
    // The source file is not part of the pull request diff, so GitHub accepts
    // no comment there (plan.md 4.9).
    threads: [],
    canComment: false,
  }));
}

/**
 * `Changes only` (plan.md 4.6): keeps the rows inside each hunk and replaces
 * the rest with a gap marker.
 *
 * plan.md 4.6 applies this to the before and after panels only. The source
 * stays whole, so a sentence the translation corresponds to is never cut away
 * just because the source line itself did not change.
 */
export function collapseToChanges(
  rows: readonly PanelRow[],
  hunks: readonly PatchHunk[],
  side: DiffSide,
  context = 3,
): PanelRow[] {
  if (hunks.length === 0) return [...rows];

  const ranges = hunkRanges(hunks, side, context);
  const inRange = (lineNumber: number | null): boolean =>
    lineNumber !== null &&
    ranges.some((range) => lineNumber >= range.start && lineNumber <= range.end);

  const kept: PanelRow[] = [];
  let skipped = 0;

  for (const row of rows) {
    const lineNumber = side === "LEFT" ? row.line.beforeLine : row.line.afterLine;

    // A changed line is kept whatever the hunks say. Our line diff and GitHub's
    // patch can disagree — a truncated patch, or a diff computed with different
    // options — and hiding a change the reviewer needs to see is the worse of
    // the two failures.
    //
    // A line carrying a conversation is kept for the same reason: compressing
    // it away would make an existing comment vanish from the view.
    const keep =
      row.line.change !== "unchanged" ||
      row.threads.length > 0 ||
      lineNumber === null ||
      inRange(lineNumber);
    if (!keep) {
      skipped += 1;
      continue;
    }

    kept.push(skipped > 0 ? { ...row, precedingGap: skipped } : row);
    skipped = 0;
  }

  return kept;
}

/**
 * Row indices of each change, so previous/next navigation can scroll to them.
 *
 * One entry per contiguous run, matching how a reviewer thinks about "the next
 * change" rather than "the next changed line".
 */
export function rowChangeAnchors(rows: readonly PanelRow[]): number[] {
  const anchors: number[] = [];
  let previousWasChange = false;

  rows.forEach((row, index) => {
    const isChange = row.line.change !== "unchanged";
    if (isChange && !previousWasChange) anchors.push(index);
    previousWasChange = isChange;
  });

  return anchors;
}

/** Row indices whose text contains the search term (plan.md 4.6, per-panel search). */
export function searchMatches(rows: readonly PanelRow[], term: string): number[] {
  if (term === "") return [];
  const needle = term.toLowerCase();
  const matches: number[] = [];
  rows.forEach((row, index) => {
    if (row.line.text.toLowerCase().includes(needle)) matches.push(index);
  });
  return matches;
}
