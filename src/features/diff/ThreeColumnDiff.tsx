import { useCallback, useId, useMemo, useRef, useState } from "react";

import { messages } from "../../messages/en";
import { DiffPanel, type PanelRow } from "./DiffPanel";
import {
  buildDiffRows,
  buildSourceRows,
  collapseToChanges,
  rowChangeAnchors,
} from "./buildPanelRows";
import { computeLineDiff } from "./lineDiff";
import { type PatchHunk, parsePatch } from "./patchPositions";
import { scrollRatio, scrollTopForRatio, shouldApplyScroll } from "./scrollSync";
import styles from "./ThreeColumnDiff.module.css";

/**
 * The three-column viewer (plan.md 4.6).
 *
 * Panels scroll independently by default. Synchronisation is opt-in and
 * proportional, because a translation rarely has the same line count as its
 * source and matching line numbers would drift.
 */

export type PanelKey = "source" | "before" | "after";

export type ThreeColumnDiffProps = {
  sourceText: string | null;
  beforeText: string;
  afterText: string;
  sourceLocale: string;
  targetLocale: string;
  /** GitHub's patch, used only to decide what `Changes only` keeps. */
  patch: string | null;
  sourceMissing?: boolean;
};

const PANEL_ORDER: PanelKey[] = ["source", "before", "after"];

