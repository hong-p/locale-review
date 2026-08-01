import { type FormEvent, useId, useState } from "react";

import { messages } from "../../messages/en";
import { testConnection } from "./connection";
import { useToken } from "./TokenContext";

const CREATE_TOKEN_URL = "https://github.com/settings/personal-access-tokens/new";

/**
 * Setting, testing, and clearing the token (plan.md 5.1, 5.2).
 *
 * The field is never populated from storage. Rendering a stored token back into
 * the DOM would put it in the accessibility tree, in a screenshot, and in any
 * page capture, for no benefit: the user already told us it once.
 */
export function TokenPanel() {
  const { token, mode, client, connection, setToken, setMode, clearToken, setConnection } =
    useToken();
  const [draft, setDraft] = useState("");
  const [isTesting, setIsTesting] = useState(false);
  /**
   * Result of an explicit Test connection press.
   *
   * The app resolves the account on its own as soon as a token exists, so the
   * signed-in line is already on screen before the button is touched. Without
   * a separate record of the press, clicking produced no visible change and
   * gave no answer to the question the button asks.
   */
  const [tested, setTested] = useState<"ok" | "failed" | null>(null);
  const fieldId = useId();
  const rememberId = useId();

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    if (draft.trim() === "") return;
    setToken(draft, mode);
    setDraft("");
    setTested(null);
  };

  const onTest = async () => {
    if (!client) return;
    setIsTesting(true);
    setTested(null);
    try {
      const result = await testConnection(client);
      setConnection(result);
      setTested(result.state === "authenticated" ? "ok" : "failed");
    } finally {
      setIsTesting(false);
    }
  };

  return (
    <section aria-labelledby={`${fieldId}-heading`}>
      <h2 id={`${fieldId}-heading`}>{messages.token.heading}</h2>

      <form onSubmit={onSubmit}>
        <label htmlFor={fieldId}>{messages.token.label}</label>
        <input
          id={fieldId}
          type="password"
          autoComplete="off"
          spellCheck={false}
          value={draft}
          placeholder={messages.token.placeholder}
          onChange={(event) => setDraft(event.target.value)}
        />
        <button type="submit" disabled={draft.trim() === ""}>
          {messages.token.save}
        </button>
      </form>

      <div>
        <input
          id={rememberId}
          type="checkbox"
          checked={mode === "local"}
          onChange={(event) => setMode(event.target.checked ? "local" : "session")}
        />
        <label htmlFor={rememberId}>{messages.token.remember}</label>
        <p>{messages.token.rememberHint}</p>
      </div>

      <p>{messages.token.guidance}</p>
      <a href={CREATE_TOKEN_URL} target="_blank" rel="noreferrer noopener">
        {messages.token.createLink}
      </a>

      <p>
        {token === null ? (
          messages.token.notSet
        ) : (
          <>
            <button type="button" onClick={() => void onTest()} disabled={isTesting}>
              {isTesting ? messages.token.testing : messages.token.test}
            </button>
            <button type="button" onClick={clearToken}>
              {messages.token.clear}
            </button>
          </>
        )}
      </p>

      {connection?.state === "authenticated" && (
        <p>
          {/* The avatar is decorative: the login next to it carries the meaning. */}
          {connection.user.avatarUrl && (
            <img src={connection.user.avatarUrl} alt="" width={20} height={20} />
          )}
          {messages.token.signedInAs} {connection.user.login}
        </p>
      )}

      {/* The answer to the button, stated as a result rather than left to be
          inferred from a line that was already there. */}
      {tested === "ok" && connection?.state === "authenticated" && (
        <p role="status">
          {messages.token.testPassed} {connection.user.login}. {messages.token.repositoryScope}
        </p>
      )}
      {/* A rejected token is worth reporting whether or not the button was
          pressed, since the automatic check finds it first. */}
      {connection?.state === "invalid-token" && (
        <p role="alert">
          {messages.token.connectionFailed} {connection.error.message}
        </p>
      )}
    </section>
  );
}
