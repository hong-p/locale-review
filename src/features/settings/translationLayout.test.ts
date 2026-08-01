import { describe, expect, it } from "vitest";

import {
  DEFAULT_LAYOUT,
  type TranslationLayoutSettings,
  looksLikeLocaleTag,
  matchTranslationPath,
} from "./translationLayout";

const directory: TranslationLayoutSettings = { ...DEFAULT_LAYOUT, kind: "locale-directory" };
const suffix: TranslationLayoutSettings = { ...DEFAULT_LAYOUT, kind: "filename-suffix" };

const expectMatch = (
  path: string,
  settings: TranslationLayoutSettings,
  expected: { locale: string; sourcePath: string },
  options?: Parameters<typeof matchTranslationPath>[2],
) => {
  const result = matchTranslationPath(path, settings, options);
  expect(result.status, `expected ${path} to match`).toBe("match");
  if (result.status !== "match") return;
  expect(result.match.locale).toBe(expected.locale);
  expect(result.match.sourcePath).toBe(expected.sourcePath);
};

const expectNoMatch = (
  path: string,
  settings: TranslationLayoutSettings,
  options?: Parameters<typeof matchTranslationPath>[2],
) => {
  expect(
    matchTranslationPath(path, settings, options).status,
    `expected ${path} not to match`,
  ).toBe("no-match");
};

describe("locale directory layout", () => {
  it("maps a translation to its source by replacing the locale segment", () => {
    expectMatch("content/ko/guide.md", directory, {
      locale: "ko",
      sourcePath: "content/en/guide.md",
    });
  });

  it("keeps nested directories intact", () => {
    expectMatch("content/ja/docs/install/setup.md", directory, {
      locale: "ja",
      sourcePath: "content/en/docs/install/setup.md",
    });
  });

  it("handles a region-qualified locale", () => {
    expectMatch("content/zh-CN/guide.md", directory, {
      locale: "zh-CN",
      sourcePath: "content/en/guide.md",
    });
  });

  it("handles a multi-segment content root", () => {
    const settings = { ...directory, contentRoot: "site/content" };
    expectMatch("site/content/ko/guide.md", settings, {
      locale: "ko",
      sourcePath: "site/content/en/guide.md",
    });
  });

  it("does not treat the source locale as a target", () => {
    // plan.md 4.2: the source locale is never offered as a target filter.
    expectNoMatch("content/en/guide.md", directory);
  });

  it("ignores a path outside the content root", () => {
    expectNoMatch("docs/ko/guide.md", directory);
    expectNoMatch("ko/guide.md", directory);
  });

  it("ignores a file sitting directly in the content root", () => {
    expectNoMatch("content/guide.md", directory);
  });

  it("ignores an unconfigured extension", () => {
    expectNoMatch("content/ko/data.json", directory);
    expectNoMatch("content/ko/image.png", directory);
  });

  it("ignores a directory that is not shaped like a locale", () => {
    expectNoMatch("content/documentation/guide.md", directory);
    expectNoMatch("content/2024/guide.md", directory);
  });

  it("accepts an unusual directory once it is a configured locale", () => {
    // plan.md 4.4 forbids restricting locales to an allowlist, so a configured
    // value wins over the shape check that would otherwise reject it.
    expectNoMatch("content/mylocale/guide.md", directory);
    expectMatch(
      "content/mylocale/guide.md",
      directory,
      { locale: "mylocale", sourcePath: "content/en/guide.md" },
      { knownLocales: ["mylocale"] },
    );
  });
});

