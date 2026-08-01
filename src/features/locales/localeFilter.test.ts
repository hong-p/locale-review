import { describe, expect, it } from "vitest";

import type { LocaleSummary, TranslationFile } from "../files/translationFileModel";
import {
  filterFilesByLocale,
  hiddenFileCount,
  initialLocaleSelection,
  toggleLocale,
  unreviewedLocales,
} from "./localeFilter";

const summary = (...entries: [string, number][]): LocaleSummary[] =>
  entries.map(([locale, fileCount]) => ({ locale, fileCount }));

/** Only `locale` matters here; the rest is filled to satisfy the model. */
const file = (locale: string, id = `${locale}-file`): TranslationFile => ({
  id,
  locale,
  layout: "locale-directory",
  state: "modified",
  additions: 1,
  deletions: 0,
  before: null,
  after: null,
  source: null,
  previousPath: null,
  canComment: true,
  blobSha: null,
});

describe("initialLocaleSelection", () => {
  it("selects the preferred locales that exist in the pull request", () => {
    const result = initialLocaleSelection(summary(["ko", 3], ["ja", 1]), ["ko"]);

    expect(result).toEqual({ selected: ["ko"], needsChoice: false });
  });

  it("selects several preferred locales when all are present", () => {
    const result = initialLocaleSelection(summary(["ko", 1], ["ja", 1], ["fr", 1]), ["ja", "ko"]);

    expect(result.selected).toEqual(["ko", "ja"]);
    expect(result.needsChoice).toBe(false);
  });

  it("ignores a preferred locale the pull request does not contain", () => {
    const result = initialLocaleSelection(summary(["ko", 2]), ["ko", "de"]);

    expect(result.selected).toEqual(["ko"]);
  });

  it("selects nothing and asks when no preferred locale is present", () => {
    // plan.md 4.3 forbids silently choosing an unrelated locale.
    const result = initialLocaleSelection(summary(["fr", 2], ["de", 1]), ["ko"]);

    expect(result).toEqual({ selected: [], needsChoice: true });
  });

  it("does not ask when the pull request has no translation files at all", () => {
    // That case is "no translation files found", a different message.
    expect(initialLocaleSelection([], ["ko"])).toEqual({ selected: [], needsChoice: false });
  });

  it("matches a preference case-insensitively", () => {
    const result = initialLocaleSelection(summary(["zh-CN", 1]), ["zh-cn"]);

    // The detected spelling wins, since that is what the paths actually use.
    expect(result.selected).toEqual(["zh-CN"]);
  });
});

describe("filterFilesByLocale", () => {
  const files = [file("ko", "a"), file("ko", "b"), file("ja", "c"), file("fr", "d")];

  it("keeps only the selected locales", () => {
    expect(filterFilesByLocale(files, ["ko"]).map((f) => f.id)).toEqual(["a", "b"]);
  });

  it("keeps files from every selected locale", () => {
    expect(filterFilesByLocale(files, ["ja", "fr"]).map((f) => f.id)).toEqual(["c", "d"]);
  });

  it("shows nothing when nothing is selected", () => {
    // An empty selection means the reviewer has not chosen yet, which is not
    // the same as "show me everything".
    expect(filterFilesByLocale(files, [])).toEqual([]);
  });

  it("matches case-insensitively", () => {
    expect(filterFilesByLocale([file("zh-CN")], ["zh-cn"])).toHaveLength(1);
  });
});

describe("hiddenFileCount", () => {
  it("reports how many files the filter is hiding", () => {
    const files = [file("ko", "a"), file("ja", "b"), file("fr", "c")];

    expect(hiddenFileCount(files, ["ko"])).toBe(2);
    expect(hiddenFileCount(files, ["ko", "ja", "fr"])).toBe(0);
    expect(hiddenFileCount(files, [])).toBe(3);
  });
});

describe("unreviewedLocales", () => {
  it("lists the locales a review decision would also cover", () => {
    // plan.md 4.3: Approve applies to the whole pull request.
    expect(unreviewedLocales(summary(["ko", 1], ["ja", 2], ["fr", 1]), ["ko"])).toEqual([
      "ja",
      "fr",
    ]);
  });

  it("is empty when every locale is selected", () => {
    expect(unreviewedLocales(summary(["ko", 1], ["ja", 1]), ["ko", "ja"])).toEqual([]);
  });
});

describe("toggleLocale", () => {
  it("adds a locale that is not selected", () => {
    expect(toggleLocale(["ko"], "ja")).toEqual(["ko", "ja"]);
  });

  it("removes a locale that is selected", () => {
    expect(toggleLocale(["ko", "ja"], "ko")).toEqual(["ja"]);
  });

  it("allows deselecting everything", () => {
    expect(toggleLocale(["ko"], "ko")).toEqual([]);
  });

  it("does not mutate the input", () => {
    const selected = ["ko"];
    toggleLocale(selected, "ja");
    expect(selected).toEqual(["ko"]);
  });
});
