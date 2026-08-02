import { useEffect, useMemo, useState } from "react";

import type { PullRequestDiffBase, PullRequestRef } from "../../api/types";
import { messages } from "../../messages/en";
import { threadsForFile } from "../comments/fetchReviewComments";
import type { CommentActions } from "../comments/useReviewComments";
import { useReviewComments } from "../comments/useReviewComments";
import { ThreeColumnDiff } from "../diff/ThreeColumnDiff";
import {
  filterFilesByLocale,
  hiddenFileCount,
  initialLocaleSelection,
  toggleLocale,
  unreviewedLocales,
} from "../locales/localeFilter";
import { DEFAULT_LAYOUT } from "../settings/translationLayout";
import { useViewedState } from "../viewed/useViewedState";
import type { FileContent } from "./fetchFileContent";
import { FileControls } from "./FileControls";
import { FileHeader } from "./FileHeader";
import layout from "./ReviewLayout.module.css";
import { buildTranslationFileModel } from "./translationFileModel";
import { useChangedFiles, useFileVersions } from "./useFileVersions";
import { ViewedToggle } from "../viewed/ViewedToggle";

/**
 * The review surface: file selection, locale filter, three-column diff, Viewed,
 * and the conversations anchored inside the diff
 * (plan.md 4.2, 4.3, 4.6, 4.7, 4.8, 4.9).
 *
 * The review form itself lives in the header, so the write actions are created
 * by the screen and passed in rather than being made here and handed upward.
 */

export type TranslationFileBrowserProps = {
  pullRequestRef: PullRequestRef;
  diffBase: PullRequestDiffBase;
  /** Whether this token may write; every write surface follows it (plan.md 4.9). */
  canWrite: boolean;
  actions: CommentActions;
  readOnlyNotice: boolean;
  /** Reports locales the filter hides, so the review form can warn (plan.md 4.3). */
  onLocaleScopeChange: (locales: readonly string[]) => void;
};

export function TranslationFileBrowser({
  pullRequestRef,
  diffBase,
  canWrite,
  actions,
  readOnlyNotice,
  onLocaleScopeChange,
}: TranslationFileBrowserProps) {
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
  const viewed = useViewedState(pullRequestRef, canWrite);
  const conversations = useReviewComments(pullRequestRef);

  // The patch stays on the raw changed file rather than the model, since only
  // the viewer and the comment layer need it.
  const selectedFilePatch =
    changed.data?.files.find((file) => file.path === selectedFile?.id)?.patch ?? null;

  const fileThreads = selectedFile
    ? threadsForFile(conversations.data?.threads ?? [], selectedFile.id)
    : [];

  // Reported as a joined string so the effect fires on a real change rather
  // than on every render, which a fresh array identity would cause.
  const hiddenLocales = model ? unreviewedLocales(model.locales, locales) : [];
  const hiddenKey = hiddenLocales.join(",");

  useEffect(() => {
    onLocaleScopeChange(hiddenKey === "" ? [] : hiddenKey.split(","));
  }, [onLocaleScopeChange, hiddenKey]);

  if (changed.isPending) return <p role="status">{messages.pullRequest.loading}</p>;
  if (!model) return null;

  if (model.files.length === 0) {
    return (
      <section className={layout.notices}>
        <h2>{messages.files.noTranslationsTitle}</h2>
        <p>{messages.files.noTranslationsBody}</p>
        <p>
          {messages.files.activeLayout}: {DEFAULT_LAYOUT.kind} · {DEFAULT_LAYOUT.contentRoot}/
          {"{locale}"} · {DEFAULT_LAYOUT.extensions.join(", ")}
        </p>
      </section>
    );
  }

  const viewedCount = visibleFiles.filter((file) => viewed.states.get(file.id) === "VIEWED").length;

  return (
    <div className={layout.body}>
      <FileControls
        files={visibleFiles}
        locales={model.locales}
        selectedLocales={locales}
        hiddenCount={hiddenFileCount(model.files, locales)}
        selectedFileId={selectedFile?.id ?? null}
        viewedCount={viewedCount}
        onToggleLocale={(locale) => setSelectedLocales(toggleLocale(locales, locale))}
        onSelectFile={setSelectedFileId}
      />

      {(readOnlyNotice ||
        changed.data?.truncated ||
        model.ambiguous.length > 0 ||
        (autoSelection?.needsChoice && selectedLocales === null)) && (
        <div className={layout.notices}>
          {readOnlyNotice && <Notice tone="info">{messages.pullRequest.readOnlyBody}</Notice>}
          {changed.data?.truncated && <Notice tone="warn">{messages.files.truncated}</Notice>}
          {model.ambiguous.length > 0 && (
            <Notice tone="warn">
              {messages.files.ambiguous} {model.ambiguous.join(", ")}
            </Notice>
          )}
          {autoSelection?.needsChoice && selectedLocales === null && (
            <Notice tone="info">{messages.files.chooseLocale}</Notice>
          )}
        </div>
      )}

      {selectedFile ? (
        <div className={layout.scrollArea}>
          <FileHeader
            file={selectedFile}
            viewed={<ViewedToggle path={selectedFile.id} controller={viewed} />}
          />

          <div className={layout.diffArea}>
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
                threads={fileThreads}
                comments={{
                  onReply: canWrite ? actions.reply : null,
                  onCreate: canWrite
                    ? (line, body, immediate, startLine) => {
                        const comment = {
                          path: selectedFile.id,
                          line,
                          side: "RIGHT" as const,
                          body,
                          // plan.md 4.9: a range carries both ends and both sides.
                          ...(startLine === undefined
                            ? {}
                            : { startLine, startSide: "RIGHT" as const }),
                        };
                        return immediate ? actions.postNow(comment) : actions.addToPending(comment);
                      }
                    : null,
                  isBusy: actions.isBusy,
                }}
              />
            )}
          </div>
        </div>
      ) : (
        <div className={layout.notices}>
          <Notice tone="info">{messages.files.noneSelected}</Notice>
        </div>
      )}
    </div>
  );
}

/** A short status or warning line, coloured but never colour alone (plan.md 7). */
function Notice({ tone, children }: { tone: "info" | "warn"; children: React.ReactNode }) {
  return (
    <p
      className={tone === "warn" ? layout.warnNotice : layout.infoNotice}
      role={tone === "warn" ? "alert" : "status"}
    >
      {children}
    </p>
  );
}

/** plan.md 4.3's default preferred locale, until settings expose it in the UI. */
const DEFAULT_PREFERRED = ["ko"] as const;

/** A version that is absent or unsupported renders as an empty panel. */
function contentText(content: FileContent | undefined): string | null {
  if (content?.state !== "loaded") return null;
  return content.text;
}
