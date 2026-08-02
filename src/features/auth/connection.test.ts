import { HttpResponse, http } from "msw";
import { describe, expect, it } from "vitest";

import { createGitHubClient } from "../../api/client";
import { server } from "../../test/msw/server";
import { checkRepositoryAccess, hasCapability, testConnection } from "./connection";

const ORIGIN = "https://api.github.com";
const client = (token: string | null = "ghp_test") => createGitHubClient({ token });

describe("testConnection", () => {
  it("reports the authenticated account", async () => {
    server.use(
      http.get(`${ORIGIN}/user`, () =>
        HttpResponse.json({
          login: "translator",
          avatar_url: "https://avatars.test/t.png",
          html_url: "https://github.com/translator",
        }),
      ),
    );

    const result = await testConnection(client());

    expect(result).toEqual({
      state: "authenticated",
      user: {
        login: "translator",
        avatarUrl: "https://avatars.test/t.png",
        htmlUrl: "https://github.com/translator",
      },
    });
  });

  it("reports a rejected token instead of throwing", async () => {
    server.use(http.get(`${ORIGIN}/user`, () => HttpResponse.json({}, { status: 401 })));

    const result = await testConnection(client());

    expect(result.state).toBe("invalid-token");
    if (result.state !== "invalid-token") return;
    expect(result.error.code).toBe("permission-denied");
  });

  it("reports a network failure as an unusable token rather than a crash", async () => {
    server.use(http.get(`${ORIGIN}/user`, () => HttpResponse.error()));

    const result = await testConnection(client());

    expect(result.state).toBe("invalid-token");
    if (result.state !== "invalid-token") return;
    expect(result.error.code).toBe("network-failure");
  });

  it("does not decide anything from the token's shape", async () => {
    // plan.md 5.1: capability comes from a real request, never from a prefix.
    server.use(http.get(`${ORIGIN}/user`, () => HttpResponse.json({ login: "u" })));

    const classic = await testConnection(client("ghp_looks_classic"));
    const fineGrained = await testConnection(client("github_pat_looks_fine_grained"));
    const nonsense = await testConnection(client("not-a-github-token-at-all"));

    for (const result of [classic, fineGrained, nonsense]) {
      expect(result.state).toBe("authenticated");
    }
  });

  it("tolerates a missing avatar", async () => {
    server.use(http.get(`${ORIGIN}/user`, () => HttpResponse.json({ login: "u" })));

    const result = await testConnection(client());

    expect(result.state).toBe("authenticated");
    if (result.state !== "authenticated") return;
    expect(result.user.avatarUrl).toBeNull();
  });
});

describe("checkRepositoryAccess", () => {
  const mockRepo = (body: Record<string, unknown>, status = 200) => {
    server.use(http.get(`${ORIGIN}/repos/acme/docs`, () => HttpResponse.json(body, { status })));
  };

  it("reports push access when the token has it", async () => {
    mockRepo({ private: false, permissions: { pull: true, push: true, admin: false } });

    const access = await checkRepositoryAccess(client(), "acme", "docs");

    expect(access.state).toBe("accessible");
    if (access.state !== "accessible") return;
    expect(access.canWrite).toBe(true);
    expect(access.capabilities).toEqual(["read", "comment", "review", "viewed"]);
  });

  it("falls back to read only when the token cannot push", async () => {
    // plan.md 5.1: a valid token without write access operates read-only.
    mockRepo({ private: false, permissions: { pull: true, push: false } });

    const access = await checkRepositoryAccess(client(), "acme", "docs");

    expect(access.state).toBe("accessible");
    if (access.state !== "accessible") return;
    // canWrite reports push access, which is worth showing but does not gate
    // the review surface.
    expect(access.canWrite).toBe(false);
    expect(access.capabilities).toEqual(["read", "comment", "review", "viewed"]);
  });

  it("treats maintain and admin as write access", async () => {
    for (const permissions of [{ maintain: true }, { admin: true }]) {
      mockRepo({ permissions });
      const access = await checkRepositoryAccess(client(), "acme", "docs");
      expect(access.state === "accessible" && access.canWrite).toBe(true);
    }
  });

  it("assumes read only when GitHub omits the permissions block", async () => {
    mockRepo({ private: false });

    const access = await checkRepositoryAccess(client(), "acme", "docs");

    expect(access.state === "accessible" && access.canWrite).toBe(false);
  });

  it("reports a private repository", async () => {
    mockRepo({ private: true, permissions: { push: true } });

    const access = await checkRepositoryAccess(client(), "acme", "docs");

    expect(access.state === "accessible" && access.isPrivate).toBe(true);
  });

  it("maps 404 to not-found, which GitHub also uses for no access", async () => {
    mockRepo({}, 404);
    expect((await checkRepositoryAccess(client(), "acme", "docs")).state).toBe("not-found");
  });

  it("maps 403 to forbidden", async () => {
    mockRepo({}, 403);
    expect((await checkRepositoryAccess(client(), "acme", "docs")).state).toBe("forbidden");
  });

  it("keeps an unrelated failure distinct instead of degrading to read only", async () => {
    // plan.md 10: a failure must not be presented as a working read-only state.
    mockRepo({}, 500);

    const access = await checkRepositoryAccess(client(), "acme", "docs");

    expect(access.state).toBe("failed");
    if (access.state !== "failed") return;
    expect(access.error.code).toBe("server-error");
  });

  it("escapes the owner and repository in the path", async () => {
    let path = "";
    server.use(
      http.get(`${ORIGIN}/repos/:owner/:repo`, ({ request }) => {
        path = new URL(request.url).pathname;
        return HttpResponse.json({});
      }),
    );

    await checkRepositoryAccess(client(), "a c", "d/e");

    expect(path).toBe("/repos/a%20c/d%2Fe");
  });
});

describe("hasCapability", () => {
  it("is false for every capability when access is unresolved or failed", () => {
    expect(hasCapability(null, "read")).toBe(false);
    expect(hasCapability({ state: "not-found" }, "read")).toBe(false);
  });

  it("reflects the granted list", () => {
    const readOnly = {
      state: "accessible",
      isPrivate: false,
      canWrite: false,
      capabilities: ["read"],
    } as const;

    expect(hasCapability(readOnly, "read")).toBe(true);
    expect(hasCapability(readOnly, "comment")).toBe(false);
    expect(hasCapability(readOnly, "review")).toBe(false);
    expect(hasCapability(readOnly, "viewed")).toBe(false);
  });
});
