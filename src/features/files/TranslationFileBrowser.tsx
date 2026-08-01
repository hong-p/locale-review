import { useMemo, useState } from "react";

import type { PullRequestDiffBase, PullRequestRef } from "../../api/types";
import { messages } from "../../messages/en";
import { ThreeColumnDiff } from "../diff/ThreeColumnDiff";
import {
  filterFilesByLocale,
  hiddenFileCount,
  initialLocaleSelection,
  toggleLocale,
} from "../locales/localeFilter";
import { DEFAULT_LAYOUT } from "../settings/translationLayout";
import { FileSidebar } from "./FileSidebar";
import { buildTranslationFileModel } from "./translationFileModel";
import type { FileContent } from "./fetchFileContent";
import { useChangedFiles, useFileVersions } from "./useFileVersions";

/**
 * Ties the changed-file list, the locale filter, and lazy content loading
 * together (plan.md 4.2, 4.3, 4.6).
 *
 * The three-column viewer itself is phase 3. What lands here is the selection
 * model it will render into, plus proof that content loads only for the
 * selected file.
 */

export type TranslationFileBrowserProps = {
  pullRequestRef: PullRequestRef;
  diffBase: PullRequestDiffBase;
};

export function TranslationFileBrowser({ pullRequestRef, diffBase }: TranslationFileBrowserProps) {
  const changed = useChangedFiles(pullRequestRef);

  const model = useMemo(
    () =>
      changed.data
        ? buildTranslationFileModel(changed.data.files, {
            settings: DEFAULT_LAYOUT,
            diffBase,
          })
        : null,
    [changed.data, diffBase],
  );

  // Null until the model arrives, so the automatic selection runs once against
  // the real locale list rather than against an empty one.
  const [selectedLocales, setSelectedLocales] = useState<readonly string[] | null>(null);
  const [selectedFileId, setSelectedFileId] = useState<string | null>(null);

  const autoSelection = useMemo(
    () => (model ? initialLocaleSelection(model.locales, DEFAULT_PREFERRED) : null),
    [model],
  );

  const locales = selectedLocales ?? autoSelection?.selected ?? [];
  const visibleFiles = model ? filterFilesByLocale(model.files, locales) : [];
  const selectedFile =
    visibleFiles.find((file) => file.id === selectedFileId) ?? visibleFiles[0] ?? null;

  const versions = useFileVersions(selectedFile, diffBase);

  // The patch stays on the raw changed file rather than the model, since only
  // the viewer and the comment layer need it.
  const selectedFilePatch =
    changed.data?.files.find((file) => file.path === selectedFile?.id)?.patch ?? null;

  if (changed.isPending) return <p role="status">{messages.pullRequest.loading}</p>;
  if (!model) return null;

  if (model.files.length === 0) {
    return (
      <section>
        <h2>{messages.files.noTranslationsTitle}</h2>
        <p>{messages.files.noTranslationsBody}</p>
        <p>
          {messages.files.activeLayout}: {DEFAULT_LAYOUT.kind} · {DEFAULT_LAYOUT.contentRoot}/
          {"{locale}"} · {DEFAULT_LAYOUT.extensions.join(", ")}
        </p>
      </section>
    );
  }

  return (
    <section>
      {changed.data?.truncated && <p role="alert">{messages.files.truncated}</p>}
      {model.ambiguous.length > 0 && (
        <p role="alert">
          {messages.files.ambiguous} {model.ambiguous.join(", ")}
        </p>
      )}
      {autoSelection?.needsChoice && selectedLocales === null && (
        <p role="status">{messages.files.chooseLocale}</p>
      )}

      <FileSidebar
        files={visibleFiles}
        locales={model.locales}
        selectedLocales={locales}
        hiddenCount={hiddenFileCount(model.files, locales)}
        selectedFileId={selectedFile?.id ?? null}
        onToggleLocale={(locale) => setSelectedLocales(toggleLocale(locales, locale))}
        onSelectFile={setSelectedFileId}
      />

      {selectedFile && (
        <article aria-label={selectedFile.id}>
          <h2>{selectedFile.id}</h2>
          {selectedFile.previousPath !== null && (
            <p>
              {messages.files.renamedFrom} {selectedFile.previousPath}
            </p>
          )}
          {versions.isLoading ? (
            <p role="status">{messages.files.loadingContent}</p>
          ) : (
            <ThreeColumnDiff
              sourceText={contentText(versions.source)}
              beforeText={contentText(versions.before) ?? ""}
              afterText={contentText(versions.after) ?? ""}
              sourceLocale={DEFAULT_LAYOUT.sourceLocale}
              targetLocale={selectedFile.locale}
              patch={selectedFilePatch}
              sourceMissing={selectedFile.source === null || versions.source?.state === "absent"}
            />
          )}
          {!selectedFile.canComment && <p>{messages.files.noPatch}</p>}
        </article>
      )}
    </section>
  );
}

/** plan.md 4.3's default preferred locale, until settings expose it in the UI. */
const DEFAULT_PREFERRED = ["ko"] as const;

/** A version that is absent or unsupported renders as an empty panel. */
function contentText(content: FileContent | undefined): string | null {
  if (content?.state !== "loaded") return null;
  return content.text;
}
