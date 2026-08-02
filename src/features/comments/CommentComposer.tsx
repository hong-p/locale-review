import { useId, useState } from "react";

import { messages } from "../../messages/en";
import styles from "./CommentComposer.module.css";
import { writeFailureMessage } from "./writeFailureMessage";

/**
 * Writing a new inline comment on one line (plan.md 4.9).
 *
 * Both submission routes live here because they differ only in destination:
 * posting immediately, or gathering into the pending review that gets a verdict
 * later. Neither retries, and neither clears the text until GitHub confirmed.
 */

export type CommentComposerProps = {
  /** The last line of the selection, which is where the comment is anchored. */
  line: number;
  /** Set for a multi-line comment; the range runs from here to `line`. */
  startLine?: number;
  isBusy: boolean;
  onCancel: () => void;
  onSubmit: (body: string, immediate: boolean) => Promise<void>;
};

export function CommentComposer({
  line,
  startLine,
  isBusy,
  onCancel,
  onSubmit,
}: CommentComposerProps) {
  const [body, setBody] = useState("");
  const [error, setError] = useState<string | null>(null);
  const fieldId = useId();

  const send = async (immediate: boolean) => {
    const trimmed = body.trim();
    if (trimmed === "") return;
    try {
      await onSubmit(trimmed, immediate);
      setError(null);
    } catch (failure) {
      // plan.md 4.9: a failed write keeps the text exactly where it was, and
      // says why rather than only that it failed.
      setError(writeFailureMessage(failure, messages.comments.createFailed));
    }
  };

  return (
    <form
      className={styles.composer}
      onSubmit={(event) => {
        event.preventDefault();
        void send(false);
      }}
    >
      <label htmlFor={fieldId} className={styles.label}>
        {startLine === undefined
          ? `${messages.comments.newOnLine} ${line}`
          : `${messages.comments.newOnLines} ${startLine}–${line}`}
      </label>
      <textarea
        id={fieldId}
        className={styles.textarea}
        value={body}
        rows={3}
        // The composer opens in response to a click, so focus belongs here.
        // biome-ignore lint/a11y/noAutofocus: the control was just opened by an explicit user action, and moving focus is the expected result.
        autoFocus
        onChange={(event) => setBody(event.target.value)}
      />

      <div className={styles.actions}>
        <button type="button" className={styles.ghost} onClick={onCancel} disabled={isBusy}>
          {messages.comments.cancel}
        </button>
        <button
          type="button"
          className={styles.secondary}
          disabled={isBusy || body.trim() === ""}
          onClick={() => void send(true)}
        >
          {messages.comments.postNow}
        </button>
        <button type="submit" className={styles.primary} disabled={isBusy || body.trim() === ""}>
          {messages.comments.addToReview}
        </button>
      </div>

      {error !== null && (
        <p role="alert" className={styles.error}>
          {error}
        </p>
      )}
    </form>
  );
}
