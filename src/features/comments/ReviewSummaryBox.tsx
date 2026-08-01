import { useId, useState } from "react";

import { messages } from "../../messages/en";
import type { ReviewEvent } from "./submitReview";

/**
 * Submitting the review (plan.md 4.9).
 *
 * The locale warning is the point of this component beyond the three buttons:
 * a verdict applies to the whole pull request, and plan.md 4.3 requires the
 * reviewer to be told when locales they never opened are part of it.
 */

export type ReviewSummaryBoxProps = {
  canSubmit: boolean;
  isBusy: boolean;
  /** Locales in the pull request that the filter hid (plan.md 4.3). */
  unreviewedLocales: readonly string[];
  pendingCommentCount: number;
  body: string;
  onBodyChange: (body: string) => void;
  onSubmit: (event: ReviewEvent, body: string) => Promise<void>;
};

const EVENTS: ReadonlyArray<{ event: ReviewEvent; label: string; needsWarning: boolean }> = [
  { event: "COMMENT", label: messages.review.comment, needsWarning: false },
  { event: "APPROVE", label: messages.review.approve, needsWarning: true },
  { event: "REQUEST_CHANGES", label: messages.review.requestChanges, needsWarning: true },
];

export function ReviewSummaryBox({
  canSubmit,
  isBusy,
  unreviewedLocales,
  pendingCommentCount,
  body,
  onBodyChange,
  onSubmit,
}: ReviewSummaryBoxProps) {
  const [event, setEvent] = useState<ReviewEvent>("COMMENT");
  const [confirmed, setConfirmed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bodyId = useId();

  const chosen = EVENTS.find((entry) => entry.event === event);
  const needsConfirmation = (chosen?.needsWarning ?? false) && unreviewedLocales.length > 0;

  const blocked = needsConfirmation && !confirmed;

  const submit = async () => {
    try {
      await onSubmit(event, body);
      setError(null);
    } catch {
      // plan.md 4.9: the text stays put on failure.
      setError(messages.review.submitFailed);
    }
  };

  return (
    <section aria-labelledby={`${bodyId}-heading`}>
      <h2 id={`${bodyId}-heading`}>{messages.review.heading}</h2>

      {pendingCommentCount > 0 && (
        <p>
          {messages.review.pendingCount} {pendingCommentCount}
        </p>
      )}

      <label htmlFor={bodyId}>{messages.review.bodyLabel}</label>
      <textarea
        id={bodyId}
        value={body}
        rows={4}
        disabled={!canSubmit}
        onChange={(changeEvent) => onBodyChange(changeEvent.target.value)}
      />

      <fieldset disabled={!canSubmit}>
        <legend>{messages.review.verdictLegend}</legend>
        {EVENTS.map((entry) => (
          <label key={entry.event}>
            <input
              type="radio"
              name="review-event"
              checked={event === entry.event}
              onChange={() => {
                setEvent(entry.event);
                setConfirmed(false);
              }}
            />
            {entry.label}
          </label>
        ))}
      </fieldset>

      {needsConfirmation && (
        <div role="alert">
          <p>
            {messages.review.localeWarning} {unreviewedLocales.join(", ")}
          </p>
          <label>
            <input
              type="checkbox"
              checked={confirmed}
              onChange={(changeEvent) => setConfirmed(changeEvent.target.checked)}
            />
            {messages.review.localeWarningAck}
          </label>
        </div>
      )}

      <button
        type="button"
        disabled={!canSubmit || isBusy || blocked}
        onClick={() => void submit()}
      >
        {isBusy ? messages.review.submitting : messages.review.submit}
      </button>

      {!canSubmit && <p>{messages.pullRequest.readOnlyBody}</p>}
      {error !== null && <p role="alert">{error}</p>}
    </section>
  );
}
