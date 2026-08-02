import { useId } from "react";

import { messages } from "../../messages/en";
import { asGitHubApiError } from "../../api/client";
import styles from "./ViewedToggle.module.css";
import type { ViewedController } from "./useViewedState";

/**
 * The per-file Viewed checkbox and the review progress (plan.md 4.7).
 *
 * Disabled when the token cannot write, with the reason stated rather than the
 * control silently doing nothing.
 */

export type ViewedToggleProps = {
  path: string;
  controller: ViewedController;
};

/** Progress across files lives in the controls strip; this is the one file. */
export function ViewedToggle({ path, controller }: ViewedToggleProps) {
  const id = useId();
  const state = controller.states.get(path) ?? "UNVIEWED";
  const isViewed = state === "VIEWED";

  return (
    <span className={styles.viewed}>
      <input
        id={id}
        type="checkbox"
        checked={isViewed}
        disabled={controller.toggle === null || controller.isMutating}
        onChange={(event) => controller.toggle?.(path, event.target.checked)}
      />
      <label htmlFor={id}>{messages.viewed.label}</label>

      {controller.isMutating && <span role="status">{messages.viewed.updating}</span>}
      {controller.toggle === null && !controller.isLoading && (
        <span>{messages.viewed.unavailable}</span>
      )}
      {controller.error !== null && (
        <span role="alert" className={styles.error}>
          {viewedFailureMessage(controller.error)}
        </span>
      )}
    </span>
  );
}

/** Says which failure it was, since "not accepted" gives nothing to act on. */
function viewedFailureMessage(error: unknown): string {
  const apiError = asGitHubApiError(error);
  if (apiError?.code === "permission-denied") return apiError.message;
  if (apiError?.code === "rate-limited") return apiError.message;
  return messages.viewed.failed;
}