describe("filename suffix layout", () => {
  it("maps a suffixed translation to a suffixed source", () => {
    expectMatch("content/guide.ko.md", suffix, {
      locale: "ko",
      sourcePath: "content/guide.en.md",
    });
  });

  it("maps to an unsuffixed source when the default language carries no suffix", () => {
    // plan.md 4.2: Hugo names its default language file without a locale.
    const hugo = { ...suffix, sourceHasSuffix: false };
    expectMatch("content/guide.ko.md", hugo, { locale: "ko", sourcePath: "content/guide.md" });
    expectMatch("content/_index.ko.md", hugo, { locale: "ko", sourcePath: "content/_index.md" });
  });

  it("handles a region-qualified suffix", () => {
    expectMatch("content/guide.ko-KR.md", suffix, {
      locale: "ko-KR",
      sourcePath: "content/guide.en.md",
    });
  });

  it("only ever reads the final dotted segment", () => {
    // plan.md 4.2 forbids guessing an arbitrary segment of a multi-dot name.
    expectMatch("content/release.v2.ko.md", suffix, {
      locale: "ko",
      sourcePath: "content/release.v2.en.md",
    });
    expectMatch("content/guide.min.ko-KR.md", suffix, {
      locale: "ko-KR",
      sourcePath: "content/guide.min.en.md",
    });
  });

  it("ignores a final segment that is not shaped like a locale", () => {
    expectNoMatch("content/release.v2.md", suffix);
    expectNoMatch("content/guide.backup.md", suffix);
    expectNoMatch("content/archive.2024.md", suffix);
  });

  it("ignores a file with no suffix at all", () => {
    expectNoMatch("content/guide.md", suffix);
  });

  it("ignores a dotfile, which has no base name before the dot", () => {
    expectNoMatch("content/.ko.md", suffix);
  });

  it("does not treat the source locale as a target", () => {
    expectNoMatch("content/guide.en.md", suffix);
  });

  it("keeps the directory of a nested file", () => {
    expectMatch("content/docs/install.ja.md", suffix, {
      locale: "ja",
      sourcePath: "content/docs/install.en.md",
    });
  });
});

describe("mixed layouts in one pull request", () => {
  const both = ["locale-directory", "filename-suffix"] as const;

  it("matches each path with whichever layout applies", () => {
    expectMatch(
      "content/ko/guide.md",
      directory,
      { locale: "ko", sourcePath: "content/en/guide.md" },
      { activeLayouts: both },
    );
    expectMatch(
      "content/guide.ja.md",
      directory,
      { locale: "ja", sourcePath: "content/guide.en.md" },
      { activeLayouts: both },
    );
  });

  it("reports a path that both layouts claim, rather than picking one", () => {
    // plan.md 4.2 requires the user to choose when a file is ambiguous.
    const result = matchTranslationPath("content/ko/guide.ja.md", directory, {
      activeLayouts: both,
    });

    expect(result.status).toBe("ambiguous");
    if (result.status !== "ambiguous") return;
    expect(result.matches).toHaveLength(2);
    expect(result.matches.map((m) => m.locale).sort()).toEqual(["ja", "ko"]);
  });
});

describe("looksLikeLocaleTag", () => {
  it("accepts plausible tags", () => {
    for (const tag of ["ko", "en", "ja", "zh-CN", "pt-BR", "fil", "sr-Latn", "es-419"]) {
      expect(looksLikeLocaleTag(tag), tag).toBe(true);
    }
  });

  it("rejects values that are not tags", () => {
    for (const value of ["", "v2", "2024", "backup", "a", "toolongtag", "ko_KR", "ko-"]) {
      expect(looksLikeLocaleTag(value), value).toBe(false);
    }
  });
});

describe("robustness", () => {
  it("never throws on unusual paths", () => {
    const paths = ["", "/", "///", "content/", ".md", "content/ko/", "a".repeat(2000)];
    for (const path of paths) {
      expect(() => matchTranslationPath(path, directory)).not.toThrow();
      expect(() => matchTranslationPath(path, suffix)).not.toThrow();
    }
  });

  it("compares the locale case-insensitively against the source", () => {
    expectNoMatch("content/EN/guide.md", directory);
    expectNoMatch("content/guide.EN.md", suffix);
  });
});
