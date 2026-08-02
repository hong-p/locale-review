import { type RefObject, useMemo, useState } from "react";

import { messages } from "../../messages/en";
import { CommentComposer } from "../comments/CommentComposer";
import { CommentThreadView } from "../comments/CommentThreadView";
import type { CommentThread } from "../comments/fetchReviewComments";
import { isRtlLocale } from "../locales/textDirection";
import styles from "./DiffPanel.module.css";
import { computeIntraLineDiff } from "./intraLineDiff";
import type { DiffLine } from "./lineDiff";

/**
 * One column of the three-column viewer (plan.md 4.6).
 *
 * A panel renders a whole file with its own real line numbers. It knows nothing
 * about the other panels: alignment is the parent's job, via proportional
 * scrolling rather than shared row heights.
 */

export type PanelRow = {
  line: DiffLine;
  /** The paired line on the other side, when intra-line marking applies. */
  counterpart: string | null;
  /** How many lines were skipped before this one in `Changes only` mode. */
  precedingGap: number | null;
  /** Conversations anchored to this line (plan.md 4.8). */
  threads: CommentThread[];
  /** Whether GitHub would accept a new comment here (plan.md 4.9). */
  canComment: boolean;
};

/** What a panel may do with comments, decided by the caller's permissions. */
export type CommentCapabilities = {
  /** Null disables replying and writing entirely (read-only mode). */
  onReply: ((inReplyToId: number, body: string) => Promise<void>) | null;
  onCreate:
    | ((line: number, body: string, immediate: boolean, startLine?: number) => Promise<void>)
    | null;
  isBusy: boolean;
};

export type DiffPanelProps = {
  title: string;
  /** The locale whose text this panel shows; the source panel is the source locale. */
  locale: string;
  rows: readonly PanelRow[];
  side: "source" | "before" | "after";
  scrollerRef?: RefObject<HTMLDivElement | null>;
  onScroll?: () => void;
  searchTerm: string;
  emptyMessage?: string;
  comments?: CommentCapabilities;
};

export function DiffPanel({
  title,
  locale,
  rows,
  side,
  scrollerRef,
  onScroll,
  searchTerm,
  emptyMessage,
  comments,
}: DiffPanelProps) {
  /**
   * The lines a new comment covers (plan.md 4.9 allows a range).
   *
   * Held by the panel rather than a line, because a range belongs to no single
   * one. Clicking + starts a one-line range; shift-clicking another + extends
   * it, which is how GitHub's drag selection behaves without needing a drag.
   */
  const [range, setRange] = useState<{ start: number; end: number } | null>(null);

  const onAdd = (line: number, extend: boolean) => {
    setRange((current) =>
      extend && current !== null
        ? { start: Math.min(current.start, line), end: Math.max(current.end, line) }
        : { start: line, end: line },
    );
  };
  // plan.md 4.4: only the translation body follows the locale's direction;
  // numbers, markers, and chrome stay left-to-right.
  const dir = isRtlLocale(locale) ? "rtl" : "ltr";

  return (
    <section className={styles.panel} aria-label={title}>
      <header className={styles.header}>
        <span className={styles.title}>{title}</span>
        <span>{locale}</span>
      </header>

      {rows.length === 0 ? (
        <p className={styles.empty}>{emptyMessage ?? messages.diff.emptyPanel}</p>
      ) : (
        <div
          className={styles.scroller}
          ref={scrollerRef}
          onScroll={onScroll}
          // biome-ignore lint/a11y/noNoninteractiveTabindex: a scrollable area with no focusable control inside must still be a tab stop, or a keyboard user cannot scroll the file at all (plan.md 7). The enclosing section already names it.
          tabIndex={0}
        >
          <div className={styles.lines}>
            {rows.map((row) => (
              <PanelLine
                // Within one panel a line has exactly one number on its side,
                // so the pair identifies the row without the array index.
                key={`${row.line.beforeLine ?? "x"}:${row.line.afterLine ?? "x"}`}
                row={row}
                side={side}
                dir={dir}
                locale={locale}
                searchTerm={searchTerm}
                comments={comments}
                range={range}
                onAdd={onAdd}
                onCancel={() => setRange(null)}
              />
            ))}
          </div>
        </div>
      )}
    </section>
  );
}