export function ThreeColumnDiff({
  sourceText,
  beforeText,
  afterText,
  sourceLocale,
  targetLocale,
  patch,
  sourceMissing = false,
}: ThreeColumnDiffProps) {
  const [visible, setVisible] = useState<Record<PanelKey, boolean>>({
    source: true,
    before: true,
    after: true,
  });
  const [changesOnly, setChangesOnly] = useState(false);
  const [syncScroll, setSyncScroll] = useState(false);
  const [search, setSearch] = useState("");
  const [narrowPanel, setNarrowPanel] = useState<PanelKey>("after");

  const searchId = useId();
  const scrollers = useRef<Record<PanelKey, HTMLDivElement | null>>({
    source: null,
    before: null,
    after: null,
  });
  // Applying a scroll fires another scroll event; this stops the echo.
  const syncing = useRef(false);

  const lines = useMemo(() => computeLineDiff(beforeText, afterText), [beforeText, afterText]);
  const hunks: PatchHunk[] = useMemo(() => parsePatch(patch).hunks, [patch]);

  const rows: Record<PanelKey, PanelRow[]> = useMemo(() => {
    const before = buildDiffRows(lines, "before");
    const after = buildDiffRows(lines, "after");
    const source = buildSourceRows(sourceText ?? "");

    if (!changesOnly) return { source, before, after };

    // plan.md 4.6: only the translation panels compress. The source stays whole
    // so a sentence the translation corresponds to is never cut away.
    return {
      source,
      before: collapseToChanges(before, hunks, "LEFT"),
      after: collapseToChanges(after, hunks, "RIGHT"),
    };
  }, [lines, sourceText, changesOnly, hunks]);

  const anchors = useMemo(() => rowChangeAnchors(rows.after), [rows.after]);
  const [anchorIndex, setAnchorIndex] = useState(0);

  const visibleCount = PANEL_ORDER.filter((key) => visible[key]).length;

  const togglePanel = (key: PanelKey) => {
    // plan.md 4.6 keeps at least one panel on screen.
    if (visible[key] && visibleCount === 1) return;
    setVisible((current) => ({ ...current, [key]: !current[key] }));
  };

  const onScroll = useCallback(
    (origin: PanelKey) => {
      // plan.md 4.6 disables sync in Changes only, where the panels no longer
      // represent comparable spans of the file.
      if (!syncScroll || changesOnly || syncing.current) return;

      const source = scrollers.current[origin];
      if (!source) return;

      syncing.current = true;
      const ratio = scrollRatio(source);

      for (const key of PANEL_ORDER) {
        if (key === origin) continue;
        const target = scrollers.current[key];
        if (!target) continue;
        const next = scrollTopForRatio(target, ratio);
        if (shouldApplyScroll(target.scrollTop, next)) target.scrollTop = next;
      }

      requestAnimationFrame(() => {
        syncing.current = false;
      });
    },
    [syncScroll, changesOnly],
  );

  const goToChange = (delta: number) => {
    if (anchors.length === 0) return;
    const next = (anchorIndex + delta + anchors.length) % anchors.length;
    setAnchorIndex(next);

    const scroller = scrollers.current.after;
    if (!scroller) return;
    const row = scroller.querySelectorAll("[data-change]")[anchors[next]];
    row?.scrollIntoView({ block: "center", behavior: "smooth" });
  };

  const panelProps = {
    source: {
      title: messages.diff.sourcePanel,
      locale: sourceLocale,
      rows: rows.source,
      emptyMessage: sourceMissing ? messages.files.sourceMissing : undefined,
    },
    before: { title: messages.diff.beforePanel, locale: targetLocale, rows: rows.before },
    after: { title: messages.diff.afterPanel, locale: targetLocale, rows: rows.after },
  } as const;

  const shownOnNarrow = visible[narrowPanel] ? narrowPanel : PANEL_ORDER.find((k) => visible[k]);

  return (
    <div className={styles.viewer}>
      <div className={styles.toolbar}>
        <fieldset className={styles.group}>
          <legend>{messages.diff.panelsLegend}</legend>
          {PANEL_ORDER.map((key) => (
            <label key={key}>
              <input
                type="checkbox"
                checked={visible[key]}
                disabled={visible[key] && visibleCount === 1}
                onChange={() => togglePanel(key)}
              />
              {panelProps[key].title}
            </label>
          ))}
        </fieldset>

        <label>
          <input
            type="checkbox"
            checked={changesOnly}
            onChange={(event) => setChangesOnly(event.target.checked)}
          />
          {messages.diff.changesOnly}
        </label>

        <label>
          <input
            type="checkbox"
            checked={syncScroll}
            disabled={changesOnly}
            onChange={(event) => setSyncScroll(event.target.checked)}
          />
          {messages.diff.syncScroll}
        </label>

        <div className={styles.group}>
          <button type="button" onClick={() => goToChange(-1)} disabled={anchors.length === 0}>
            {messages.diff.previousChange}
          </button>
          <span>
            {anchors.length === 0
              ? messages.diff.noChanges
              : `${messages.diff.change} ${anchorIndex + 1} / ${anchors.length}`}
          </span>
          <button type="button" onClick={() => goToChange(1)} disabled={anchors.length === 0}>
            {messages.diff.nextChange}
          </button>
        </div>

        <div className={styles.group}>
          <label htmlFor={searchId}>{messages.diff.search}</label>
          <input
            id={searchId}
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </div>

        {/* Narrow screens show one panel at a time (plan.md 4.6, 7). */}
        <fieldset className={`${styles.group} ${styles.narrowOnly}`}>
          <legend>{messages.diff.narrowLegend}</legend>
          {PANEL_ORDER.filter((key) => visible[key]).map((key) => (
            <label key={key}>
              <input
                type="radio"
                name="narrow-panel"
                checked={shownOnNarrow === key}
                onChange={() => setNarrowPanel(key)}
              />
              {panelProps[key].title}
            </label>
          ))}
        </fieldset>
      </div>

      {changesOnly && <p className={styles.syncNote}>{messages.diff.syncDisabled}</p>}

      <div
        className={styles.grid}
        style={{ "--visible-panels": visibleCount } as React.CSSProperties}
      >
        {PANEL_ORDER.filter((key) => visible[key]).map((key) => (
          <div
            key={key}
            className={shownOnNarrow === key ? undefined : styles.wideOnly}
            data-panel={key}
          >
            <DiffPanel
              {...panelProps[key]}
              side={key}
              searchTerm={search}
              scrollerRef={{
                get current() {
                  return scrollers.current[key];
                },
                set current(node: HTMLDivElement | null) {
                  scrollers.current[key] = node;
                },
              }}
              onScroll={() => onScroll(key)}
            />
          </div>
        ))}
      </div>
    </div>
  );
}
