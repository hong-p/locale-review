/**
 * Reading GitHub's unified patch to learn which lines accept a comment
 * (plan.md 4.9).
 *
 * This is the authority on comment positions. The app's own line diff is for
 * display only: plan.md 3.5 and 4.9 both require that a comment position comes
 * from GitHub's patch, because GitHub will reject a line its own diff does not
 * contain.
 */

export type DiffSide = "LEFT" | "RIGHT";

export type PatchHunk = {
  /** First line number of the hunk on the base side. */
  oldStart: number;
  oldLines: number;
  /** First line number of the hunk on the head side. */
  newStart: number;
  newLines: number;
};

export type CommentableLine = {
  side: DiffSide;
  /** The line number in that side's file, which is what GitHub's API expects. */
  line: number;
};

export type ParsedPatch = {
  hunks: PatchHunk[];
  /** Lines GitHub will accept a comment on, keyed `SIDE:line`. */
  commentable: ReadonlySet<string>;
};

export const commentKey = (side: DiffSide, line: number): string => `${side}:${line}`;

/** `@@ -oldStart,oldLines +newStart,newLines @@` — the counts are optional. */
const HUNK_HEADER = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/;

const EMPTY: ParsedPatch = { hunks: [], commentable: new Set() };

/**
 * Parses a unified patch into hunks and the set of commentable lines.
 *
 * A null patch is not an error: GitHub omits it for a large or binary file, and
 * plan.md 4.9 turns that into disabled comments rather than a failure.
 */
export function parsePatch(patch: string | null): ParsedPatch {
  if (patch === null || patch === "") return EMPTY;

  const hunks: PatchHunk[] = [];
  const commentable = new Set<string>();

  let oldLine = 0;
  let newLine = 0;
  let inHunk = false;

  for (const raw of patch.split("\n")) {
    const header = HUNK_HEADER.exec(raw);
    if (header) {
      const [, oldStart, oldCount, newStart, newCount] = header;
      hunks.push({
        oldStart: Number(oldStart),
        // An omitted count means 1, per the unified diff format.
        oldLines: oldCount === undefined ? 1 : Number(oldCount),
        newStart: Number(newStart),
        newLines: newCount === undefined ? 1 : Number(newCount),
      });
      oldLine = Number(oldStart);
      newLine = Number(newStart);
      inHunk = true;
      continue;
    }

    if (!inHunk) continue;

    // "\ No newline at end of file" annotates the previous line and advances
    // neither counter.
    if (raw.startsWith("\\")) continue;

    const marker = raw[0];
    if (marker === "+") {
      commentable.add(commentKey("RIGHT", newLine));
      newLine += 1;
    } else if (marker === "-") {
      commentable.add(commentKey("LEFT", oldLine));
      oldLine += 1;
    } else if (marker === " " || raw === "") {
      // GitHub accepts a comment on a context line too, on either side, since
      // both files contain it.
      commentable.add(commentKey("LEFT", oldLine));
      commentable.add(commentKey("RIGHT", newLine));
      oldLine += 1;
      newLine += 1;
    } else {
      // Anything else is not part of the hunk body.
      inHunk = false;
    }
  }

  return { hunks, commentable };
}

/** plan.md 4.9: a line outside GitHub's patch cannot carry a comment. */
export function isCommentable(patch: ParsedPatch, side: DiffSide, line: number): boolean {
  return patch.commentable.has(commentKey(side, line));
}

/**
 * The line ranges each hunk covers, used by the `Changes only` view (plan.md
 * 4.6) to decide what to keep.
 *
 * `context` widens each range so a changed line is not shown with nothing
 * around it.
 */
export function hunkRanges(
  hunks: readonly PatchHunk[],
  side: DiffSide,
  context = 3,
): Array<{ start: number; end: number }> {
  const ranges = hunks
    .map((hunk) => {
      const start = side === "LEFT" ? hunk.oldStart : hunk.newStart;
      const length = side === "LEFT" ? hunk.oldLines : hunk.newLines;
      return {
        start: Math.max(1, start - context),
        // A zero-length side means the hunk only adds or only deletes; it still
        // occupies a position on the other side.
        end: start + Math.max(length, 1) - 1 + context,
      };
    })
    .sort((a, b) => a.start - b.start);

  // Overlapping ranges would render the same line twice.
  const merged: Array<{ start: number; end: number }> = [];
  for (const range of ranges) {
    const last = merged[merged.length - 1];
    if (last && range.start <= last.end + 1) {
      last.end = Math.max(last.end, range.end);
      continue;
    }
    merged.push({ ...range });
  }
  return merged;
}
