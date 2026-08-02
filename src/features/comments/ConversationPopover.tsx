import { useEffect, useRef } from "react";

import { messages } from "../../messages/en";
import styles from "./ConversationPopover.module.css";
import type { IssueComment, ReviewSummary } from "./fetchReviewComments";
import { sanitizeCommentHtml } from "./sanitizeCommentHtml";

/**
 * The pull request's overall conversation (plan.md 4.8).
 *
 * It lives behind its own header button rather than inside the review form:
 * reading what others said is not part of submitting a verdict, and burying it
 * there meant nobody found it.
 */

export type ConversationPopoverProps = {
  open: boolean;
  onClose: () => void;
  issueComments: readonly IssueComment[];
  reviews: readonly ReviewSummary[];
};

type Entry = {
  key: string;
  author: string;
  at: string;
  bodyHtml: string;
  htmlUrl: string;
  verdict: string | null;
};

const VERDICTS: Record<ReviewSummary["state"], string | null> = {
  APPROVED: messages.review.approve,
  CHANGES_REQUESTED: messages.review.requestChanges,
  DISMISSED: messages.comments.dismissed,
  // A plain comment review needs no badge; its body is the whole content.
  COMMENTED: null,
};

/**
 * One list ordered by time.
 *
 * GitHub interleaves review bodies and issue comments in a single
 * conversation, and separating them would misrepresent the order people spoke.
 */
export function toConversation(
  issueComments: readonly IssueComment[],
  reviews: readonly ReviewSummary[],
): Entry[] {
  return [
    ...issueComments.map((comment) => ({
      key: `issue-${comment.id}`,
      author: comment.author?.login ?? messages.pullRequest.authorUnknown,
      at: comment.createdAt,
      bodyHtml: comment.bodyHtml,
      htmlUrl: comment.htmlUrl,
      verdict: null,
    })),
    ...reviews.map((review) => ({
      key: `review-${review.id}`,
      author: review.author?.login ?? messages.pullRequest.authorUnknown,
      at: review.submittedAt,
      bodyHtml: review.bodyHtml,
      htmlUrl: review.htmlUrl,
      verdict: VERDICTS[review.state],
    })),
  ].sort((a, b) => a.at.localeCompare(b.at));
}

export function ConversationPopover({
  open,
  onClose,
  issueComments,
  reviews,
}: ConversationPopoverProps) {
  const dialog = useRef<HTMLDialogElement | null>(null);
  const entries = toConversation(issueComments, reviews);

  useEffect(() => {
    const element = dialog.current;
    if (!element) return;
    if (open && !element.open) element.showModal();
    if (!open && element.open) element.close();
  }, [open]);

  return (
    // biome-ignore lint/a11y/useKeyWithClickEvents: the click handler only implements backdrop dismissal. Its keyboard equivalent is Esc, which the native dialog already handles and routes to onClose.
    <dialog
      ref={dialog}
      className={styles.dialog}
      aria-label={messages.comments.overallHeading}
      onClose={onClose}
      onClick={(event) => {
        if (event.target === dialog.current) onClose();
      }}
    >
      <div className={styles.panel}>
        <header className={styles.header}>
          <h2 className={styles.title}>{messages.comments.overallHeading}</h2>
          <button type="button" onClick={onClose} aria-label={messages.comments.closeConversation}>
            ×
          </button>
        </header>

        {entries.length === 0 ? (
          <p className={styles.empty}>{messages.comments.noOverall}</p>
        ) : (
          <ol className={styles.list}>
            {entries.map((entry) => (
              <li key={entry.key} className={styles.comment}>
                <header className={styles.commentHeader}>
                  <span className={styles.author}>{entry.author}</span>
                  {/* plan.md 7: the verdict is a word, not a colour. */}
                  {entry.verdict !== null && (
                    <span className={styles.verdict}>{entry.verdict}</span>
                  )}
                  <a href={entry.htmlUrl} target="_blank" rel="noreferrer noopener">
                    {messages.comments.viewOnGitHub}
                  </a>
                </header>
                <div
                  // The audited path every rendered comment body goes through.
                  // biome-ignore lint/security/noDangerouslySetInnerHtml: sanitised as plan.md 4.8 requires.
                  dangerouslySetInnerHTML={{ __html: sanitizeCommentHtml(entry.bodyHtml) }}
                />
              </li>
            ))}
          </ol>
        )}
      </div>
    </dialog>
  );
}
