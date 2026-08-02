import { useEffect, useRef } from "react";

import { messages } from "../../messages/en";
import type { IssueComment } from "./fetchReviewComments";
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
};

export function ReviewPopover({ open, onClose, issueComments, ...summary }: ReviewPopoverProps) {
  const dialog = useRef<HTMLDialogElement | null>(null);

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
        {issueComments.length > 0 && (
          <section className={styles.conversation} aria-label={messages.comments.overallHeading}>
            <h3 className={styles.subheading}>{messages.comments.overallHeading}</h3>
            <ol className={styles.list}>
              {issueComments.map((comment) => (
                <li key={comment.id} className={styles.comment}>
                  <header className={styles.commentHeader}>
                    <span className={styles.author}>
                      {comment.author?.login ?? messages.pullRequest.authorUnknown}
                    </span>
                    <a href={comment.htmlUrl} target="_blank" rel="noreferrer noopener">
                      {messages.comments.viewOnGitHub}
                    </a>
                  </header>
                  <div
                    // Same audited path as every other rendered comment body.
                    // biome-ignore lint/security/noDangerouslySetInnerHtml: sanitised through the path plan.md 4.8 requires.
                    dangerouslySetInnerHTML={{ __html: sanitizeCommentHtml(comment.bodyHtml) }}
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
