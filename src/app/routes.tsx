import { Link, Route, Routes } from "react-router";

import { messages } from "../messages/en";
import { PullRequestScreen } from "./screens/PullRequestScreen";
import { SettingsScreen } from "./screens/SettingsScreen";
import { StartScreen } from "./screens/StartScreen";

/**
 * plan.md 3.3 route shape. The PR route is namespaced under `/github/` so a
 * future GitHub Enterprise host can occupy a sibling segment without breaking
 * links already shared.
 */
export const ROUTE_START = "/";
export const ROUTE_SETTINGS = "/settings";
export const ROUTE_PULL_REQUEST = "/github/:owner/:repo/pull/:number";

export function pullRequestPath(owner: string, repo: string, number: number | string): string {
  return `/github/${owner}/${repo}/pull/${number}`;
}

function NotFoundScreen() {
  return (
    <main>
      <h1>{messages.errors.notFoundTitle}</h1>
      <p>{messages.errors.notFoundBody}</p>
      <Link to={ROUTE_START}>{messages.errors.backToStart}</Link>
    </main>
  );
}

export function AppRoutes() {
  return (
    <Routes>
      <Route path={ROUTE_START} element={<StartScreen />} />
      <Route path={ROUTE_SETTINGS} element={<SettingsScreen />} />
      <Route path={ROUTE_PULL_REQUEST} element={<PullRequestScreen />} />
      <Route path="*" element={<NotFoundScreen />} />
    </Routes>
  );
}
