import { HttpResponse, http } from "msw";
import { afterEach, describe, expect, it, vi } from "vitest";

import { createGitHubClient } from "../../api/client";
import { server } from "../../test/msw/server";
import { fetchFreshness, hasChanged, onTabVisible } from "./freshness";

const ORIGIN = "https://api.github.com";
const REF = { owner: "example-org", repository: "docs-site", number: 7 };
const client = () => createGitHubClient({ token: "ghp_test" });

const snapshot = (headSha: string, reviewMarker: string) => ({ headSha, reviewMarker });

describe("fetchFreshness", () => {
  it("reads the head sha and the update marker in one request", async () => {
    // plan.md 4.10 asks for a lightweight check, not a full reload.
    let calls = 0;
    server.use(
      http.get(`${ORIGIN}/repos/example-org/docs-site/pulls/7`, () => {
        calls += 1;
        return HttpResponse.json({
          head: { sha: "abc" },
          updated_at: "2026-01-02T00:00:00Z",
        });
      }),
    );

    const result = await fetchFreshness(client(), REF);

    expect(calls).toBe(1);
    expect(result).toEqual({ headSha: "abc", reviewMarker: "2026-01-02T00:00:00Z" });
  });

  it("returns empty fields rather than throwing on an odd payload", async () => {
    server.use(
      http.get(`${ORIGIN}/repos/example-org/docs-site/pulls/7`, () => HttpResponse.json({})),
    );

    expect(await fetchFreshness(client(), REF)).toEqual({ headSha: "", reviewMarker: "" });
  });
});

describe("hasChanged", () => {
  it("detects a new commit", () => {
    expect(hasChanged(snapshot("a", "t1"), snapshot("b", "t1"))).toBe(true);
  });

  it("detects a new or edited review comment", () => {
    expect(hasChanged(snapshot("a", "t1"), snapshot("a", "t2"))).toBe(true);
  });

  it("is false when nothing moved", () => {
    expect(hasChanged(snapshot("a", "t1"), snapshot("a", "t1"))).toBe(false);
  });

  it("treats a failed check as no change rather than prompting a reload", () => {
    // An empty snapshot means the request failed; showing "new changes" then
    // would send the reviewer to reload for nothing.
    expect(hasChanged(snapshot("a", "t1"), snapshot("", ""))).toBe(false);
  });
});

describe("onTabVisible", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  const setVisibility = (state: DocumentVisibilityState) => {
    vi.spyOn(document, "visibilityState", "get").mockReturnValue(state);
    document.dispatchEvent(new Event("visibilitychange"));
  };

  it("runs the check when the tab comes back", () => {
    const check = vi.fn();
    const stop = onTabVisible(check);

    setVisibility("visible");

    expect(check).toHaveBeenCalledTimes(1);
    stop();
  });

  it("does not run when the tab is hidden", () => {
    const check = vi.fn();
    const stop = onTabVisible(check);

    setVisibility("hidden");

    expect(check).not.toHaveBeenCalled();
    stop();
  });

  it("stops listening once torn down", () => {
    const check = vi.fn();
    onTabVisible(check)();

    setVisibility("visible");

    expect(check).not.toHaveBeenCalled();
  });
});
