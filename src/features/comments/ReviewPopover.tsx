import { useEffect, useRef } from "react";

import { messages } from "../../messages/en";
import type { IssueComment, ReviewSummary } from "./fetchReviewComments";
import { sanitizeCommentHtml } from "./sanitizeCommentHtml";
import { ReviewSummaryBox, type ReviewSummaryBoxProps } from "./ReviewSummaryBox";
import styles from "./ReviewPopover.module.css";

/**
 * The review form, opened from the header (design 2026-08-02).
 *
 * A full-height shell has no page bottom to put the form at, so it lives in a
 * dialog. `<dialog>` is used for the focus trap, Esc handling, and inertness of
 * the content behind it, none of which is worth reimplementing.
 */

export type ReviewPopoverProps = ReviewSummaryBoxProps & {
  open: boolean;
  onClose: () => void;
  /** The pull request's overall conversation (plan.md 4.8). */
  issueComments: readonly IssueComment[];
  /** Submitted review bodies, shown in the same conversation. */
  reviews: readonly ReviewSummary[];
};

type ConversationEntry = {
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
 * One list, ordered by time.
 *
 * GitHub interleaves review bodies and issue comments in a single
 * conversation, and separating them here would misrepresent the order people
 * actually spoke in.
 */
function toConversation(
  issueComments: readonly IssueComment[],
  reviews: readonly ReviewSummary[],
): ConversationEntry[] {
  const entries: ConversationEntry[] = [
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
  ];

  return entries.sort((a, b) => a.at.localeCompare(b.at));
}

export function ReviewPopover({
  open,
  onClose,
  issueComments,
  reviews,
  ...summary
}: ReviewPopoverProps) {
  const dialog = useRef<HTMLDialogElement | null>(null);
  const conversation = toConversation(issueComments, reviews);

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
      aria-label={messages.review.heading}
      // Esc and the backdrop both close it; React state stays the source of truth.
      onClose={onClose}
      onClick={(event) => {
        // A click landing on the dialog element itself is the backdrop, since
        // the panel inside covers the rest.
        if (event.target === dialog.current) onClose();
      }}
    >
      <div className={styles.panel}>
        <header className={styles.header}>
          <h2 className={styles.title}>{messages.review.heading}</h2>
          <button type="button" onClick={onClose} aria-label={messages.review.close}>
            ×
          </button>
        </header>

        {/* plan.md 4.8: overall comments were being fetched and never shown.
            They belong beside the form where the next one is written. */}
        {conversation.length > 0 && (
          <section className={styles.conversation} aria-label={messages.comments.overallHeading}>
            <h3 className={styles.subheading}>{messages.comments.overallHeading}</h3>
            <ol className={styles.list}>
              {conversation.map((entry) => (
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
                    // Same audited path as every other rendered comment body.
                    // biome-ignore lint/security/noDangerouslySetInnerHtml: sanitised through the path plan.md 4.8 requires.
                    dangerouslySetInnerHTML={{ __html: sanitizeCommentHtml(entry.bodyHtml) }}
                  />
                </li>
              ))}
            </ol>
          </section>
        )}

        <ReviewSummaryBox {...summary} />
      </div>
    </dialog>
  );
}
