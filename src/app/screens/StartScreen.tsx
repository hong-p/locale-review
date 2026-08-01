import { messages } from "../../messages/en";
import { ThemeToggle } from "../ThemeToggle";

/**
 * Phase 0 renders the start screen shell only. URL parsing, validation, and
 * navigation arrive in Phase 1 together with the token flow that plan.md 4.1
 * requires before any pull request may be fetched.
 */
export function StartScreen() {
  return (
    <main>
      <header>
        <h1>{messages.app.name}</h1>
        <p>{messages.app.tagline}</p>
        <ThemeToggle />
      </header>

      <section aria-labelledby="start-heading">
        <h2 id="start-heading">{messages.start.heading}</h2>
        <p>{messages.start.tokenRequired}</p>
      </section>

      <footer>
        <p>{messages.start.privacy}</p>
      </footer>
    </main>
  );
}
