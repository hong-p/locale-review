import { useId } from "react";

import { messages } from "../../messages/en";
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
  /** Only the files the locale filter is showing count towards progress. */
  visiblePaths: readonly string[];
};

export function ViewedToggle({ path, controller, visiblePaths }: ViewedToggleProps) {
  const id = useId();
  const state = controller.states.get(path) ?? "UNVIEWED";
  const isViewed = state === "VIEWED";

  const viewedCount = visiblePaths.filter(
    (candidate) => controller.states.get(candidate) === "VIEWED",
  ).length;

  return (
    <div>
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
      {controller.error !== null && <span role="alert">{messages.viewed.failed}</span>}

      {/* plan.md 4.7: progress counts visible files only, while each file's own
          state stays whatever GitHub reports. */}
      <p>
        {messages.viewed.progress} {viewedCount} / {visiblePaths.length}
      </p>
    </div>
  );
}
