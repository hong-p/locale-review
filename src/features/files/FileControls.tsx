import { useId } from "react";

import { messages } from "../../messages/en";
import styles from "./FileControls.module.css";
import type { LocaleSummary, TranslationFile } from "./translationFileModel";

/**
 * File selection, locale filtering, and progress, in one strip above the diff
 * (design 2026-08-02, revised).
 *
 * These began in a left sidebar. Three columns of prose need the width more
 * than a file list does, so the controls became horizontal and the diff got
 * the whole viewport.
 */

export type FileControlsProps = {
  files: readonly TranslationFile[];
  locales: readonly LocaleSummary[];
  selectedLocales: readonly string[];
  hiddenCount: number;
  selectedFileId: string | null;
  viewedCount: number;
  onToggleLocale: (locale: string) => void;
  onSelectFile: (id: string) => void;
};

/** Platform locale names where available, the code itself otherwise (plan.md 3.11). */
function localeLabel(locale: string): string {
  try {
    const name = new Intl.DisplayNames(undefined, { type: "language" }).of(locale);
    return name && name !== locale ? `${locale} · ${name}` : locale;
  } catch {
    return locale;
  }
}

export function FileControls({
  files,
  locales,
  selectedLocales,
  hiddenCount,
  selectedFileId,
  viewedCount,
  onToggleLocale,
  onSelectFile,
}: FileControlsProps) {
  const selectId = useId();
  const index = files.findIndex((file) => file.id === selectedFileId);

  const step = (delta: number) => {
    const next = files[index + delta];
    if (next) onSelectFile(next.id);
  };

  return (
    <div className={styles.controls}>
      {/* A select rather than a list: one file is open at a time (plan.md 4.6),
          and a dropdown costs one line instead of a column. */}
      <div className={styles.group}>
        <label htmlFor={selectId} className={styles.label}>
          {messages.files.fileLabel}
        </label>
        <select
          id={selectId}
          className={styles.select}
          value={selectedFileId ?? ""}
          onChange={(event) => onSelectFile(event.target.value)}
        >
          {files.map((file) => (
            <option key={file.id} value={file.id}>
              {file.id}
            </option>
          ))}
        </select>

        <button
          type="button"
          onClick={() => step(-1)}
          disabled={index <= 0}
          aria-label={messages.files.previousFile}
        >
          ‹
        </button>
        <span className={styles.position}>
          {files.length === 0 ? 0 : index + 1} / {files.length}
        </span>
        <button
          type="button"
          onClick={() => step(1)}
          disabled={index === -1 || index >= files.length - 1}
          aria-label={messages.files.nextFile}
        >
          ›
        </button>
      </div>

      <fieldset className={styles.group}>
        <legend className={styles.label}>{messages.files.localeLegend}</legend>
        {locales.map((entry) => {
          const checked = selectedLocales.some(
            (locale) => locale.toLowerCase() === entry.locale.toLowerCase(),
          );
          return (
            <label key={entry.locale} className={checked ? styles.chipOn : styles.chip}>
              <input
                type="checkbox"
                checked={checked}
                onChange={() => onToggleLocale(entry.locale)}
              />
              {localeLabel(entry.locale)} ({entry.fileCount})
            </label>
          );
        })}
      </fieldset>

      <div className={styles.status}>
        {/* plan.md 4.7: progress counts the files the filter is showing. */}
        <span>
          {messages.viewed.progress} {viewedCount} / {files.length}
        </span>
        {hiddenCount > 0 && (
          <span className={styles.hidden}>
            {messages.files.hiddenByFilter} {hiddenCount}
          </span>
        )}
      </div>
    </div>
  );
}