function PanelLine({
  row,
  side,
  dir,
  locale,
  searchTerm,
  comments,
  range,
  onAdd,
  onCancel,
}: {
  row: PanelRow;
  side: DiffPanelProps["side"];
  dir: "ltr" | "rtl";
  locale: string;
  searchTerm: string;
  comments?: CommentCapabilities;
  range: { start: number; end: number } | null;
  onAdd: (line: number, extend: boolean) => void;
  onCancel: () => void;
}) {
  const { line } = row;
  const number = side === "after" ? line.afterLine : line.beforeLine;

  // The source panel shows its own file, which this diff says nothing about.
  const change = side === "source" ? "unchanged" : line.change;
  const rowClass =
    change === "added" ? styles.added : change === "removed" ? styles.removed : undefined;

  // plan.md 7 forbids colour as the only signal, so the marker is a character.
  const marker = change === "added" ? "+" : change === "removed" ? "−" : " ";

  const matchesSearch =
    searchTerm !== "" && line.text.toLowerCase().includes(searchTerm.toLowerCase());

  const inRange = range !== null && number !== null && number >= range.start && number <= range.end;
  const isRangeEnd = range !== null && number === range.end;

  return (
    <>
      {row.precedingGap !== null && (
        <div className={styles.gap}>
          <span className={styles.gapText}>
            {messages.diff.skippedLines} {row.precedingGap}
          </span>
        </div>
      )}
      <div
        className={`${styles.line} ${rowClass ?? ""} ${matchesSearch ? styles.searchHit : ""} ${
          inRange ? styles.selected : ""
        }`}
        data-change={change}
      >
        <span className={styles.number}>{number ?? ""}</span>
        <span className={styles.marker} aria-hidden="true">
          {marker}
        </span>
        {/* plan.md 4.9: only a line GitHub accepts, and only when writing is
            available. It sits in the gutter so it never shifts the text. */}
        {row.canComment && comments?.onCreate ? (
          <button
            type="button"
            className={inRange ? styles.addCommentActive : styles.addComment}
            onClick={(event) => onAdd(number ?? 0, event.shiftKey)}
            aria-label={`${messages.comments.addOnLine} ${number ?? ""}`}
            aria-pressed={inRange}
            title={messages.comments.shiftToExtend}
          >
            +
          </button>
        ) : (
          <span className={styles.addCommentSpacer} />
        )}

        <span className={styles.text} dir={dir} lang={locale}>
          <LineText row={row} side={side} locale={locale} />
        </span>
      </div>

      {row.threads.map((thread) => (
        <div className={styles.threadRow} key={thread.rootId}>
          <div className={styles.threadCell}>
            <CommentThreadView
              thread={thread}
              canReply={comments?.onReply !== null && comments?.onReply !== undefined}
              isBusy={comments?.isBusy ?? false}
              onReply={comments?.onReply ?? (async () => undefined)}
            />
          </div>
        </div>
      ))}

      {/* The composer sits at the end of the range, so a multi-line selection
          reads downward into the box the way GitHub's does. */}
      {isRangeEnd && comments?.onCreate && range !== null && (
        <div className={styles.threadRow}>
          <div className={styles.threadCell}>
            <CommentComposer
              line={range.end}
              startLine={range.start === range.end ? undefined : range.start}
              isBusy={comments.isBusy}
              onCancel={onCancel}
              onSubmit={async (body, immediate) => {
                await comments.onCreate?.(
                  range.end,
                  body,
                  immediate,
                  range.start === range.end ? undefined : range.start,
                );
                onCancel();
              }}
            />
          </div>
        </div>
      )}
    </>
  );
}

/**
 * Renders the line, narrowing the highlight to the changed words when the two
 * versions are confidently paired.
 */
function LineText({
  row,
  side,
  locale,
}: {
  row: PanelRow;
  side: DiffPanelProps["side"];
  locale: string;
}) {
  const { line, counterpart } = row;

  const segments = useMemo(() => {
    if (side === "source" || counterpart === null) return null;
    if (line.change !== "added" && line.change !== "removed") return null;

    const pair =
      line.change === "added"
        ? computeIntraLineDiff(counterpart, line.text, locale)
        : computeIntraLineDiff(line.text, counterpart, locale);

    if (!pair) return null;
    return line.change === "added" ? pair.after : pair.before;
  }, [line.change, line.text, counterpart, side, locale]);

  // No confident pairing: plan.md 4.6 falls back to the whole line being marked.
  if (segments === null) return <>{line.text}</>;

  const highlight = line.change === "added" ? styles.wordAdded : styles.wordRemoved;

  let offset = 0;
  return (
    <>
      {segments.map((segment) => {
        // The same word can appear twice in a line, so the character offset is
        // what actually identifies a segment.
        const key = `${offset}:${segment.changed}`;
        offset += segment.text.length;
        return (
          <span key={key} className={segment.changed ? highlight : undefined}>
            {segment.text}
          </span>
        );
      })}
    </>
  );
}
