import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ThemeProvider } from "../../features/settings/theme";
import { TranslationSettingsProvider } from "../../features/settings/TranslationSettingsContext";
import { translationSettingsSlot } from "../../features/settings/translationSettings";
import { SettingsScreen } from "./SettingsScreen";

/**
 * plan.md 4.2 and 4.3's settings form.
 *
 * These drive the form the way a reviewer would, then read the stored settings
 * back, because the value of this screen is entirely in what it persists for
 * the review surface to use.
 */

function renderSettings() {
  return render(
    <ThemeProvider>
      <TranslationSettingsProvider>
        <MemoryRouter>
          <SettingsScreen />
        </MemoryRouter>
      </TranslationSettingsProvider>
    </ThemeProvider>,
  );
}

async function replace(label: RegExp, value: string) {
  const user = userEvent.setup();
  const field = screen.getByLabelText(label);
  await user.clear(field);
  if (value !== "") await user.type(field, value);
}

beforeEach(() => {
  window.localStorage.clear();
  vi.stubGlobal(
    "matchMedia",
    vi.fn(() => ({ matches: false, addEventListener: () => {}, removeEventListener: () => {} })),
  );
});

describe("SettingsScreen", () => {
  it("starts from the defaults", () => {
    renderSettings();

    expect(screen.getByLabelText(/source locale/i)).toHaveValue("en");
    expect(screen.getByLabelText(/content root/i)).toHaveValue("content");
    expect(screen.getByLabelText(/file extensions/i)).toHaveValue(".md");
    expect(screen.getByLabelText(/preferred locales/i)).toHaveValue("ko");
  });

  it("saves a changed content root and source locale", async () => {
    const user = userEvent.setup();
    renderSettings();

    await replace(/content root/i, "docs/i18n");
    await replace(/source locale/i, "ja");
    await user.click(screen.getByRole("button", { name: /save settings/i }));

    expect(await screen.findByRole("status")).toHaveTextContent(/settings saved/i);
    expect(translationSettingsSlot.read()).toMatchObject({
      contentRoot: "docs/i18n",
      sourceLocale: "ja",
    });
  });

  it("cleans up what was typed and shows the stored form back", async () => {
    const user = userEvent.setup();
    renderSettings();

    await replace(/content root/i, "/docs/");
    await replace(/file extensions/i, "md, MDX");
    await user.click(screen.getByRole("button", { name: /save settings/i }));

    expect(screen.getByLabelText(/content root/i)).toHaveValue("docs");
    expect(screen.getByLabelText(/file extensions/i)).toHaveValue(".md, .mdx");
    expect(translationSettingsSlot.read().extensions).toEqual([".md", ".mdx"]);
  });

  it("previews where the source is looked up as the form changes", async () => {
    renderSettings();

    expect(screen.getByText("content/ko/guide.md")).toBeVisible();
    expect(screen.getByText("content/en/guide.md")).toBeVisible();

    // The preview follows the draft, so it answers before anything is saved.
    await replace(/source locale/i, "ja");

    expect(screen.getByText("content/ja/guide.md")).toBeVisible();
  });

  it("keeps at least one layout active", async () => {
    const user = userEvent.setup();
    renderSettings();

    const localeDirectory = screen.getByRole("checkbox", { name: /locale directory/i });
    expect(localeDirectory).toBeChecked();
    // Unchecking the only active layout would detect nothing at all.
    expect(localeDirectory).toBeDisabled();

    await user.click(screen.getByRole("checkbox", { name: /filename suffix/i }));

    expect(localeDirectory).toBeEnabled();
  });

  it("offers the source suffix question only when a filename-suffix layout is on", async () => {
    const user = userEvent.setup();
    renderSettings();

    expect(screen.queryByLabelText(/carry the locale suffix/i)).toBeNull();

    await user.click(screen.getByRole("checkbox", { name: /filename suffix/i }));

    expect(screen.getByLabelText(/carry the locale suffix/i)).toBeChecked();
  });

  it("saves both layouts when both are selected", async () => {
    const user = userEvent.setup();
    renderSettings();

    await user.click(screen.getByRole("checkbox", { name: /filename suffix/i }));
    await user.click(screen.getByRole("button", { name: /save settings/i }));

    expect(translationSettingsSlot.read().layouts).toEqual(["locale-directory", "filename-suffix"]);
  });

  it("restores the defaults and forgets the stored entry", async () => {
    const user = userEvent.setup();
    renderSettings();

    await replace(/content root/i, "docs");
    await user.click(screen.getByRole("button", { name: /save settings/i }));
    expect(translationSettingsSlot.read().contentRoot).toBe("docs");

    await user.click(screen.getByRole("button", { name: /reset to defaults/i }));

    expect(screen.getByLabelText(/content root/i)).toHaveValue("content");
    // Cleared rather than rewritten, so a later change of default is picked up.
    expect(window.localStorage.getItem("locale-review.translation-settings")).toBeNull();
  });

  it("treats an empty content root as the whole repository", async () => {
    const user = userEvent.setup();
    renderSettings();

    await replace(/content root/i, "");
    await user.click(screen.getByRole("button", { name: /save settings/i }));

    expect(translationSettingsSlot.read().contentRoot).toBe("");
    expect(screen.getByText("ko/guide.md")).toBeVisible();
  });

  it("restores an emptied extension list to the default instead of matching nothing", async () => {
    const user = userEvent.setup();
    renderSettings();

    await replace(/file extensions/i, "");
    await user.click(screen.getByRole("button", { name: /save settings/i }));

    expect(translationSettingsSlot.read().extensions).toEqual([".md"]);
  });
});
