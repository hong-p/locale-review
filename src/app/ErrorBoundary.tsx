import { Component, type ErrorInfo, type ReactNode } from "react";

import { messages } from "../messages/en";

type Props = { children: ReactNode };
type State = { hasError: boolean };

/**
 * plan.md 8 (Phase 0): a render failure must not leave a blank page.
 *
 * The caught error is deliberately not rendered or logged with its message.
 * plan.md 5.2 forbids the token appearing in any log or error text, and an
 * error thrown from a request path can carry request context.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(_error: Error, _info: ErrorInfo): void {
    // Intentionally empty: see the note above on not logging error contents.
  }

  render(): ReactNode {
    if (!this.state.hasError) return this.props.children;

    return (
      <main role="alert">
        <h1>{messages.errors.unexpectedTitle}</h1>
        <p>{messages.errors.unexpectedBody}</p>
        <button type="button" onClick={() => window.location.reload()}>
          {messages.errors.reload}
        </button>
      </main>
    );
  }
}
