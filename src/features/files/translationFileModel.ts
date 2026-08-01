import type { PullRequestDiffBase } from "../../api/types";
import type {
  TranslationLayoutKind,
  TranslationLayoutSettings,
} from "../settings/translationLayout";
import { matchTranslationPath } from "../settings/translationLayout";
import type { ChangedFile } from "./fetchChangedFiles";

/**
 * Turning the changed-file list into the three-version model the viewer renders
 * (plan.md 4.2, 4.5).
 *
 * Every version is a (repository, ref, path) triple. Keeping them explicit is
 * what makes a fork pull request and a rename representable without the viewer
 * knowing anything about either.
 */

export type FileVersionRef = {
  repositoryFullName: string;
  /** A commit SHA, never a branch name: a branch moves while the page is open. */
  ref: string;
  path: string;
};

/** plan.md 4.5's file states. */
export type TranslationFileState = "modified" | "added" | "deleted" | "renamed";

export type TranslationFile = {
  /** Stable across a render; the head path, or the base path for a deletion. */
  id: string;
  locale: string;
  layout: TranslationLayoutKind;
  state: TranslationFileState;
  additions: number;
  deletions: number;
  /** Null when the file is added: there is no previous translation to show. */
  before: FileVersionRef | null;
  /** Null when the file is deleted: there is no proposed translation. */
  after: FileVersionRef | null;
  /**
   * Null when plan.md 4.5's "source file not found" case applies. The
   * translation diff still renders; only the source panel reports the absence.
   */
  source: FileVersionRef | null;
  /** The rename's previous path, for the header (plan.md 4.5). */
  previousPath: string | null;
  /** plan.md 4.9 disables inline comments when GitHub gave no patch. */
  canComment: boolean;
  blobSha: string | null;
};

export type LocaleSummary = {
  locale: string;
  fileCount: number;
};

export type TranslationFileModel = {
  files: TranslationFile[];
  /** Every locale detected in this pull request, with counts (plan.md 4.3). */
  locales: LocaleSummary[];
  /** Paths that matched more than one active layout (plan.md 4.2). */
  ambiguous: string[];
  /** Changed files that are not translations, kept only as a count. */
  ignoredCount: number;
};

export type BuildOptions = {
  settings: TranslationLayoutSettings;
  diffBase: PullRequestDiffBase;
  activeLayouts?: readonly TranslationLayoutKind[];
  knownLocales?: readonly string[];
  /**
   * Paths known to exist in the source locale at the merge base. When omitted,
   * a source is assumed to exist: plan.md 4.5 prefers showing the panel and
   * letting the fetch report a missing file over hiding it pre-emptively.
   */
  sourceExists?: (path: string) => boolean;
};

/**
 * Where the head content lives.
 *
 * plan.md 4.5: normally the fork, but once a fork is deleted the commit is
 * still reachable through the base repository, so that is the fallback.
 */
function headRepository(diffBase: PullRequestDiffBase): string {
  return diffBase.headRepositoryFullName ?? diffBase.baseRepositoryFullName;
}

function buildOne(
  file: ChangedFile,
  options: BuildOptions,
): { file: TranslationFile } | { ambiguous: string } | null {
  const { settings, diffBase } = options;

  // A rename has to be matched on the head path, which is the one that carries
  // the locale the reviewer is now looking at.
  const result = matchTranslationPath(file.path, settings, {
    activeLayouts: options.activeLayouts,
    knownLocales: options.knownLocales,
  });

  if (result.status === "ambiguous") return { ambiguous: file.path };
  if (result.status === "no-match") return null;

  const { match } = result;
  const state = toState(file);

  const beforePath = file.previousPath ?? file.path;
  const before: FileVersionRef | null =
    state === "added"
      ? null
      : {
          repositoryFullName: diffBase.baseRepositoryFullName,
          ref: diffBase.mergeBaseSha,
          path: beforePath,
        };

  const after: FileVersionRef | null =
    state === "deleted"
      ? null
      : {
          repositoryFullName: headRepository(diffBase),
          ref: diffBase.headSha,
          path: file.path,
        };

  // plan.md 4.5: the source is read from the base repository at the merge base
  // by default, so a reviewer compares against the text the translation was
  // made from rather than a source the pull request may also have changed.
  const sourceMissing = options.sourceExists ? !options.sourceExists(match.sourcePath) : false;
  const source: FileVersionRef | null = sourceMissing
    ? null
    : {
        repositoryFullName: diffBase.baseRepositoryFullName,
        ref: diffBase.mergeBaseSha,
        path: match.sourcePath,
      };

  return {
    file: {
      id: file.path,
      locale: match.locale,
      layout: match.kind,
      state,
      additions: file.additions,
      deletions: file.deletions,
      before,
      after,
      source,
      previousPath: state === "renamed" ? file.previousPath : null,
      // plan.md 4.9: without a patch there are no positions GitHub will accept.
      canComment: file.patch !== null,
      blobSha: file.blobSha,
    },
  };
}

function toState(file: ChangedFile): TranslationFileState {
  switch (file.status) {
    case "added":
      return "added";
    case "removed":
      return "deleted";
    case "renamed":
      return "renamed";
    default:
      return "modified";
  }
}

export function buildTranslationFileModel(
  changed: readonly ChangedFile[],
  options: BuildOptions,
): TranslationFileModel {
  const files: TranslationFile[] = [];
  const ambiguous: string[] = [];
  let ignoredCount = 0;

  for (const file of changed) {
    const result = buildOne(file, options);
    if (result === null) {
      ignoredCount += 1;
      continue;
    }
    if ("ambiguous" in result) {
      ambiguous.push(result.ambiguous);
      continue;
    }
    files.push(result.file);
  }

  return { files, locales: summarizeLocales(files), ambiguous, ignoredCount };
}

/** plan.md 4.3: every detected locale with its file count, ordered for display. */
export function summarizeLocales(files: readonly TranslationFile[]): LocaleSummary[] {
  const counts = new Map<string, number>();
  for (const file of files) {
    counts.set(file.locale, (counts.get(file.locale) ?? 0) + 1);
  }

  return (
    [...counts.entries()]
      .map(([locale, fileCount]) => ({ locale, fileCount }))
      // Most-changed first, then alphabetical, so the ordering is stable between
      // loads rather than following GitHub's file order.
      .sort((a, b) => b.fileCount - a.fileCount || a.locale.localeCompare(b.locale))
  );
}
