import { createStorageSlot } from "../../storage/safeStorage";
import type { DiffSide } from "../diff/patchPositions";
import type { ParsedPatch } from "../diff/patchPositions";
import { isCommentable } from "../diff/patchPositions";

/**
 * Keeping unsent comment text alive across a reload (plan.md 4.10).
 *
 * plan.md 4.10 is emphatic that user writing must not disappear silently. A
 * draft whose line no longer exists is kept as an unmapped draft rather than
 * discarded.
 */

export type CommentDraft = {
  id: string;
  path: string;
  line: number;
  side: DiffSide;
  body: string;
  /** True once the line it was written against no longer accepts a comment. */
  unmapped: boolean;
};

export type DraftBundle = {
  /** Keyed by pull request, so two tabs on two pull requests do not collide. */
  drafts: CommentDraft[];
  /** The overall review body, which is also unsent text. */
  reviewBody: string;
};

const EMPTY: DraftBundle = { drafts: [], reviewBody: "" };

const isDraft = (value: unknown): value is CommentDraft => {
  if (typeof value !== "object" || value === null) return false;
  const draft = value as Record<string, unknown>;
  return (
    typeof draft.id === "string" &&
    typeof draft.path === "string" &&
    typeof draft.line === "number" &&
    (draft.side === "LEFT" || draft.side === "RIGHT") &&
    typeof draft.body === "string" &&
    typeof draft.unmapped === "boolean"
  );
};

const isBundle = (value: unknown): value is DraftBundle => {
  if (typeof value !== "object" || value === null) return false;
  const bundle = value as Record<string, unknown>;
  return (
    Array.isArray(bundle.drafts) &&
    bundle.drafts.every(isDraft) &&
    typeof bundle.reviewBody === "string"
  );
};

/**
 * plan.md 5.3 puts unsent text in sessionStorage: it belongs to this tab's
 * work, and should not outlive the tab the way a saved preference does.
 */
export function draftSlot(pullRequestKey: string) {
  return createStorageSlot<DraftBundle>({
    key: `locale-review.drafts.${pullRequestKey}`,
    kind: "session",
    version: 1,
    fallback: EMPTY,
    parse: isBundle,
  });
}

export function draftKey(owner: string, repository: string, number: number): string {
  return `${owner}/${repository}#${number}`;
}

/**
 * Re-checks every draft against the current patch after a refresh.
 *
 * plan.md 4.10: a draft whose position survived stays attached, and one whose
 * line is gone is flagged rather than deleted, so the reviewer can copy the
 * text out.
 */
export function remapDrafts(
  drafts: readonly CommentDraft[],
  patches: ReadonlyMap<string, ParsedPatch>,
): CommentDraft[] {
  return drafts.map((draft) => {
    const patch = patches.get(draft.path);
    const stillValid = patch !== undefined && isCommentable(patch, draft.side, draft.line);
    return { ...draft, unmapped: !stillValid };
  });
}

export function upsertDraft(drafts: readonly CommentDraft[], draft: CommentDraft): CommentDraft[] {
  const index = drafts.findIndex((existing) => existing.id === draft.id);
  if (index === -1) return [...drafts, draft];
  const next = [...drafts];
  next[index] = draft;
  return next;
}

export function removeDraft(drafts: readonly CommentDraft[], id: string): CommentDraft[] {
  return drafts.filter((draft) => draft.id !== id);
}

/** True when there is unsent text a refresh could disturb (plan.md 4.10). */
export function hasUnsentWork(bundle: DraftBundle): boolean {
  return bundle.reviewBody.trim() !== "" || bundle.drafts.some((d) => d.body.trim() !== "");
}
