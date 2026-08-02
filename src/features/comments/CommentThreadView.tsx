import { useId, useRef, useState } from "react";

import { messages } from "../../messages/en";
import type { CommentThread } from "./fetchReviewComments";
import styles from "./CommentThreadView.module.css";
import { MarkdownToolbar } from "./MarkdownToolbar";
import { sanitizeCommentHtml } from "./sanitizeCommentHtml";
import { writeFailureMessage } from "./writeFailureMessage";

/**
 * One existing conversation (plan.md 4.8).
 *
 * Bodies are GitHub's rendered HTML, re-sanitised here. Nothing else in the app
 * inserts HTML, and this is the only place that may.
 */

export type CommentThreadViewProps = {
  thread: CommentThread;
  canReply: boolean;
  isBusy: boolean;
  onReply: (inReplyToId: number, body: string) => Promise<void>;
};

export function CommentThreadView({ thread, canReply, isBusy, onReply }: CommentThreadViewProps) {
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const textarea = useRef<HTMLTextAreaElement | null>(null);
  const replyId = useId();

  const submit = async () => {
    if (draft.trim() === "") return;
    try {
      await onReply(thread.rootId, draft.trim());
      // plan.md 4.9: clear only after the write is confirmed.
      setDraft("");
      setError(null);
    } catch (failure) {
      setError(writeFailureMessage(failure, messages.comments.replyFailed));
    }
  };

  return (
    <section className={styles.thread} aria-label={`${messages.comments.threadOn} ${thread.path}`}>
      <header className={styles.threadHeader}>
        <span>
          {thread.path}
          {thread.line !== null && `:${thread.line}`}
        </span>
        {/* plan.md 4.8: outdated is stated in words, not implied by styling. */}
        {thread.outdated && <span className={styles.outdated}>{messages.comments.outdated}</span>}
      </header>

      <ol className={styles.comments}>
        {thread.comments.map((comment) => (
          <li key={comment.id}>
            <article>
              <header className={styles.commentHeader}>
                <span className={styles.author}>
                  {comment.author?.login ?? messages.pullRequest.authorUnknown}
                </span>
                <time className={styles.time} dateTime={comment.createdAt}>
                  {formatTime(comment.createdAt)}
                </time>
                <a
                  className={styles.link}
                  href={comment.htmlUrl}
                  target="_blank"
                  rel="noreferrer noopener"
                >
                  {messages.comments.viewOnGitHub}
                </a>
              </header>
              <div
                className={styles.body}
                // The only dangerouslySetInnerHTML in the app. The value comes
                // from GitHub and is re-sanitised on the line above.
                // biome-ignore lint/security/noDangerouslySetInnerHtml: sanitised through the audited path required by plan.md 4.8.
                dangerouslySetInnerHTML={{ __html: sanitizeCommentHtml(comment.bodyHtml) }}
              />
            </article>
          </li>
        ))}
      </ol>

      {canReply ? (
        <form
          className={styles.replyForm}
          onSubmit={(event) => {
            event.preventDefault();
            void submit();
          }}
        >
          <label className={styles.replyLabel} htmlFor={replyId}>
            {messages.comments.replyLabel}
          </label>
          <MarkdownToolbar
            textarea={textarea}
            value={draft}
            onChange={setDraft}
            disabled={isBusy}
          />
          <textarea
            id={replyId}
            ref={textarea}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            rows={3}
          />
          <button type="submit" disabled={isBusy || draft.trim() === ""}>
            {isBusy ? messages.comments.sending : messages.comments.reply}
          </button>
          {error !== null && (
            <p role="alert" className={styles.error}>
              {error}
            </p>
          )}
        </form>
      ) : (
        <p className={styles.unavailable}>{messages.comments.replyUnavailable}</p>
      )}
    </section>
  );
}

/** plan.md 3.11 uses Intl rather than a date library. */
function formatTime(iso: string): string {
  if (iso === "") return "";
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return iso;
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(
    parsed,
  );
}
