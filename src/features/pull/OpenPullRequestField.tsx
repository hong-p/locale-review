import { type FormEvent, useId, useState } from "react";
import { useNavigate } from "react-router";

import { messages } from "../../messages/en";
import { useToken } from "../auth/TokenContext";
import styles from "./OpenPullRequestField.module.css";
import { parsePullRequestUrl, pullRequestRefToPath } from "./parsePullRequestUrl";

/**
 * The pull request URL form.
 *
 * Shared by the start screen and the review header so switching to another
 * pull request does not mean going back first, and so both places validate the
 * same way (plan.md 4.1: an obviously wrong URL never costs a request).
 */

export type OpenPullRequestFieldProps = {
  /** `compact` is the header form; `full` is the start screen. */
  variant: "full" | "compact";
};

export function OpenPullRequestField({ variant }: OpenPullRequestFieldProps) {
  const { token } = useToken();
  const navigate = useNavigate();
  const [url, setUrl] = useState("");
  const [error, setError] = useState<string | null>(null);
  const fieldId = useId();
  const errorId = useId();

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();

    // plan.md 4.1: without a token nothing is fetched, so say that instead of
    // navigating to a screen that can only report the same thing.
    if (token === null) {
      setError(messages.start.tokenRequired);
      return;
    }

    const parsed = parsePullRequestUrl(url);
    if (!parsed.ok) {
      setError(messages.loadErrors.invalidUrlBody);
      return;
    }

    setError(null);
    setUrl("");
    void navigate(pullRequestRefToPath(parsed.ref));
  };

  const compact = variant === "compact";

  return (
    <form className={compact ? styles.compact : styles.full} onSubmit={onSubmit} noValidate>
      <label htmlFor={fieldId} className={compact ? styles.visuallyHidden : styles.label}>
        {messages.start.urlLabel}
      </label>

      <div className={styles.row}>
        <input
          id={fieldId}
          type="text"
          inputMode="url"
          autoComplete="off"
          value={url}
          placeholder={compact ? messages.start.urlShortPlaceholder : messages.start.urlPlaceholder}
          aria-invalid={error !== null}
          aria-describedby={error === null ? undefined : errorId}
          onChange={(event) => {
            setUrl(event.target.value);
            setError(null);
          }}
        />
        <button type="submit" className={compact ? undefined : styles.submit}>
          {compact ? messages.start.openShort : messages.start.submit}
        </button>
      </div>

      {/* Announced, not signalled by colour alone (plan.md 7). */}
      {error !== null && (
        <p id={errorId} role="alert" className={styles.error}>
          {error}
        </p>
      )}
    </form>
  );
}
