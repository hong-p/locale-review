/**
 * Which way a locale's text runs (plan.md 4.4).
 *
 * The browser is asked first, and a small verified list covers engines that do
 * not implement `getTextInfo`. plan.md 4.4 forbids restricting locales to an
 * allowlist, so an unrecognised tag falls through to left-to-right rather than
 * being rejected.
 */

/** plan.md 4.4's officially verified right-to-left locales, plus common kin. */
const RTL_LANGUAGES = new Set(["ar", "he", "fa", "ur", "ps", "sd", "ug", "yi", "dv", "ckb"]);

type LocaleWithTextInfo = Intl.Locale & {
  getTextInfo?: () => { direction?: string };
  textInfo?: { direction?: string };
};

/**
 * The base language of a tag. A region variant inherits its language's
 * direction, so `ar-EG` is right-to-left because `ar` is.
 */
export function baseLanguage(locale: string): string {
  return locale.toLowerCase().split(/[-_]/)[0] ?? "";
}

export function isRtlLocale(locale: string): boolean {
  if (locale === "") return false;

  try {
    const resolved: LocaleWithTextInfo = new Intl.Locale(locale);
    // `getTextInfo` is the current spelling; `textInfo` is the older accessor.
    const info = resolved.getTextInfo?.() ?? resolved.textInfo;
    if (info?.direction === "rtl") return true;
    if (info?.direction === "ltr") return false;
  } catch {
    // An unparseable tag falls through to the list below.
  }

  return RTL_LANGUAGES.has(baseLanguage(locale));
}

export function directionFor(locale: string): "ltr" | "rtl" {
  return isRtlLocale(locale) ? "rtl" : "ltr";
}
