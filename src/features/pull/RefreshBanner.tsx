import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";

import type { PullRequestRef } from "../../api/types";
import { messages } from "../../messages/en";
import { useToken } from "../auth/TokenContext";
import { type FreshnessSnapshot, fetchFreshness, hasChanged, onTabVisible } from "./freshness";

/**
 * Manual refresh, and the banner that appears when GitHub moved on
 * (plan.md 4.10).
 *
 * Nothing reloads on its own. The check runs on tab return, and the reviewer
 * decides — plan.md 4.10 forbids replacing data underneath unsent writing.
 */

export type RefreshBannerProps = {
  pullRequestRef: PullRequestRef;
  current: FreshnessSnapshot;
  /** True when a textarea holds text a reload could disturb. */
  hasUnsentWork: boolean;
};

export function RefreshBanner({ pullRequestRef, current, hasUnsentWork }: RefreshBannerProps) {
  const { client } = useToken();
  const queryClient = useQueryClient();
  const [staleSince, setStaleSince] = useState(false);
  const [confirming, setConfirming] = useState(false);

  useEffect(() => {
    if (!client) return;

    // plan.md 4.10: one cheap check on return, never an interval.
    return onTabVisible(() => {
      void fetchFreshness(client, pullRequestRef)
        .then((latest) => {
          if (hasChanged(current, latest)) setStaleSince(true);
        })
        // A failed check is not a change; the banner stays away.
        .catch(() => undefined);
    });
  }, [client, pullRequestRef, current]);

  const reload = () => {
    setStaleSince(false);
    setConfirming(false);
    void queryClient.invalidateQueries();
  };

  const requestReload = () => {
    // plan.md 4.10: warn before a refresh that could disturb unsent text.
    if (hasUnsentWork) {
      setConfirming(true);
      return;
    }
    reload();
  };

  return (
    <div>
      {staleSince && (
        <p role="status">
          {messages.refresh.newChanges}{" "}
          <button type="button" onClick={requestReload}>
            {messages.refresh.reload}
          </button>
        </p>
      )}

      <button type="button" onClick={requestReload}>
        {messages.refresh.refresh}
      </button>

      {confirming && (
        <div role="alert">
          <p>{messages.refresh.unsentWarning}</p>
          <button type="button" onClick={reload}>
            {messages.refresh.reloadAnyway}
          </button>
          <button type="button" onClick={() => setConfirming(false)}>
            {messages.refresh.keepEditing}
          </button>
        </div>
      )}
    </div>
  );
}
