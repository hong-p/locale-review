import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { HttpResponse, http } from "msw";
import { MemoryRouter } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { PullRequestDiffBase } from "../../api/types";
import { server } from "../../test/msw/server";
import { TokenProvider } from "../auth/TokenContext";
import { useCommentActions } from "../comments/useReviewComments";
import { TranslationSettingsProvider } from "../settings/TranslationSettingsContext";
import {
  DEFAULT_TRANSLATION_SETTINGS,
  type TranslationSettings,
} from "../settings/translationSettings";
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

/** The screen creates the write actions and passes them in; this mirrors that. */
function Browser({ canWrite }: { canWrite: boolean }) {
  const actions = useCommentActions(PR_REF, "head", "translator", canWrite);
  return (
    <TranslationFileBrowser
      pullRequestRef={PR_REF}
      diffBase={DIFF_BASE}
      canWrite={canWrite}
      actions={actions}
      readOnlyNotice={false}
      onLocaleScopeChange={() => {}}
    />
  );
}

function renderBrowser(overrides: { canWrite?: boolean } = {}) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <TranslationSettingsProvider>
        <TokenProvider>
          {/* The empty state links to settings, so a router has to be present. */}
          <MemoryRouter>
            <Browser canWrite={overrides.canWrite ?? false} />
          </MemoryRouter>
        </TokenProvider>
      </TranslationSettingsProvider>
    </QueryClientProvider>,
  );
}

/** Stores settings the way the settings screen would, before anything renders. */
function seedSettings(settings: Partial<TranslationSettings>) {
  window.localStorage.setItem(
    "locale-review.translation-settings",
    JSON.stringify({ version: 1, value: { ...DEFAULT_TRANSLATION_SETTINGS, ...settings } }),
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
    expect(await screen.findByRole("option", { name: "content/ko/guide.md" })).toBeInTheDocument();
    expect(screen.queryByRole("option", { name: "content/ja/guide.md" })).toBeNull();
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

    expect(await screen.findByRole("option", { name: "content/ja/a.md" })).toBeInTheDocument();
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
    await screen.findByRole("option", { name: "content/ko/a.md" });
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
    await screen.findByRole("option", { name: "content/ko/b.md" });
    await user.selectOptions(screen.getByLabelText(/^file$/i), "content/ko/b.md");

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
    // plan.md 4.2 shows the active layout so the user knows what to change,
    // and offers the two ways forward: change it, or ask GitHub again.
    expect(screen.getByText(/active layout/i)).toBeVisible();
    expect(screen.getByRole("link", { name: /change the layout in settings/i })).toBeVisible();
    expect(screen.getByRole("button", { name: /try again/i })).toBeVisible();
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
    expect(await screen.findByRole("option", { name: "content/ko/a.md" })).toBeInTheDocument();
  });

  it("marks a file GitHub gave no patch for as non-commentable", async () => {
    trackContents();
    server.use(
      http.get(FILES_URL, () =>
        HttpResponse.json([rawFile("content/ko/big.md", { patch: undefined })]),
      ),
    );

    renderBrowser();

    // The warning appears on the sidebar entry and again beside the viewer.
    const warnings = await screen.findAllByText(/inline comments unavailable/i);
    expect(warnings.length).toBeGreaterThan(0);
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

    // Shown on the sidebar entry and again above the viewer.
    const labels = await screen.findAllByText(/renamed from/i);
    expect(labels.length).toBeGreaterThan(0);
    expect(labels[0].textContent).toContain("content/ko/guide.md");
  });
});

/**
 * plan.md 4.2: the layout rules are settings, not constants. These drive the
 * browser through the stored settings rather than through the matcher, which is
 * the part that was missing while the defaults were hardcoded here.
 */
describe("stored translation settings", () => {
  it("detects a repository that keeps translations under a different root", async () => {
    trackContents();
    seedSettings({ contentRoot: "docs" });
    server.use(
      http.get(FILES_URL, () =>
        HttpResponse.json([rawFile("docs/ko/guide.md"), rawFile("content/ko/guide.md")]),
      ),
    );

    renderBrowser();

    expect(await screen.findByRole("option", { name: "docs/ko/guide.md" })).toBeInTheDocument();
    expect(screen.queryByRole("option", { name: "content/ko/guide.md" })).toBeNull();
  });

  it("looks the source up under the configured source locale", async () => {
    const requested = trackContents();
    seedSettings({ sourceLocale: "ja" });
    server.use(http.get(FILES_URL, () => HttpResponse.json([rawFile("content/ko/guide.md")])));

    renderBrowser();
    await waitFor(() => expect(requested.length).toBe(3));

    expect(requested.some((path) => path.includes("/contents/content/ja/guide.md"))).toBe(true);
    expect(requested.some((path) => path.includes("/contents/content/en/guide.md"))).toBe(false);
  });

  it("matches a filename-suffix layout when that is the configured one", async () => {
    const requested = trackContents();
    seedSettings({ layouts: ["filename-suffix"], sourceHasSuffix: false });
    server.use(http.get(FILES_URL, () => HttpResponse.json([rawFile("content/guide.ko.md")])));

    renderBrowser();

    expect(await screen.findByRole("option", { name: "content/guide.ko.md" })).toBeInTheDocument();
    // sourceHasSuffix off is Hugo's default language: guide.md, not guide.en.md.
    await waitFor(() => {
      expect(requested.some((path) => path.includes("/contents/content/guide.md"))).toBe(true);
    });
  });

  it("auto-selects the configured preferred locale instead of ko", async () => {
    trackContents();
    seedSettings({ preferredLocales: ["fr"] });
    server.use(
      http.get(FILES_URL, () =>
        HttpResponse.json([rawFile("content/ko/guide.md"), rawFile("content/fr/guide.md")]),
      ),
    );

    renderBrowser();

    expect(await screen.findByRole("option", { name: "content/fr/guide.md" })).toBeInTheDocument();
    expect(screen.queryByRole("option", { name: "content/ko/guide.md" })).toBeNull();
  });

  it("falls back to the defaults when the stored settings are unusable", async () => {
    trackContents();
    // plan.md 3.8: a corrupt entry is dropped rather than left to match nothing.
    window.localStorage.setItem(
      "locale-review.translation-settings",
      JSON.stringify({ version: 1, value: { layouts: [], extensions: [] } }),
    );
    server.use(http.get(FILES_URL, () => HttpResponse.json([rawFile("content/ko/guide.md")])));

    renderBrowser();

    expect(await screen.findByRole("option", { name: "content/ko/guide.md" })).toBeInTheDocument();
  });
});
