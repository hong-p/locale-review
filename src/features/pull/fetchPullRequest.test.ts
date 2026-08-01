import { HttpResponse, http } from "msw";
import { describe, expect, it } from "vitest";

import { createGitHubClient } from "../../api/client";
import { server } from "../../test/msw/server";
import { MalformedPullRequestError, fetchPullRequest } from "./fetchPullRequest";

const ORIGIN = "https://api.github.com";
const REF = { owner: "acme", repository: "docs", number: 7 };

const client = () => createGitHubClient({ token: "ghp_test" });

const repo = (fullName: string) => ({
  full_name: fullName,
  name: fullName.split("/")[1],
  owner: { login: fullName.split("/")[0] },
});

type PullOverrides = Record<string, unknown>;

const pullPayload = (overrides: PullOverrides = {}) => ({
  number: 7,
  title: "Translate the install guide",
  state: "open",
  draft: false,
  merged_at: null,
  html_url: "https://github.com/acme/docs/pull/7",
  user: { login: "translator", avatar_url: "https://avatars.test/t.png", html_url: null },
  base: { ref: "main", sha: "base-branch-tip", repo: repo("acme/docs") },
  head: { ref: "ko-install", sha: "head-sha", repo: repo("acme/docs") },
  ...overrides,
});

function mock(pull: Record<string, unknown>, mergeBaseSha: string | null = "merge-base-sha") {
  server.use(
    http.get(`${ORIGIN}/repos/acme/docs/pulls/7`, () => HttpResponse.json(pull)),
    http.get(`${ORIGIN}/repos/acme/docs/compare/:range`, () =>
      HttpResponse.json(mergeBaseSha === null ? {} : { merge_base_commit: { sha: mergeBaseSha } }),
    ),
  );
}

describe("diff base", () => {
  it("uses the Compare API merge base, not pull.base.sha", async () => {
    // plan.md 4.5: base.sha would drag in commits landed on the base branch
    // after the pull request opened.
    mock(pullPayload(), "merge-base-sha");

    const { diffBase } = await fetchPullRequest(client(), REF);

    expect(diffBase.mergeBaseSha).toBe("merge-base-sha");
    expect(diffBase.mergeBaseSha).not.toBe("base-branch-tip");
  });

  it("compares against the head sha rather than the branch name", async () => {
    // A branch name would move if the author pushed while the page loaded.
    let comparedRange = "";
    server.use(
      http.get(`${ORIGIN}/repos/acme/docs/pulls/7`, () => HttpResponse.json(pullPayload())),
      http.get(`${ORIGIN}/repos/acme/docs/compare/:range`, ({ params }) => {
        comparedRange = String(params.range);
        return HttpResponse.json({ merge_base_commit: { sha: "merge-base-sha" } });
      }),
    );

    await fetchPullRequest(client(), REF);

    expect(comparedRange).toContain("head-sha");
  });

  it("fails rather than defaulting when the merge base is missing", async () => {
    // Falling back to head would compare a file with itself and show no diff.
    mock(pullPayload(), null);

    await expect(fetchPullRequest(client(), REF)).rejects.toBeInstanceOf(MalformedPullRequestError);
  });
});

describe("fork pull requests", () => {
  it("keeps the base and head repositories as separate identifiers", async () => {
    mock(
      pullPayload({
        head: { ref: "ko", sha: "head-sha", repo: repo("contributor/docs") },
      }),
    );

    const { summary, diffBase } = await fetchPullRequest(client(), REF);

    expect(summary.baseRepository.fullName).toBe("acme/docs");
    expect(summary.headRepository?.fullName).toBe("contributor/docs");
    expect(diffBase.baseRepositoryFullName).toBe("acme/docs");
    expect(diffBase.headRepositoryFullName).toBe("contributor/docs");
  });

  it("reports a deleted fork as a null head repository rather than failing", async () => {
    // plan.md 4.5 treats this as supported, with a fallback chain in phase 2.
    mock(pullPayload({ head: { ref: "ko", sha: "head-sha", repo: null } }));

    const { summary, diffBase } = await fetchPullRequest(client(), REF);

    expect(summary.headRepository).toBeNull();
    expect(diffBase.headRepositoryFullName).toBeNull();
    // The head sha still resolves through the base repository.
    expect(diffBase.headSha).toBe("head-sha");
  });

  it("reads the merge base from the base repository even for a fork", async () => {
    let comparePath = "";
    server.use(
      http.get(`${ORIGIN}/repos/acme/docs/pulls/7`, () =>
        HttpResponse.json(
          pullPayload({ head: { ref: "ko", sha: "head-sha", repo: repo("contributor/docs") } }),
        ),
      ),
      http.get(`${ORIGIN}/repos/:owner/:repo/compare/:range`, ({ request }) => {
        comparePath = new URL(request.url).pathname;
        return HttpResponse.json({ merge_base_commit: { sha: "merge-base-sha" } });
      }),
    );

    await fetchPullRequest(client(), REF);

    expect(comparePath).toContain("/repos/acme/docs/compare/");
  });
});

describe("summary", () => {
  it("maps the fields the header renders", async () => {
    mock(pullPayload());

    const { summary } = await fetchPullRequest(client(), REF);

    expect(summary).toMatchObject({
      number: 7,
      title: "Translate the install guide",
      baseRef: "main",
      headRef: "ko-install",
      headSha: "head-sha",
      state: "open",
      isDraft: false,
      htmlUrl: "https://github.com/acme/docs/pull/7",
    });
    expect(summary.author?.login).toBe("translator");
  });

  it("distinguishes merged from closed", async () => {
    mock(pullPayload({ state: "closed", merged_at: "2026-01-01T00:00:00Z" }));
    expect((await fetchPullRequest(client(), REF)).summary.state).toBe("merged");

    mock(pullPayload({ state: "closed", merged_at: null }));
    expect((await fetchPullRequest(client(), REF)).summary.state).toBe("closed");
  });

  it("marks a draft", async () => {
    mock(pullPayload({ draft: true }));
    expect((await fetchPullRequest(client(), REF)).summary.isDraft).toBe(true);
  });

  it("tolerates a deleted author account", async () => {
    mock(pullPayload({ user: null }));
    expect((await fetchPullRequest(client(), REF)).summary.author).toBeNull();
  });

  it("falls back to a derived html url when GitHub omits one", async () => {
    mock(pullPayload({ html_url: null }));
    expect((await fetchPullRequest(client(), REF)).summary.htmlUrl).toBe(
      "https://github.com/acme/docs/pull/7",
    );
  });
});

describe("malformed payloads", () => {
  const missing: Array<[string, PullOverrides]> = [
    ["base repository", { base: { ref: "main", sha: "x", repo: null } }],
    ["base ref", { base: { ref: null, sha: "x", repo: repo("acme/docs") } }],
    ["head ref", { head: { ref: null, sha: "x", repo: repo("acme/docs") } }],
    ["head sha", { head: { ref: "ko", sha: null, repo: repo("acme/docs") } }],
  ];

  for (const [label, override] of missing) {
    it(`fails when ${label} is missing`, async () => {
      mock(pullPayload(override));
      await expect(fetchPullRequest(client(), REF)).rejects.toBeInstanceOf(
        MalformedPullRequestError,
      );
    });
  }
});
