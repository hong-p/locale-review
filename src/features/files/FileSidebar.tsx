import { messages } from "../../messages/en";
import type { LocaleSummary, TranslationFile } from "./translationFileModel";

/**
 * The locale chips and file list from plan.md 7.
 *
 * Viewed state and review progress arrive in phase 4; this covers the selection
 * and filtering plan.md 4.3 defines.
 */

export type FileSidebarProps = {
  files: readonly TranslationFile[];
  locales: readonly LocaleSummary[];
  selectedLocales: readonly string[];
  hiddenCount: number;
  selectedFileId: string | null;
  onToggleLocale: (locale: string) => void;
  onSelectFile: (id: string) => void;
};

/**
 * Locale display names come from the platform where available; plan.md 3.11
 * falls back to the code itself rather than shipping a name table.
 */
function localeLabel(locale: string): string {
  try {
    const name = new Intl.DisplayNames(undefined, { type: "language" }).of(locale);
    return name && name !== locale ? `${locale} · ${name}` : locale;
  } catch {
    return locale;
  }
}

const STATE_LABELS: Record<TranslationFile["state"], string> = {
  modified: messages.files.stateModified,
  added: messages.files.stateAdded,
  deleted: messages.files.stateDeleted,
  renamed: messages.files.stateRenamed,
};

export function FileSidebar({
  files,
  locales,
  selectedLocales,
  hiddenCount,
  selectedFileId,
  onToggleLocale,
  onSelectFile,
}: FileSidebarProps) {
  return (
    <nav aria-label={messages.files.sidebarLabel}>
      <fieldset>
        <legend>{messages.files.localeLegend}</legend>
        {locales.map((entry) => {
          const checked = selectedLocales.some(
            (locale) => locale.toLowerCase() === entry.locale.toLowerCase(),
          );
          return (
            <label key={entry.locale}>
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

      {hiddenCount > 0 && (
        <p>
          {messages.files.hiddenByFilter} {hiddenCount}
        </p>
      )}

      <ol>
        {files.map((file) => (
          <li key={file.id}>
            <button
              type="button"
              aria-current={file.id === selectedFileId ? "true" : undefined}
              onClick={() => onSelectFile(file.id)}
            >
              <span>{file.id}</span>
              {/* plan.md 7: state is a word, not only a colour. */}
              <span>{STATE_LABELS[file.state]}</span>
              <span>
                +{file.additions} −{file.deletions}
              </span>
              {file.previousPath !== null && (
                <span>
                  {messages.files.renamedFrom} {file.previousPath}
                </span>
              )}
              {!file.canComment && <span>{messages.files.noPatch}</span>}
            </button>
          </li>
        ))}
      </ol>

      {files.length === 0 && <p>{messages.files.noneSelected}</p>}
    </nav>
  );
}
