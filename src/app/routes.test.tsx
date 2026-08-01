import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ThemeProvider } from "../features/settings/theme";
import { AppRoutes, pullRequestPath } from "./routes";

function renderAt(path: string) {
  return render(
    <ThemeProvider>
      <MemoryRouter initialEntries={[path]}>
        <AppRoutes />
      </MemoryRouter>
    </ThemeProvider>,
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

  it("renders the pull request screen with its route parameters", () => {
    renderAt(pullRequestPath("kubernetes", "website", 123));

    expect(screen.getByText("kubernetes/website #123")).toBeVisible();
  });

  it("shows a not-found screen for an unknown route", () => {
    renderAt("/does/not/exist");

    expect(screen.getByRole("heading", { name: /page not found/i })).toBeVisible();
    expect(screen.getByRole("link", { name: /back to start/i })).toBeVisible();
  });
});
