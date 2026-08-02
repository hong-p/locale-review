import { Link } from "react-router";

import { TokenPanel } from "../../features/auth/TokenPanel";
import { useToken } from "../../features/auth/TokenContext";
import { messages } from "../../messages/en";
import { OpenPullRequestField } from "../../features/pull/OpenPullRequestField";
import { ROUTE_SETTINGS } from "../routes";
import { ThemeToggle } from "../ThemeToggle";
import styles from "./StartScreen.module.css";

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

  return (
    <main className={styles.page}>
      <header className={styles.masthead}>
        <div>
          <h1 className={styles.title}>{messages.app.name}</h1>
          <p className={styles.tagline}>{messages.app.tagline}</p>
        </div>
        {/* plan.md 7: the start screen carries the way into settings, which is
            where the translation layout and the source locale are decided. */}
        <div className={styles.mastheadActions}>
          <Link to={ROUTE_SETTINGS}>{messages.settings.open}</Link>
          <ThemeToggle />
        </div>
      </header>

      <section className={styles.card} aria-labelledby="start-heading">
        <h2 id="start-heading" className={styles.cardTitle}>
          {messages.start.heading}
        </h2>

        <OpenPullRequestField variant="full" />
        {token === null && <p className={styles.privacy}>{messages.start.tokenRequired}</p>}
      </section>

      <TokenPanel />

      <footer>
        <p className={styles.privacy}>{messages.start.privacy}</p>
      </footer>
    </main>
  );
}
