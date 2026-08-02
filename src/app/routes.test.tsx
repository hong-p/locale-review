import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { TokenProvider } from "../features/auth/TokenContext";
import { ThemeProvider } from "../features/settings/theme";
import { TranslationSettingsProvider } from "../features/settings/TranslationSettingsContext";
import { AppRoutes, pullRequestPath, ROUTE_SETTINGS } from "./routes";

/**
 * Mirrors the provider stack in App.tsx. These tests cover routing only, so no
 * token is seeded: the screens must resolve without one.
 */
function renderAt(path: string) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <TranslationSettingsProvider>
          <TokenProvider>
            <MemoryRouter initialEntries={[path]}>
              <AppRoutes />
            </MemoryRouter>
          </TokenProvider>
        </TranslationSettingsProvider>
      </ThemeProvider>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  window.localStorage.clear();
  vi.stubGlobal(
    "matchMedia",
    vi.fn(() => ({
      matches: false,
      addEventListener: () => {},
      removeEventListener: () => {},
    })),
  );
});

describe("pullRequestPath", () => {
  it("builds the shareable route for a pull request", () => {
    expect(pullRequestPath("kubernetes", "website", 123)).toBe(
      "/github/kubernetes/website/pull/123",
    );
  });
});

describe("AppRoutes", () => {
  it("shows the start screen at the root", () => {
    renderAt("/");

    expect(screen.getByRole("heading", { level: 2, name: /open a pull request/i })).toBeVisible();
  });

  it("resolves the pull request route and stops at the token gate", () => {
    // Reaching the token requirement proves the route matched: an unmatched
    // path would render the not-found screen instead.
    renderAt(pullRequestPath("kubernetes", "website", 123));

    expect(screen.getByRole("alert")).toHaveTextContent(/token is required/i);
    expect(screen.queryByRole("heading", { name: /page not found/i })).toBeNull();
  });

  it("resolves the settings route", () => {
    // plan.md 3.3 gives settings a route of its own so Back behaves like every
    // other screen.
    renderAt(ROUTE_SETTINGS);

    expect(screen.getByRole("heading", { level: 1, name: /^settings$/i })).toBeVisible();
  });

  it("shows a not-found screen for an unknown route", () => {
    renderAt("/does/not/exist");

    expect(screen.getByRole("heading", { name: /page not found/i })).toBeVisible();
    expect(screen.getByRole("link", { name: /back to start/i })).toBeVisible();
  });
});
