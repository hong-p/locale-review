import { type GitHubClient, asGitHubApiError } from "../../api/client";
import type { FileVersionRef } from "./translationFileModel";

/**
 * Reading a file's full text at a specific commit (plan.md 4.5).
 *
 * plan.md 4.5 requires whole files rather than GitHub's patch, because a patch
 * is omitted or truncated for a large file, and the three-column view shows
 * complete documents.
 */

/** Contents API stops embedding `content` above this size. */
export const CONTENTS_INLINE_LIMIT_BYTES = 1024 * 1024;

export type FileContent =
  | { state: "loaded"; text: string }
  /** plan.md 4.5's "Source file not found", and a deleted or added counterpart. */
  | { state: "absent" }
  /** Over 100 MB, or something the API will not serve as text. */
  | { state: "unsupported"; reason: "too-large" | "binary" };

/**
 * Decodes GitHub's base64 payload as UTF-8.
 *
 * `atob` alone returns one byte per character, which mangles every non-ASCII
 * codepoint. Translation content is non-ASCII by definition, so this path is
 * the normal one rather than an edge case.
 */
export function decodeBase64Utf8(encoded: string): string {
  // GitHub wraps the payload at 60 characters; atob rejects the newlines.
  const compact = encoded.replace(/\s/g, "");
  const binary = atob(compact);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new TextDecoder("utf-8").decode(bytes);
}

type ContentsPayload = {
  content?: unknown;
  encoding?: unknown;
  size?: unknown;
  type?: unknown;
};

const isContentsPayload = (value: unknown): value is ContentsPayload =>
  typeof value === "object" && value !== null;

const isBlobPayload = isContentsPayload;

function contentsPath(ref: FileVersionRef): string {
  // The path is already a repository path; each segment is escaped, but the
  // separators must survive.
  const encodedPath = ref.path.split("/").map(encodeURIComponent).join("/");
  return `/repos/${ref.repositoryFullName}/contents/${encodedPath}`;
}

/**
 * Fetches one version of one file.
 *
 * The raw media type is tried first, which avoids base64 entirely and is the
 * only form that works above the inline limit. The JSON form is the fallback,
 * and the Git blob API covers a file the Contents API declines to embed.
 */
export async function fetchFileContent(
  client: GitHubClient,
  ref: FileVersionRef,
  signal?: AbortSignal,
): Promise<FileContent> {
  try {
    const text = await client.requestRaw(contentsPath(ref), {
      searchParams: { ref: ref.ref },
      signal,
    });
    return { state: "loaded", text };
  } catch (error) {
    const apiError = asGitHubApiError(error);
    if (!apiError) throw error;

    // A missing file is a state, not a failure: plan.md 4.5 keeps the
    // translation diff usable when only the source is absent.
    if (apiError.code === "not-found") return { state: "absent" };

    // Anything else — a permission problem, a rate limit — is a real failure
    // and must not be reported as an empty file (plan.md 10).
    throw error;
  }
}

/**
 * Reads a file through the JSON Contents API, following on to the blob API when
 * GitHub declines to embed the content.
 *
 * Kept separate from the raw path so the decoding rules are testable on their
 * own; callers normally want `fetchFileContent`.
 */
export async function fetchFileContentViaJson(
  client: GitHubClient,
  ref: FileVersionRef,
  signal?: AbortSignal,
): Promise<FileContent> {
  const payload = await client.requestJson(contentsPath(ref), isContentsPayload, {
    searchParams: { ref: ref.ref },
    signal,
  });

  if (payload.type === "submodule" || payload.type === "symlink") {
    return { state: "unsupported", reason: "binary" };
  }

  const size = typeof payload.size === "number" ? payload.size : 0;
  const content = typeof payload.content === "string" ? payload.content : null;

  if (content !== null && content !== "" && payload.encoding === "base64") {
    return { state: "loaded", text: decodeBase64Utf8(content) };
  }

  // Above the inline limit GitHub returns an empty `content` with `encoding:
  // "none"`, and the blob API is the documented way through.
  if (size > CONTENTS_INLINE_LIMIT_BYTES || payload.encoding === "none") {
    return fetchViaBlob(client, ref, signal);
  }

  if (content === "" || content === null) return { state: "absent" };
  return { state: "unsupported", reason: "binary" };
}

async function fetchViaBlob(
  client: GitHubClient,
  ref: FileVersionRef,
  signal?: AbortSignal,
): Promise<FileContent> {
  const encodedPath = ref.path.split("/").map(encodeURIComponent).join("/");
  const payload = await client.requestJson(
    `/repos/${ref.repositoryFullName}/contents/${encodedPath}`,
    isBlobPayload,
    { searchParams: { ref: ref.ref }, signal },
  );

  const content = typeof payload.content === "string" ? payload.content : null;
  if (content === null || content === "") {
    // The blob API refuses above 100 MB, which plan.md 4.5 marks unsupported
    // rather than retrying in another form.
    return { state: "unsupported", reason: "too-large" };
  }
  return { state: "loaded", text: decodeBase64Utf8(content) };
}

/**
 * plan.md 4.5's fallback chain for a head version whose fork is gone.
 *
 * The commit stays reachable through the base repository, so each candidate is
 * tried in turn and the first that resolves wins. When every candidate is
 * absent the caller learns that the content genuinely cannot be fetched, rather
 * than seeing an empty file.
 */
export async function fetchWithFallback(
  client: GitHubClient,
  candidates: readonly FileVersionRef[],
  signal?: AbortSignal,
): Promise<FileContent> {
  let lastAbsent = false;

  for (const candidate of candidates) {
    const result = await fetchFileContent(client, candidate, signal);
    if (result.state === "loaded") return result;
    if (result.state === "unsupported") return result;
    lastAbsent = true;
  }

  return lastAbsent ? { state: "absent" } : { state: "unsupported", reason: "binary" };
}
