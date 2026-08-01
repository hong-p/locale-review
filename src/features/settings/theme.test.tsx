import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ThemeProvider, resolveTheme, useTheme } from "./theme";

type MediaListener = (event: MediaQueryListEvent) => void;

let listeners: MediaListener[] = [];
let systemPrefersDark = false;

function mockMatchMedia() {
  vi.stubGlobal(
    "matchMedia",
    vi.fn((query: string) => ({
      matches: query.includes("dark") && systemPrefersDark,
      media: query,
      addEventListener: (_: string, listener: MediaListener) => listeners.push(listener),
      removeEventListener: (_: string, listener: MediaListener) => {
        listeners = listeners.filter((entry) => entry !== listener);
      },
    })),
  );
}

function ThemeProbe() {
  const { preference, resolved } = useTheme();
  return (
    <span data-testid="probe">
      {preference}:{resolved}
    </span>
  );
}

beforeEach(() => {
  listeners = [];
  systemPrefersDark = false;
  window.localStorage.clear();
  document.documentElement.removeAttribute("data-theme");
  mockMatchMedia();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("resolveTheme", () => {
  it("passes an explicit preference through unchanged", () => {
    expect(resolveTheme("light", "dark")).toBe("light");
    expect(resolveTheme("dark", "light")).toBe("dark");
  });

  it("defers to the system theme when the preference is system", () => {
    expect(resolveTheme("system", "dark")).toBe("dark");
    expect(resolveTheme("system", "light")).toBe("light");
  });
});

describe("ThemeProvider", () => {
  it("defaults to system and writes the resolved theme to the root element", () => {
    render(
      <ThemeProvider>
        <ThemeProbe />
      </ThemeProvider>,
    );

    expect(screen.getByTestId("probe")).toHaveTextContent("system:light");
    expect(document.documentElement.dataset.theme).toBe("light");
  });

  it("resolves system to dark when the OS prefers dark", () => {
    systemPrefersDark = true;

    render(
      <ThemeProvider>
        <ThemeProbe />
      </ThemeProvider>,
    );

    expect(document.documentElement.dataset.theme).toBe("dark");
  });

  it("persists an explicit preference and restores it on the next mount", async () => {
    const user = userEvent.setup();

    function Setter() {
      const { setPreference } = useTheme();
      return (
        <button type="button" onClick={() => setPreference("dark")}>
          dark
        </button>
      );
    }

    const first = render(
      <ThemeProvider>
        <Setter />
        <ThemeProbe />
      </ThemeProvider>,
    );
    await user.click(screen.getByRole("button", { name: "dark" }));
    expect(document.documentElement.dataset.theme).toBe("dark");
    first.unmount();

    render(
      <ThemeProvider>
        <ThemeProbe />
      </ThemeProvider>,
    );
    expect(screen.getByTestId("probe")).toHaveTextContent("dark:dark");
  });

  it("follows a live OS theme change while the preference is system", () => {
    render(
      <ThemeProvider>
        <ThemeProbe />
      </ThemeProvider>,
    );
    expect(document.documentElement.dataset.theme).toBe("light");

    // The change originates outside React, so the resulting state update has
    // to be flushed explicitly before asserting.
    act(() => {
      for (const listener of listeners) {
        listener({ matches: true } as MediaQueryListEvent);
      }
    });

    expect(document.documentElement.dataset.theme).toBe("dark");
  });
});
