import { type FormEvent, useId, useState } from "react";
import { useNavigate } from "react-router";

import { TokenPanel } from "../../features/auth/TokenPanel";
import { useToken } from "../../features/auth/TokenContext";
import { parsePullRequestUrl, pullRequestRefToPath } from "../../features/pull/parsePullRequestUrl";
import { messages } from "../../messages/en";
import { ThemeToggle } from "../ThemeToggle";

/**
 * plan.md 7's start screen.
 *
 * plan.md 4.1 requires that without a token the app does not begin fetching a
 * pull request at all, so the form refuses to navigate and points at the token
 * panel instead. The URL is validated here too, so an obviously wrong value
 * never costs a request.
 */
export function StartScreen() {
  const { token } = useToken();
  const navigate = useNavigate();
  const [url, setUrl] = useState("");
  const [error, setError] = useState<string | null>(null);
  const fieldId = useId();
  const errorId = useId();

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();

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
    void navigate(pullRequestRefToPath(parsed.ref));
  };

  return (
    <main>
      <header>
        <h1>{messages.app.name}</h1>
        <p>{messages.app.tagline}</p>
        <ThemeToggle />
      </header>

      <section aria-labelledby="start-heading">
        <h2 id="start-heading">{messages.start.heading}</h2>

        <form onSubmit={onSubmit} noValidate>
          <label htmlFor={fieldId}>{messages.start.urlLabel}</label>
          <input
            id={fieldId}
            type="text"
            inputMode="url"
            autoComplete="off"
            value={url}
            placeholder={messages.start.urlPlaceholder}
            aria-invalid={error !== null}
            aria-describedby={error === null ? undefined : errorId}
            onChange={(event) => {
              setUrl(event.target.value);
              setError(null);
            }}
          />
          <button type="submit">{messages.start.submit}</button>
        </form>

        {/* Announced rather than shown only in colour, per plan.md 7. */}
        {error !== null && (
          <p id={errorId} role="alert">
            {error}
          </p>
        )}
      </section>

      <TokenPanel />

      <footer>
        <p>{messages.start.privacy}</p>
      </footer>
    </main>
  );
}
