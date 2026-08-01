import { Link, useNavigate, useParams } from "react-router";

import type { GitHubApiError } from "../../api/errors";
import type { PullRequestSummary } from "../../api/types";
import { useToken } from "../../features/auth/TokenContext";
import { parsePullRequestRouteParams } from "../../features/pull/parsePullRequestUrl";
import { usePullRequest } from "../../features/pull/usePullRequest";
import { messages } from "../../messages/en";
import { ROUTE_START } from "../routes";

/**
 * plan.md 7's pull request header, and every distinct load failure plan.md 4.1
 * requires the app to tell apart.
 */
export function PullRequestScreen() {
  const params = useParams();
  const navigate = useNavigate();
  const { token } = useToken();

  // plan.md 3.3: a hash route is user-editable, so its parameters are
  // re-validated here rather than trusted.
  const parsed = parsePullRequestRouteParams(params);
  const ref = parsed.ok ? parsed.ref : null;
  const { data, error, unknownError, isLoading, refetch } = usePullRequest(ref);

  const close = () => void navigate(ROUTE_START);

  if (!parsed.ok) {
    return (
      <LoadFailure
        title={messages.loadErrors.invalidUrlTitle}
        body={messages.loadErrors.invalidUrlBody}
      />
    );
  }

  // plan.md 4.1: no token means no request was made, and the screen has to say
  // so rather than showing an empty or failed load.
  if (token === null) {
    return (
      <LoadFailure title={messages.token.heading} body={messages.start.tokenRequired}>
        <Link to={ROUTE_START}>{messages.errors.backToStart}</Link>
      </LoadFailure>
    );
  }

  if (isLoading) {
    return (
      <main>
        <p role="status">{messages.pullRequest.loading}</p>
      </main>
    );
  }

  if (error || unknownError) {
    return (
      <LoadFailure {...describeError(error)}>
        <button type="button" onClick={refetch}>
          {messages.pullRequest.retry}
        </button>
        <a
          href={`https://github.com/${parsed.ref.owner}/${parsed.ref.repository}/pull/${parsed.ref.number}`}
          target="_blank"
          rel="noreferrer noopener"
        >
          {messages.pullRequest.openOnGitHub}
        </a>
        <button type="button" onClick={close}>
          {messages.pullRequest.close}
        </button>
      </LoadFailure>
    );
  }

  if (!data) return null;

  return (
    <main>
      <PullRequestHeader summary={data.summary} onClose={close} />
    </main>
  );
}

function PullRequestHeader({
  summary,
  onClose,
}: {
  summary: PullRequestSummary;
  onClose: () => void;
}) {
  return (
    <header>
      <p>{summary.baseRepository.fullName}</p>
      <h1>
        {summary.title} <span>#{summary.number}</span>
      </h1>

      {/* plan.md 7 forbids conveying state by colour alone, so the label is text. */}
      <p>{stateLabel(summary)}</p>

      <p>
        {summary.author?.login ?? messages.pullRequest.authorUnknown}
        {" · "}
        <span>
          {messages.pullRequest.branches}: {summary.baseRef} ← {summary.headRef}
        </span>
      </p>

      <a href={summary.htmlUrl} target="_blank" rel="noreferrer noopener">
        {messages.pullRequest.openOnGitHub}
      </a>
      <button type="button" onClick={onClose}>
        {messages.pullRequest.close}
      </button>
    </header>
  );
}

function stateLabel(summary: PullRequestSummary): string {
  if (summary.isDraft) return messages.pullRequest.draft;
  if (summary.state === "merged") return messages.pullRequest.merged;
  if (summary.state === "closed") return messages.pullRequest.closed;
  return messages.pullRequest.open;
}

/** Maps the normalized error model onto the states plan.md 4.1 enumerates. */
function describeError(error: GitHubApiError | null): { title: string; body: string } {
  switch (error?.code) {
    case "not-found":
      return {
        title: messages.loadErrors.notFoundTitle,
        body: messages.loadErrors.notFoundBody,
      };
    case "permission-denied":
      return {
        title: messages.loadErrors.permissionTitle,
        body: messages.loadErrors.permissionBody,
      };
    case "rate-limited": {
      const resetAt = error.resetAt;
      const suffix =
        resetAt === null
          ? ""
          : ` ${messages.loadErrors.rateLimitResetsAt} ${new Intl.DateTimeFormat(undefined, {
              timeStyle: "short",
              dateStyle: "short",
            }).format(resetAt)}.`;
      return {
        title: messages.loadErrors.rateLimitTitle,
        body: `${messages.loadErrors.rateLimitBody}${suffix}`,
      };
    }
    case "network-failure":
      return {
        title: messages.loadErrors.networkTitle,
        body: messages.loadErrors.networkBody,
      };
    case "invalid-url":
      return {
        title: messages.loadErrors.invalidUrlTitle,
        body: messages.loadErrors.invalidUrlBody,
      };
    default:
      return {
        title: messages.loadErrors.unexpectedTitle,
        body: messages.loadErrors.unexpectedBody,
      };
  }
}

function LoadFailure({
  title,
  body,
  children,
}: {
  title: string;
  body: string;
  children?: React.ReactNode;
}) {
  return (
    <main>
      <div role="alert">
        <h1>{title}</h1>
        <p>{body}</p>
      </div>
      {children}
    </main>
  );
}
