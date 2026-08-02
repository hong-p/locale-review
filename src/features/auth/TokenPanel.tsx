import { type FormEvent, useId, useState } from "react";

import { messages } from "../../messages/en";
import { testConnection } from "./connection";
import styles from "./TokenPanel.module.css";
import { useToken } from "./TokenContext";

const CREATE_FINE_GRAINED_URL = "https://github.com/settings/personal-access-tokens/new";
const CREATE_CLASSIC_URL = "https://github.com/settings/tokens/new?scopes=public_repo";

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
    <section className={styles.panel} aria-labelledby={`${fieldId}-heading`}>
      <h2 id={`${fieldId}-heading`} className={styles.title}>
        {messages.token.heading}
      </h2>

      <form className={styles.form} onSubmit={onSubmit}>
        <label htmlFor={fieldId} className={styles.label}>
          {messages.token.label}
        </label>
        <div className={styles.row}>
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
        </div>
      </form>

      <div className={styles.remember}>
        <input
          id={rememberId}
          type="checkbox"
          checked={mode === "local"}
          onChange={(event) => setMode(event.target.checked ? "local" : "session")}
        />
        <label htmlFor={rememberId}>
          {messages.token.remember}
          <span className={styles.hint}> {messages.token.rememberHint}</span>
        </label>
      </div>

      <p className={styles.guidance}>{messages.token.guidance}</p>
      {/* The distinction that actually decides which token works: a
          fine-grained token cannot write to a repository you do not own, which
          is most of what this app is used for. */}
      <p className={styles.guidance}>{messages.token.guidanceThirdParty}</p>
      <p className={styles.actions}>
        <a href={CREATE_FINE_GRAINED_URL} target="_blank" rel="noreferrer noopener">
          {messages.token.createLink}
        </a>
        <a href={CREATE_CLASSIC_URL} target="_blank" rel="noreferrer noopener">
          {messages.token.createClassicLink}
        </a>
      </p>

      <div className={styles.actions}>
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
      </div>

      {connection?.state === "authenticated" && (
        <p className={styles.status}>
          {/* The avatar is decorative: the login next to it carries the meaning. */}
          {connection.user.avatarUrl && (
            <img
              className={styles.avatar}
              src={connection.user.avatarUrl}
              alt=""
              width={20}
              height={20}
            />
          )}
          {messages.token.signedInAs} {connection.user.login}
        </p>
      )}

      {/* The answer to the button, stated as a result rather than left to be
          inferred from a line that was already there. */}
      {tested === "ok" && connection?.state === "authenticated" && (
        <p role="status" className={`${styles.status} ${styles.ok}`}>
          {messages.token.testPassed} {connection.user.login}. {messages.token.repositoryScope}
        </p>
      )}
      {/* A rejected token is worth reporting whether or not the button was
          pressed, since the automatic check finds it first. */}
      {connection?.state === "invalid-token" && (
        <p role="alert" className={`${styles.status} ${styles.failed}`}>
          {messages.token.connectionFailed} {connection.error.message}
        </p>
      )}
    </section>
  );
}
