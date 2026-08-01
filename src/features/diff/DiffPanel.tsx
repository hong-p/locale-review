import { type RefObject, useMemo } from "react";

import { messages } from "../../messages/en";
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
  /** True where lines were skipped in `Changes only` mode. */
  precedingGap: number | null;
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
}: DiffPanelProps) {
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
}: {
  row: PanelRow;
  side: DiffPanelProps["side"];
  dir: "ltr" | "rtl";
  locale: string;
  searchTerm: string;
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
        className={`${styles.line} ${rowClass ?? ""} ${matchesSearch ? styles.searchHit : ""}`}
        data-change={change}
      >
        <span className={styles.number}>{number ?? ""}</span>
        <span className={styles.marker} aria-hidden="true">
          {marker}
        </span>
        <span className={styles.text} dir={dir} lang={locale}>
          <LineText row={row} side={side} locale={locale} />
        </span>
      </div>
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
