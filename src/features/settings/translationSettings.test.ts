import { beforeEach, describe, expect, it } from "vitest";

import { matchTranslationPath } from "./translationLayout";
import {
  DEFAULT_TRANSLATION_SETTINGS,
  formatExtensionList,
  isTranslationSettings,
  layoutExamples,
  normalizeContentRoot,
  normalizeSettings,
  parseExtensionList,
  parseLocaleList,
  toLayoutSettings,
  type TranslationSettings,
  translationSettingsSlot,
} from "./translationSettings";

const STORAGE_KEY = "locale-review.translation-settings";

const settings = (overrides: Partial<TranslationSettings> = {}): TranslationSettings => ({
  ...DEFAULT_TRANSLATION_SETTINGS,
  ...overrides,
});

beforeEach(() => {
  window.localStorage.clear();
});

describe("normalizeContentRoot", () => {
  it("strips the slashes and spaces people type around a path", () => {
    expect(normalizeContentRoot("/content/")).toBe("content");
    expect(normalizeContentRoot(" docs / content ")).toBe("docs/content");
    expect(normalizeContentRoot("content//i18n")).toBe("content/i18n");
  });

  it("keeps an empty root, which means the whole repository", () => {
    expect(normalizeContentRoot("")).toBe("");
    expect(normalizeContentRoot("  /  ")).toBe("");
  });
});

describe("parseExtensionList", () => {
  it("adds the dot people leave out and lower-cases the rest", () => {
    expect(parseExtensionList("md, .MDX")).toEqual([".md", ".mdx"]);
  });

  it("accepts spaces as separators and drops duplicates", () => {
    expect(parseExtensionList(".md .md  markdown")).toEqual([".md", ".markdown"]);
  });

  it("returns nothing for input that names no extension", () => {
    expect(parseExtensionList("  , . ")).toEqual([]);
  });
});

describe("parseLocaleList", () => {
  it("splits on commas and spaces and drops case-insensitive duplicates", () => {
    expect(parseLocaleList("ko, ja  zh-CN, KO")).toEqual(["ko", "ja", "zh-CN"]);
  });

  it("keeps a tag the BCP 47 shape check would reject", () => {
    // plan.md 4.4: configuring a locale is how a reviewer tells the app about
    // one the shape check does not recognise.
    expect(parseLocaleList("sr-Latn-RS, klingon")).toEqual(["sr-Latn-RS", "klingon"]);
  });
});

describe("normalizeSettings", () => {
  it("replaces an emptied field with its default rather than matching nothing", () => {
    const result = normalizeSettings(settings({ layouts: [], extensions: [], sourceLocale: "  " }));

    expect(result.layouts).toEqual(DEFAULT_TRANSLATION_SETTINGS.layouts);
    expect(result.extensions).toEqual(DEFAULT_TRANSLATION_SETTINGS.extensions);
    expect(result.sourceLocale).toBe("en");
  });

  it("stores the layouts in a fixed order, whatever order they were chosen in", () => {
    const result = normalizeSettings(
      settings({ layouts: ["filename-suffix", "locale-directory"] }),
    );

    expect(result.layouts).toEqual(["locale-directory", "filename-suffix"]);
  });

  it("cleans up the root, the extensions, and the locale list", () => {
    const result = normalizeSettings(
      settings({
        contentRoot: "/docs/",
        extensions: ["MD", ".md"],
        preferredLocales: ["ko", "KO", "ja"],
      }),
    );

    expect(result.contentRoot).toBe("docs");
    expect(result.extensions).toEqual([".md"]);
    expect(result.preferredLocales).toEqual(["ko", "ja"]);
  });
});

describe("toLayoutSettings", () => {
  it("hands the matcher the rules the user configured", () => {
    const result = toLayoutSettings(
      settings({ layouts: ["filename-suffix"], contentRoot: "docs", sourceLocale: "ja" }),
    );

    expect(result).toEqual({
      kind: "filename-suffix",
      contentRoot: "docs",
      extensions: [".md"],
      sourceLocale: "ja",
      sourceHasSuffix: true,
    });
  });

  it("finds the source under the configured source locale", () => {
    const result = matchTranslationPath(
      "docs/ko/guide.md",
      toLayoutSettings(settings({ contentRoot: "docs", sourceLocale: "ja" })),
    );

    expect(result.status).toBe("match");
    if (result.status !== "match") return;
    expect(result.match.sourcePath).toBe("docs/ja/guide.md");
  });
});

