import type { GitHubClient } from "../../api/client";
import type { PullRequestRef } from "../../api/types";

/**
 * The changed-file list of a pull request (plan.md 4.5, 4.9).
 *
 * GitHub caps this endpoint at 3,000 files. plan.md 4.9 forbids presenting a
 * truncated list as complete, so truncation is reported rather than hidden.
 */

/** GitHub's own limit on how many files this endpoint will ever return. */
export const CHANGED_FILES_LIMIT = 3000;

export type ChangedFileStatus = "added" | "modified" | "removed" | "renamed" | "other";

export type ChangedFile = {
  path: string;
  /** Present only for a rename; the path this file had at the merge base. */
  previousPath: string | null;
  status: ChangedFileStatus;
  additions: number;
  deletions: number;
  /**
   * GitHub omits the patch for a large or binary file. plan.md 4.9 disables
   * inline comments on such a file rather than guessing positions, so the
   * absence has to survive into the model.
   */
  patch: string | null;
  /** The blob SHA at the head commit, used by plan.md 4.5's fallback chain. */
  blobSha: string | null;
};

export type ChangedFilesResult = {
  files: ChangedFile[];
  /**
   * True when the list hit GitHub's cap. plan.md 4.9: an incomplete result must
   * never be shown as a finished one.
   */
  truncated: boolean;
};

type RawFile = {
  filename?: unknown;
  previous_filename?: unknown;
  status?: unknown;
  additions?: unknown;
  deletions?: unknown;
  patch?: unknown;
  sha?: unknown;
};

const isRawFileArray = (value: unknown): value is RawFile[] =>
  Array.isArray(value) && value.every((item) => typeof item === "object" && item !== null);

const asString = (value: unknown): string | null =>
  typeof value === "string" && value !== "" ? value : null;

const asCount = (value: unknown): number => (typeof value === "number" ? value : 0);

function toStatus(value: unknown): ChangedFileStatus {
  switch (value) {
    case "added":
    case "modified":
    case "removed":
    case "renamed":
      return value;
    // GitHub also reports copied, changed, and unchanged. None of them need
    // distinct handling here, and collapsing them keeps the union honest about
    // what this app actually models.
    default:
      return "other";
  }
}

export async function fetchChangedFiles(
  client: GitHubClient,
  ref: PullRequestRef,
  signal?: AbortSignal,
): Promise<ChangedFilesResult> {
  const path = `/repos/${encodeURIComponent(ref.owner)}/${encodeURIComponent(ref.repository)}/pulls/${ref.number}/files`;
  const raw = await client.requestAllPages(path, isRawFileArray, { signal });

  const files: ChangedFile[] = [];
  for (const item of raw) {
    const filename = asString(item.filename);
    // A file with no name is unusable; dropping it silently would be worse than
    // skipping it, but there is nothing meaningful to render either.
    if (filename === null) continue;

    files.push({
      path: filename,
      previousPath: asString(item.previous_filename),
      status: toStatus(item.status),
      additions: asCount(item.additions),
      deletions: asCount(item.deletions),
      patch: asString(item.patch),
      blobSha: asString(item.sha),
    });
  }

  return { files, truncated: files.length >= CHANGED_FILES_LIMIT };
}
