import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { HttpResponse, http } from "msw";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { PullRequestDiffBase } from "../../api/types";
import { server } from "../../test/msw/server";
import { TokenProvider } from "../auth/TokenContext";
import { TranslationFileBrowser } from "./TranslationFileBrowser";

const ORIGIN = "https://api.github.com";
const FILES_URL = `${ORIGIN}/repos/example-org/docs-site/pulls/7/files`;
const PR_REF = { owner: "example-org", repository: "docs-site", number: 7 };

const DIFF_BASE: PullRequestDiffBase = {
  baseRepositoryFullName: "example-org/docs-site",
  headRepositoryFullName: "example-contributor/docs-site",
  mergeBaseSha: "merge-base",
  headSha: "head",
};

const rawFile = (path: string, overrides: Record<string, unknown> = {}) => ({
  filename: path,
  status: "modified",
  additions: 2,
  deletions: 1,
  patch: "@@ -1 +1 @@",
  sha: "blob",
  ...overrides,
});

/** Records every contents request so lazy loading can be asserted directly. */
function trackContents(): string[] {
  const requested: string[] = [];
  server.use(
    http.get(`${ORIGIN}/repos/:owner/:repo/contents/*`, ({ request }) => {
      const url = new URL(request.url);
      requested.push(url.pathname);
      return HttpResponse.text("# 내용");
    }),
  );
  return requested;
}

function renderBrowser() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <TokenProvider>
        <TranslationFileBrowser pullRequestRef={PR_REF} diffBase={DIFF_BASE} />
      </TokenProvider>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  window.localStorage.clear();
  window.sessionStorage.clear();
  window.sessionStorage.setItem(
    "locale-review.token",
    JSON.stringify({ version: 1, value: "ghp_test" }),
  );
  vi.stubGlobal(
    "matchMedia",
    vi.fn(() => ({ matches: false, addEventListener: () => {}, removeEventListener: () => {} })),
  );
});

describe("locale filtering", () => {
  it("auto-selects the preferred locale and hides the rest", async () => {
    trackContents();
    server.use(
      http.get(FILES_URL, () =>
        HttpResponse.json([
          rawFile("content/ko/guide.md"),
          rawFile("content/ja/guide.md"),
          rawFile("content/fr/guide.md"),
        ]),
      ),
    );

    renderBrowser();

    // ko is the default preference from plan.md 4.3.
    expect(await screen.findByRole("button", { name: /content\/ko\/guide\.md/ })).toBeVisible();
    expect(screen.queryByRole("button", { name: /content\/ja\/guide\.md/ })).toBeNull();
    expect(screen.getByText(/files hidden by the locale filter/i)).toHaveTextContent("2");
  });

  it("shows every detected locale with its file count", async () => {
    trackContents();
    server.use(
      http.get(FILES_URL, () =>
        HttpResponse.json([
          rawFile("content/ko/a.md"),
          rawFile("content/ko/b.md"),
          rawFile("content/ja/a.md"),
        ]),
      ),
    );

    renderBrowser();

    expect(await screen.findByRole("checkbox", { name: /ko.*\(2\)/ })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: /ja.*\(1\)/ })).not.toBeChecked();
  });

  it("asks the reviewer to choose when no preferred locale is present", async () => {
    trackContents();
    server.use(
      http.get(FILES_URL, () =>
        HttpResponse.json([rawFile("content/fr/a.md"), rawFile("content/de/a.md")]),
      ),
    );

    renderBrowser();

    // plan.md 4.3 forbids silently selecting an unrelated locale. Matching on
    // the text rather than the role, since the loading indicator is also a
    // status and resolves first.
    expect(await screen.findByText(/no preferred locale/i)).toBeVisible();
    expect(screen.getByRole("checkbox", { name: /fr/ })).not.toBeChecked();
    expect(screen.getByRole("checkbox", { name: /de/ })).not.toBeChecked();
  });

  it("changes the selection for this pull request when a chip is toggled", async () => {
    const user = userEvent.setup();
    trackContents();
    server.use(
      http.get(FILES_URL, () =>
        HttpResponse.json([rawFile("content/ko/a.md"), rawFile("content/ja/a.md")]),
      ),
    );

    renderBrowser();
    await screen.findByRole("checkbox", { name: /ja/ });
    await user.click(screen.getByRole("checkbox", { name: /ja/ }));

    expect(await screen.findByRole("button", { name: /content\/ja\/a\.md/ })).toBeVisible();
  });
});

