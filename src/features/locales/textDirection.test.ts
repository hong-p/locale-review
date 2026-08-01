import { describe, expect, it } from "vitest";

import { baseLanguage, directionFor, isRtlLocale } from "./textDirection";

describe("baseLanguage", () => {
  it("strips the region and script", () => {
    expect(baseLanguage("zh-CN")).toBe("zh");
    expect(baseLanguage("sr-Latn-RS")).toBe("sr");
    expect(baseLanguage("ko")).toBe("ko");
  });

  it("accepts an underscore separator, which some repositories use", () => {
    expect(baseLanguage("pt_BR")).toBe("pt");
  });
});

describe("isRtlLocale", () => {
  it("recognises the officially verified right-to-left locales", () => {
    // plan.md 4.4's first-release list.
    for (const locale of ["ar", "he", "fa", "ur"]) {
      expect(isRtlLocale(locale), locale).toBe(true);
    }
  });

  it("inherits direction from the base language of a region variant", () => {
    for (const locale of ["ar-EG", "ar-SA", "he-IL", "fa-IR"]) {
      expect(isRtlLocale(locale), locale).toBe(true);
    }
  });

  it("recognises the officially verified left-to-right locales", () => {
    for (const locale of [
      "en",
      "ko",
      "ja",
      "zh-CN",
      "zh-TW",
      "fr",
      "de",
      "es",
      "it",
      "pt-BR",
      "pl",
    ]) {
      expect(isRtlLocale(locale), locale).toBe(false);
    }
  });

  it("defaults an unknown locale to left-to-right rather than rejecting it", () => {
    // plan.md 4.4 forbids restricting locales to an allowlist.
    expect(isRtlLocale("xx")).toBe(false);
    expect(isRtlLocale("mylocale")).toBe(false);
  });

  it("does not throw on a malformed tag", () => {
    for (const value of ["", "!!", "a-b-c-d-e-f", "-"]) {
      expect(() => isRtlLocale(value)).not.toThrow();
    }
  });
});

describe("directionFor", () => {
  it("returns the attribute value the DOM expects", () => {
    expect(directionFor("ar")).toBe("rtl");
    expect(directionFor("ko")).toBe("ltr");
  });
});
