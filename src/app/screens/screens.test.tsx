import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { HttpResponse, http } from "msw";
import { MemoryRouter, Route, Routes } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { TokenProvider } from "../../features/auth/TokenContext";
import { ThemeProvider } from "../../features/settings/theme";
import { server } from "../../test/msw/server";
import { ROUTE_PULL_REQUEST, ROUTE_START } from "../routes";
import { PullRequestScreen } from "./PullRequestScreen";
import { StartScreen } from "./StartScreen";

const ORIGIN = "https://api.github.com";
const PR_PATH = "/github/acme/docs/pull/7";

function renderApp(initialPath: string) {
  const queryClient = new QueryClient({
    defaultOptions: {
      // The hook decides its own retry policy, so the test keeps that path but
      // removes the backoff wait, which otherwise outlasts findBy's timeout.
      queries: { retryDelay: 0, gcTime: 0 },
      mutations: { retry: false },
    },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <TokenProvider>
          <MemoryRouter initialEntries={[initialPath]}>
            <Routes>
              <Route path={ROUTE_START} element={<StartScreen />} />
              <Route path={ROUTE_PULL_REQUEST} element={<PullRequestScreen />} />
            </Routes>
          </MemoryRouter>
        </TokenProvider>
      </ThemeProvider>
    </QueryClientProvider>,
  );
}

/** Puts a token in place the way the panel would, before anything renders. */
function seedToken(value = "ghp_test") {
  window.sessionStorage.setItem("locale-review.token", JSON.stringify({ version: 1, value }));
}

const pullPayload = {
  number: 7,
  title: "Translate the install guide",
  state: "open",
  draft: false,
  merged_at: null,
  html_url: "https://github.com/acme/docs/pull/7",
  user: { login: "translator", avatar_url: null, html_url: null },
  base: { ref: "main", sha: "base-tip", repo: { full_name: "acme/docs" } },
  head: { ref: "ko-install", sha: "head-sha", repo: { full_name: "acme/docs" } },
};

function mockPullRequest(status = 200, body: Record<string, unknown> = pullPayload) {
  server.use(
    http.get(`${ORIGIN}/repos/acme/docs/pulls/7`, () => HttpResponse.json(body, { status })),
    http.get(`${ORIGIN}/repos/acme/docs/compare/:range`, () =>
      HttpResponse.json({ merge_base_commit: { sha: "merge-base-sha" } }),
    ),
  );
}

beforeEach(() => {
  window.localStorage.clear();
  window.sessionStorage.clear();
  vi.stubGlobal(
    "matchMedia",
    vi.fn(() => ({ matches: false, addEventListener: () => {}, removeEventListener: () => {} })),
  );
});

describe("StartScreen without a token", () => {
  it("refuses to open a pull request and says a token is required", async () => {
    // plan.md 4.1: no request may start before a token exists.
    const user = userEvent.setup();
    let requested = false;
    server.use(
      http.get(`${ORIGIN}/repos/acme/docs/pulls/7`, () => {
        requested = true;
        return HttpResponse.json(pullPayload);
      }),
    );

    renderApp(ROUTE_START);
    await user.type(
      screen.getByLabelText(/pull request url/i),
      "https://github.com/acme/docs/pull/7",
    );
    await user.click(screen.getByRole("button", { name: /open pull request/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/token is required/i);
    expect(requested).toBe(false);
  });

  it("rejects an invalid URL before spending a request", async () => {
    const user = userEvent.setup();
    seedToken();

    renderApp(ROUTE_START);
    await user.type(screen.getByLabelText(/pull request url/i), "https://gitlab.com/a/b/pull/1");
    await user.click(screen.getByRole("button", { name: /open pull request/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/owner\/repository\/pull/i);
  });

  it("navigates to the pull request route for a valid URL", async () => {
    const user = userEvent.setup();
    seedToken();
    mockPullRequest();

    renderApp(ROUTE_START);
    await user.type(
      screen.getByLabelText(/pull request url/i),
      "https://github.com/acme/docs/pull/7/files",
    );
    await user.click(screen.getByRole("button", { name: /open pull request/i }));

    expect(await screen.findByText(/translate the install guide/i)).toBeVisible();
  });
});

describe("token panel", () => {
  it("never renders a stored token back into the field", () => {
    seedToken("ghp_secret");

    renderApp(ROUTE_START);

    // Putting it back in the DOM would expose it to screenshots and the
    // accessibility tree for no benefit.
    expect(screen.getByLabelText(/personal access token/i)).toHaveValue("");
    expect(document.body.textContent).not.toContain("ghp_secret");
  });

  it("reports a rejected token without claiming success", async () => {
    const user = userEvent.setup();
    seedToken();
    server.use(http.get(`${ORIGIN}/user`, () => HttpResponse.json({}, { status: 401 })));

    renderApp(ROUTE_START);
    await user.click(screen.getByRole("button", { name: /test connection/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/could not be used/i);
  });

  it("shows the authenticated login without waiting for a button press", async () => {
    // The app resolves the account as soon as a token exists, because the
    // review flow needs the login (plan.md 4.9).
    seedToken();
    server.use(http.get(`${ORIGIN}/user`, () => HttpResponse.json({ login: "translator" })));

    renderApp(ROUTE_START);

    expect(await screen.findByText(/signed in as/i)).toHaveTextContent("translator");
  });

  it("answers the Test connection button with an explicit result", async () => {
    // The signed-in line is already on screen, so without its own result the
    // button appeared to do nothing at all.
    const user = userEvent.setup();
    seedToken();
    server.use(http.get(`${ORIGIN}/user`, () => HttpResponse.json({ login: "translator" })));

    renderApp(ROUTE_START);
    await screen.findByText(/signed in as/i);
    expect(screen.queryByText(/connection verified/i)).toBeNull();

    await user.click(screen.getByRole("button", { name: /test connection/i }));

    expect(await screen.findByText(/connection verified/i)).toHaveTextContent("translator");
  });

  it("offers no test or clear action when no token is set", () => {
    renderApp(ROUTE_START);

    expect(screen.queryByRole("button", { name: /test connection/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /clear token/i })).toBeNull();
    expect(screen.getByText(/no token set/i)).toBeVisible();
  });

  it("moves the token between stores when remember is toggled", async () => {
    const user = userEvent.setup();
    seedToken("ghp_move_me");
    renderApp(ROUTE_START);

    await user.click(screen.getByLabelText(/remember token on this device/i));

    await waitFor(() => {
      expect(window.localStorage.getItem("locale-review.token")).not.toBeNull();
    });
    // plan.md 5.2: the previous copy must not survive the switch.
    expect(window.sessionStorage.getItem("locale-review.token")).toBeNull();
  });
});

describe("PullRequestScreen", () => {
  it("renders the header once the pull request loads", async () => {
    seedToken();
    mockPullRequest();

    renderApp(PR_PATH);

    expect(
      await screen.findByRole("heading", { name: /translate the install guide/i }),
    ).toBeVisible();
    expect(screen.getByText("acme/docs")).toBeVisible();
    expect(screen.getByText(/main ← ko-install/)).toBeVisible();
    expect(screen.getByText("translator", { exact: false })).toBeVisible();
    // plan.md 7: state is a word, not colour alone. It is a badge in the
    // header now rather than a paragraph.
    expect(screen.getByText("Open", { selector: "span" })).toBeVisible();
  });

  it("blocks loading and explains why when there is no token", async () => {
    let requested = false;
    server.use(
      http.get(`${ORIGIN}/repos/acme/docs/pulls/7`, () => {
        requested = true;
        return HttpResponse.json(pullPayload);
      }),
    );

    renderApp(PR_PATH);

    expect(await screen.findByRole("alert")).toHaveTextContent(/token is required/i);
    expect(requested).toBe(false);
  });

  it("rejects a hand-edited route without requesting anything", async () => {
    seedToken();
    renderApp("/github/acme/docs/pull/abc");

    expect(await screen.findByRole("alert")).toHaveTextContent(/not a pull request url/i);
  });

  const failures = [
    { status: 404, pattern: /not found/i },
    // 401 and 403 must not read the same: one says fix the token, the other
    // says the token is fine but cannot reach this repository.
    { status: 401, pattern: /token was rejected/i },
    { status: 403, pattern: /cannot see that repository/i },
    { status: 500, pattern: /unexpected response/i },
  ];

  for (const { status, pattern } of failures) {
    it(`shows a distinct state for ${status}`, async () => {
      seedToken();
      mockPullRequest(status, {});

      renderApp(PR_PATH);

      expect(await screen.findByRole("alert")).toHaveTextContent(pattern);
      expect(screen.getByRole("button", { name: /retry/i })).toBeVisible();
      expect(screen.getByRole("link", { name: /open on github/i })).toBeVisible();
    });
  }

  it("shows the reset time when the rate limit is exhausted", async () => {
    seedToken();
    const resetAt = Math.floor(Date.now() / 1000) + 3600;
    server.use(
      http.get(`${ORIGIN}/repos/acme/docs/pulls/7`, () =>
        HttpResponse.json(
          {},
          {
            status: 403,
            headers: { "x-ratelimit-remaining": "0", "x-ratelimit-reset": String(resetAt) },
          },
        ),
      ),
    );

    renderApp(PR_PATH);

    expect(await screen.findByRole("alert")).toHaveTextContent(/rate limit reached/i);
    expect(screen.getByRole("alert")).toHaveTextContent(/resets at/i);
  });

  it("reports a network failure distinctly from a rejected request", async () => {
    seedToken();
    server.use(http.get(`${ORIGIN}/repos/acme/docs/pulls/7`, () => HttpResponse.error()));

    renderApp(PR_PATH);

    expect(await screen.findByRole("alert")).toHaveTextContent(/could not reach github/i);
  });
});