describe("lazy content loading", () => {
  it("fetches content only for the selected file", async () => {
    // plan.md 4.6: opening a pull request must not fetch every file.
    const requested = trackContents();
    server.use(
      http.get(FILES_URL, () =>
        HttpResponse.json([
          rawFile("content/ko/a.md"),
          rawFile("content/ko/b.md"),
          rawFile("content/ko/c.md"),
        ]),
      ),
    );

    renderBrowser();
    await screen.findByRole("button", { name: /content\/ko\/a\.md/ });
    await waitFor(() => expect(requested.length).toBeGreaterThan(0));

    // Three versions of one file, and nothing from the other two.
    expect(requested.every((path) => !path.includes("/b.md") && !path.includes("/c.md"))).toBe(
      true,
    );
  });

  it("loads the newly selected file's content on selection", async () => {
    const user = userEvent.setup();
    const requested = trackContents();
    server.use(
      http.get(FILES_URL, () =>
        HttpResponse.json([rawFile("content/ko/a.md"), rawFile("content/ko/b.md")]),
      ),
    );

    renderBrowser();
    await user.click(await screen.findByRole("button", { name: /content\/ko\/b\.md/ }));

    await waitFor(() => {
      expect(requested.some((path) => path.includes("/b.md"))).toBe(true);
    });
  });

  it("reads the after version from the fork and the source from the base repository", async () => {
    const requested = trackContents();
    server.use(http.get(FILES_URL, () => HttpResponse.json([rawFile("content/ko/guide.md")])));

    renderBrowser();
    await waitFor(() => expect(requested.length).toBe(3));

    expect(
      requested.some((path) => path.startsWith("/repos/example-contributor/docs-site/contents/")),
    ).toBe(true);
    expect(
      requested.some((path) =>
        path.startsWith("/repos/example-org/docs-site/contents/content/en/"),
      ),
    ).toBe(true);
  });
});

describe("states the reviewer has to be told about", () => {
  it("reports that no changed file is a translation", async () => {
    server.use(
      http.get(FILES_URL, () => HttpResponse.json([rawFile("README.md"), rawFile("src/index.ts")])),
    );

    renderBrowser();

    expect(await screen.findByText(/no translation files found/i)).toBeVisible();
    // plan.md 4.2 shows the active layout so the user knows what to change.
    expect(screen.getByText(/active layout/i)).toBeVisible();
  });

  it("warns that a truncated file list is incomplete", async () => {
    trackContents();
    const many = Array.from({ length: 3000 }, (_, i) => rawFile(`content/ko/f${i}.md`));
    server.use(http.get(FILES_URL, () => HttpResponse.json(many)));

    renderBrowser();

    expect(await screen.findByText(/only the first 3,000/i)).toBeVisible();
  });

  it("flags a file that matches more than one layout rule", async () => {
    trackContents();
    server.use(
      http.get(FILES_URL, () =>
        HttpResponse.json([rawFile("content/ko/a.md"), rawFile("content/ko/guide.ja.md")]),
      ),
    );

    renderBrowser();

    // Only the directory layout is active by default, so the suffix file is
    // simply not a translation rather than ambiguous.
    expect(await screen.findByRole("button", { name: /content\/ko\/a\.md/ })).toBeVisible();
  });

  it("marks a file GitHub gave no patch for as non-commentable", async () => {
    trackContents();
    server.use(
      http.get(FILES_URL, () =>
        HttpResponse.json([rawFile("content/ko/big.md", { patch: undefined })]),
      ),
    );

    renderBrowser();

    expect(await screen.findByText(/inline comments unavailable/i)).toBeVisible();
  });

  it("shows the rename's previous path", async () => {
    trackContents();
    server.use(
      http.get(FILES_URL, () =>
        HttpResponse.json([
          rawFile("content/ko/install.md", {
            status: "renamed",
            previous_filename: "content/ko/guide.md",
          }),
        ]),
      ),
    );

    renderBrowser();

    expect(await screen.findByText(/renamed from/i)).toBeVisible();
    expect(screen.getByText(/content\/ko\/guide\.md/)).toBeVisible();
  });
});
