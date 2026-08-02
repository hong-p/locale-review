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
import { OpenPullRequestField } from "../../features/pull/OpenPullRequestField";
import { RefreshBanner } from "../../features/pull/RefreshBanner";
import { usePullRequest } from "../../features/pull/usePullRequest";
import { messages } from "../../messages/en";
import { ReviewPopover } from "../../features/comments/ReviewPopover";
import { useCommentActions } from "../../features/comments/useReviewComments";
import shell from "../AppShell.module.css";
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

  const [reviewOpen, setReviewOpen] = useState(false);
  /**
   * Locales the filter is hiding, reported upward by the browser so the review
   * form in the header can warn about them (plan.md 4.3).
   */
  const [unreviewed, setUnreviewed] = useState<readonly string[]>([]);

  // Created here rather than inside the browser: the review form lives in the
  // header, so both surfaces need the same actions and neither should hand
  // functions to the other.
  const actions = useCommentActions(ref, data.summary.headSha, viewerLogin, canWrite);

  return (
    <div className={shell.shell}>
      <PullRequestHeader
        summary={data.summary}
        onClose={onClose}
        onOpenReview={() => setReviewOpen(true)}
        refresh={
          <RefreshBanner
            pullRequestRef={ref}
            current={{ headSha: data.summary.headSha, reviewMarker: "" }}
            hasUnsentWork={reviewBody.trim() !== ""}
          />
        }
      />

      <TranslationFileBrowser
        pullRequestRef={ref}
        diffBase={data.diffBase}
        canWrite={canWrite}
        actions={actions}
        readOnlyNotice={false}
        onLocaleScopeChange={setUnreviewed}
      />

      <ReviewPopover
        open={reviewOpen}
        onClose={() => setReviewOpen(false)}
        canSubmit={canWrite}
        isBusy={actions.isBusy}
        unreviewedLocales={unreviewed}
        pendingCommentCount={0}
        body={reviewBody}
        onBodyChange={setReviewBody}
        onSubmit={async (event, body) => {
          await actions.submit(event, body);
          // plan.md 4.9: the form clears only once GitHub confirmed.
          setReviewBody("");
          setReviewOpen(false);
        }}
      />
    </div>
  );
}

function PullRequestHeader({
  summary,
  onClose,
  onOpenReview,
  refresh,
}: {
  summary: PullRequestSummary;
  onClose: () => void;
  onOpenReview: () => void;
  refresh: React.ReactNode;
}) {
  return (
    <header className={shell.header}>
      <div className={shell.identity}>
        <p className={shell.repository}>{summary.baseRepository.fullName}</p>
        <h1 className={shell.title}>
          {summary.title} <span className={shell.number}>#{summary.number}</span>
        </h1>
      </div>

      <div className={shell.meta}>
        {/* plan.md 7 forbids conveying state by colour alone, so it is a word. */}
        <StateBadge summary={summary} />
        <span>{summary.author?.login ?? messages.pullRequest.authorUnknown}</span>
        <span className={shell.branches}>
          {summary.baseRef} ← {summary.headRef}
        </span>
      </div>

      <div className={shell.headerActions}>
        {/* Switching pull requests without going back to the start screen. */}
        <OpenPullRequestField variant="compact" />
        {refresh}
        <a href={summary.htmlUrl} target="_blank" rel="noreferrer noopener">
          {messages.pullRequest.openOnGitHub}
        </a>
        <button type="button" onClick={onOpenReview}>
          {messages.review.open}
        </button>
        <button type="button" onClick={onClose}>
          {messages.pullRequest.close}
        </button>
      </div>
    </header>
  );
}

function StateBadge({ summary }: { summary: PullRequestSummary }) {
  const state = summary.isDraft ? "draft" : summary.state;
  return <span className={`${shell.badge} ${shell[state] ?? ""}`}>{stateLabel(summary)}</span>;
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