describe("layoutExamples", () => {
  it("shows the source lookup the current settings produce", () => {
    expect(layoutExamples(DEFAULT_TRANSLATION_SETTINGS)).toEqual([
      {
        kind: "locale-directory",
        targetPath: "content/ko/guide.md",
        sourcePath: "content/en/guide.md",
      },
    ]);
  });

  it("drops the suffix for a source language that carries none", () => {
    const [example] = layoutExamples(
      settings({ layouts: ["filename-suffix"], sourceHasSuffix: false }),
    );

    expect(example.targetPath).toBe("content/guide.ko.md");
    expect(example.sourcePath).toBe("content/guide.md");
  });

  it("builds the example at the repository root when no content root is set", () => {
    const [example] = layoutExamples(settings({ contentRoot: "" }));

    expect(example.targetPath).toBe("ko/guide.md");
    expect(example.sourcePath).toBe("en/guide.md");
  });

  it("never uses the source locale as the example translation", () => {
    const [example] = layoutExamples(settings({ sourceLocale: "ko", preferredLocales: ["ko"] }));

    expect(example.targetPath).not.toContain("/ko/");
    expect(example.sourcePath).toBe("content/ko/guide.md");
  });

  it("covers every active layout", () => {
    const examples = layoutExamples(settings({ layouts: ["locale-directory", "filename-suffix"] }));

    expect(examples.map((example) => example.kind)).toEqual([
      "locale-directory",
      "filename-suffix",
    ]);
  });
});

describe("isTranslationSettings", () => {
  it("accepts the defaults", () => {
    expect(isTranslationSettings(DEFAULT_TRANSLATION_SETTINGS)).toBe(true);
  });

  const rejected: Array<[string, unknown]> = [
    ["a missing object", null],
    ["an unknown layout kind", settings({ layouts: ["glob" as never] })],
    ["no layout at all", settings({ layouts: [] })],
    ["no extension at all", settings({ extensions: [] })],
    ["a blank source locale", settings({ sourceLocale: " " })],
    ["a non-string extension", { ...DEFAULT_TRANSLATION_SETTINGS, extensions: [1] }],
  ];

  for (const [name, value] of rejected) {
    it(`rejects ${name}`, () => {
      expect(isTranslationSettings(value)).toBe(false);
    });
  }
});

describe("translationSettingsSlot", () => {
  it("returns the defaults when nothing is stored", () => {
    expect(translationSettingsSlot.read()).toEqual(DEFAULT_TRANSLATION_SETTINGS);
  });

  it("round-trips saved settings", () => {
    const saved = settings({ contentRoot: "docs", sourceLocale: "ja" });
    translationSettingsSlot.write(saved);

    expect(translationSettingsSlot.read()).toEqual(saved);
  });

  it("drops a stored value that would match nothing", () => {
    // plan.md 3.8: an unusable entry is discarded, not carried forward.
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ version: 1, value: { ...DEFAULT_TRANSLATION_SETTINGS, layouts: [] } }),
    );

    expect(translationSettingsSlot.read()).toEqual(DEFAULT_TRANSLATION_SETTINGS);
    expect(window.localStorage.getItem(STORAGE_KEY)).toBeNull();
  });

  it("drops a value written by a schema version it cannot read", () => {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ version: 99, value: DEFAULT_TRANSLATION_SETTINGS }),
    );

    expect(translationSettingsSlot.read()).toEqual(DEFAULT_TRANSLATION_SETTINGS);
  });
});

describe("formatExtensionList", () => {
  it("round-trips through the parser", () => {
    const extensions = [".md", ".mdx"];

    expect(parseExtensionList(formatExtensionList(extensions))).toEqual(extensions);
  });
});
