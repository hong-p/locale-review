import { diffArrays } from "diff";

/**
 * Word-level highlighting inside a paired line (plan.md 4.6).
 *
 * Markdown prose is written as long lines, so a line-level diff paints a whole
 * paragraph as changed and hides what actually moved. This layer narrows that
 * to the segments that differ.
 *
 * It is display only, and deliberately separate from the line diff: plan.md 4.6
 * forbids it from influencing a GitHub comment position.
 */

export type IntraLineSegment = {
  text: string;
  changed: boolean;
};

export type IntraLinePair = {
  before: IntraLineSegment[];
  after: IntraLineSegment[];
};

/**
 * Above this length the comparison is skipped and the caller falls back to
 * whole-line marking. plan.md 4.6 allows that fallback rather than spending
 * unbounded time on a pathological line.
 */
export const MAX_INTRA_LINE_LENGTH = 4000;

/**
 * Below this ratio of shared segments the two lines are treated as unrelated,
 * so a complete rewrite is marked whole rather than sprinkled with accidental
 * matches on shared punctuation.
 */
const MIN_SIMILARITY = 0.2;

/**
 * Splits a line into comparison units.
 *
 * Whitespace-delimited languages split on words. Korean, Japanese, and Chinese
 * do not put spaces between words, so `Intl.Segmenter` is asked for word
 * boundaries instead; plan.md 3.11 requires an explicit fallback where it is
 * unavailable.
 */
export function segmentLine(text: string, locale?: string): string[] {
  const segmenter = createSegmenter(locale, "word");
  if (segmenter) {
    return [...segmenter.segment(text)].map((entry) => entry.segment);
  }

  // Keep the delimiters, or rejoining the segments would lose the spacing.
  const words = text.match(/\s+|[^\s]+/g);
  if (words) return words;
  return text === "" ? [] : [text];
}

/** Grapheme clusters, so an emoji or a combining mark is never split apart. */
export function segmentGraphemes(text: string, locale?: string): string[] {
  const segmenter = createSegmenter(locale, "grapheme");
  if (segmenter) {
    return [...segmenter.segment(text)].map((entry) => entry.segment);
  }
  // The spread of a string iterates by code point, which keeps surrogate pairs
  // together even though it does not group combining marks.
  return [...text];
}

function createSegmenter(
  locale: string | undefined,
  granularity: "word" | "grapheme",
): Intl.Segmenter | null {
  if (typeof Intl === "undefined" || typeof Intl.Segmenter !== "function") return null;
  try {
    return new Intl.Segmenter(locale, { granularity });
  } catch {
    // An unusual locale tag must not break rendering (plan.md 4.4).
    return null;
  }
}

function toSegments(parts: ReturnType<typeof diffArrays<string>>, side: "before" | "after") {
  const segments: IntraLineSegment[] = [];

  for (const part of parts) {
    const belongsToSide = side === "before" ? !part.added : !part.removed;
    if (!belongsToSide) continue;

    const text = part.value.join("");
    if (text === "") continue;
    segments.push({ text, changed: Boolean(part.added || part.removed) });
  }

  return mergeAdjacent(segments);
}

/** Adjacent segments with the same state render as one span. */
function mergeAdjacent(segments: IntraLineSegment[]): IntraLineSegment[] {
  const merged: IntraLineSegment[] = [];
  for (const segment of segments) {
    const last = merged[merged.length - 1];
    if (last && last.changed === segment.changed) {
      last.text += segment.text;
      continue;
    }
    merged.push({ ...segment });
  }
  return merged;
}

/**
 * A segment carrying actual content, as opposed to spacing or punctuation.
 *
 * Similarity is measured over these alone. Two unrelated sentences almost
 * always share their spaces and their final full stop, and counting those would
 * make a complete rewrite look like a small edit.
 */
const HAS_CONTENT = /\p{L}|\p{N}/u;

function similarity(parts: ReturnType<typeof diffArrays<string>>): number {
  let shared = 0;
  let total = 0;

  for (const part of parts) {
    const meaningful = part.value.filter((segment) => HAS_CONTENT.test(segment)).length;
    total += meaningful;
    if (!part.added && !part.removed) shared += meaningful;
  }

  // Nothing but punctuation on either side: there is no edit worth narrowing.
  return total === 0 ? 0 : shared / total;
}

/**
 * Compares one paired line.
 *
 * Returns null when the caller should fall back to whole-line marking: the line
 * is too long to compare, or the two versions have too little in common to call
 * the result an edit rather than a replacement.
 */
export function computeIntraLineDiff(
  before: string,
  after: string,
  locale?: string,
): IntraLinePair | null {
  if (before === after) return null;
  if (before.length > MAX_INTRA_LINE_LENGTH || after.length > MAX_INTRA_LINE_LENGTH) return null;

  let parts = diffArrays(segmentLine(before, locale), segmentLine(after, locale));

  // A word comparison finds nothing in common when the edit is inside a word,
  // which is common in agglutinative languages; graphemes catch that case.
  if (similarity(parts) < MIN_SIMILARITY) {
    const graphemeParts = diffArrays(
      segmentGraphemes(before, locale),
      segmentGraphemes(after, locale),
    );
    if (similarity(graphemeParts) < MIN_SIMILARITY) return null;
    parts = graphemeParts;
  }

  return {
    before: toSegments(parts, "before"),
    after: toSegments(parts, "after"),
  };
}
