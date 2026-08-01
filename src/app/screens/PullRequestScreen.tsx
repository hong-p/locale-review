import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router";

import type { GitHubApiError } from "../../api/errors";
import type { PullRequestRef, PullRequestSummary } from "../../api/types";
import type { LoadedPullRequest as LoadedPullRequestData } from "../../features/pull/fetchPullRequest";
import { useToken } from "../../features/auth/TokenContext";
import { checkRepositoryAccess, hasCapability } from "../../features/auth/connection";
import { draftKey, draftSlot } from "../../features/comments/draftStorage";
import { TranslationFileBrowser } from "../../features/files/TranslationFileBrowser";
import { parsePullRequestRouteParams } from "../../features/pull/parsePullRequestUrl";
import { RefreshBanner } from "../../features/pull/RefreshBanner";
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

  return <LoadedPullRequest ref={parsed.ref} data={data} onClose={close} />;
}

/**
 * Everything that needs a loaded pull request.
 *
 * Split out so the hooks below run only once the reference and the diff base
 * exist, rather than being conditionally enabled from the parent.
 */
function LoadedPullRequest({
  ref,
  data,
  onClose,
}: {
  ref: PullRequestRef;
  data: LoadedPullRequestData;
  onClose: () => void;
}) {
  const { client, connection } = useToken();
  const viewerLogin = connection?.state === "authenticated" ? connection.user.login : null;

  // plan.md 4.9: every write surface follows the repository's real permission,
  // not the presence of a token.
  const access = useQuery({
    queryKey: ["repository-access", ref.owner, ref.repository],
    enabled: client !== null,
    queryFn: ({ signal }) => {
      if (!client) throw new Error("repository access ran without a client");
      return checkRepositoryAccess(client, ref.owner, ref.repository, signal);
    },
  });

  const canWrite = hasCapability(access.data ?? null, "review");

  // plan.md 4.10 and 5.3: unsent text survives a reload of this tab.
  const [slot] = useState(() => draftSlot(draftKey(ref.owner, ref.repository, ref.number)));
  const [reviewBody, setReviewBody] = useState(() => slot.read().reviewBody);

  useEffect(() => {
    const stored = slot.read();
    slot.write({ ...stored, reviewBody });
  }, [slot, reviewBody]);

  return (
    <main>
      <PullRequestHeader summary={data.summary} onClose={onClose} />

      {access.data?.state === "accessible" && !canWrite && (
        <p role="status">{messages.pullRequest.readOnlyBody}</p>
      )}

      <RefreshBanner
        pullRequestRef={ref}
        current={{ headSha: data.summary.headSha, reviewMarker: "" }}
        hasUnsentWork={reviewBody.trim() !== ""}
      />

      <TranslationFileBrowser
        pullRequestRef={ref}
        diffBase={data.diffBase}
        canWrite={canWrite}
        viewerLogin={viewerLogin}
        reviewBody={reviewBody}
        onReviewBodyChange={setReviewBody}
      />
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
    // 401 and 403 are both permission-denied, but they point at different
    // fixes: a rejected token versus a token that works and cannot see this
    // repository. Collapsing them sent people to check the repository when the
    // token was the problem.
    case "permission-denied":
      return error.status === 401
        ? {
            title: messages.loadErrors.tokenRejectedTitle,
            body: messages.loadErrors.tokenRejectedBody,
          }
        : {
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
