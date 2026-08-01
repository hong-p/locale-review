import { useParams } from "react-router";

import { messages } from "../../messages/en";

/**
 * Phase 0 proves the shared hash route resolves and its parameters arrive.
 * plan.md 3.3 requires re-validating and normalising these values on entry;
 * that validation lands in Phase 1 with the PR loading flow.
 */
export function PullRequestScreen() {
  const { owner, repo, number } = useParams();

  return (
    <main>
      <h1>{messages.app.name}</h1>
      <p>
        {owner}/{repo} #{number}
      </p>
      <p>{messages.start.tokenRequired}</p>
    </main>
  );
}
