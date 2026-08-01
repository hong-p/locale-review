import { useState } from "react";

import { messages } from "../../messages/en";
import type { CommentThread } from "./fetchReviewComments";
import { sanitizeCommentHtml } from "./sanitizeCommentHtml";

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

  const submit = async () => {
    if (draft.trim() === "") return;
    try {
      await onReply(thread.rootId, draft.trim());
      // plan.md 4.9: clear only after the write is confirmed.
      setDraft("");
      setError(null);
    } catch {
      setError(messages.comments.replyFailed);
    }
  };

  return (
    <section aria-label={`${messages.comments.threadOn} ${thread.path}`}>
      <header>
        <span>
          {thread.path}
          {thread.line !== null && `:${thread.line}`}
        </span>
        {/* plan.md 4.8: outdated is stated in words, not implied by styling. */}
        {thread.outdated && <span>{messages.comments.outdated}</span>}
      </header>

      <ol>
        {thread.comments.map((comment) => (
          <li key={comment.id}>
            <article>
              <header>
                <span>{comment.author?.login ?? messages.pullRequest.authorUnknown}</span>
                <time dateTime={comment.createdAt}>{formatTime(comment.createdAt)}</time>
                <a href={comment.htmlUrl} target="_blank" rel="noreferrer noopener">
                  {messages.comments.viewOnGitHub}
                </a>
              </header>
              <div
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
          onSubmit={(event) => {
            event.preventDefault();
            void submit();
          }}
        >
          <label>
            {messages.comments.replyLabel}
            <textarea value={draft} onChange={(event) => setDraft(event.target.value)} rows={3} />
          </label>
          <button type="submit" disabled={isBusy || draft.trim() === ""}>
            {isBusy ? messages.comments.sending : messages.comments.reply}
          </button>
          {error !== null && <p role="alert">{error}</p>}
        </form>
      ) : (
        <p>{messages.comments.replyUnavailable}</p>
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
