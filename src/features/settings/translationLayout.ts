/**
 * Mapping a changed file path to its target locale and its source counterpart
 * (plan.md 4.2).
 *
 * There are exactly two built-in layouts and no user-editable pattern language.
 * plan.md 3.11 forbids adding a glob or regex library, and plan.md 4.2 puts an
 * arbitrary mapping editor out of scope, so this is a small parser over path
 * segments rather than a matcher.
 */

export type TranslationLayoutKind = "locale-directory" | "filename-suffix";

export type TranslationLayoutSettings = {
  kind: TranslationLayoutKind;
  /** The directory translations live under, for example `content`. */
  contentRoot: string;
  /** Extensions including the leading dot, for example `[".md"]`. */
  extensions: string[];
  /** BCP 47 tag of the source language, for example `en`. */
  sourceLocale: string;
  /**
   * Filename-suffix layouts only. When false, the source file carries no locale
   * suffix at all, which is how Hugo names its default language:
   * `guide.ko.md` maps to `guide.md` rather than `guide.en.md`.
   */
  sourceHasSuffix: boolean;
};

export type TranslationFileMatch = {
  /** The changed file's own path, unchanged. */
  targetPath: string;
  /** The locale this file translates into. */
  locale: string;
  /** Where the corresponding source-language file lives. */
  sourcePath: string;
  kind: TranslationLayoutKind;
};

/**
 * A path may satisfy more than one active layout. plan.md 4.2 requires that the
 * user is asked rather than one match being picked silently.
 */
export type TranslationMatchResult =
  | { status: "match"; match: TranslationFileMatch }
  | { status: "ambiguous"; matches: TranslationFileMatch[] }
  | { status: "no-match" };

export const DEFAULT_LAYOUT: TranslationLayoutSettings = {
  kind: "locale-directory",
  contentRoot: "content",
  extensions: [".md"],
  sourceLocale: "en",
  sourceHasSuffix: true,
};

/**
 * A conservative BCP 47 shape: a 2–3 letter language, then optional script and
 * region subtags. It exists to stop an arbitrary filename segment being read as
 * a locale, not to validate a tag against the registry — plan.md 4.4 requires
 * that unusual locales still work.
 */
const BCP47_PATTERN = /^[a-zA-Z]{2,3}(?:-[a-zA-Z]{4})?(?:-(?:[a-zA-Z]{2}|[0-9]{3}))?$/;

export function looksLikeLocaleTag(value: string): boolean {
  return BCP47_PATTERN.test(value);
}

/** Case-insensitive, because a repository may write `zh-cn` or `zh-CN`. */
function sameLocale(a: string, b: string): boolean {
  return a.toLowerCase() === b.toLowerCase();
}

function matchingExtension(path: string, extensions: string[]): string | null {
  for (const extension of extensions) {
    if (extension !== "" && path.toLowerCase().endsWith(extension.toLowerCase())) {
      return path.slice(path.length - extension.length);
    }
  }
  return null;
}

function normalizeRoot(contentRoot: string): string[] {
  return contentRoot.split("/").filter((segment) => segment !== "");
}

function startsWithRoot(segments: string[], root: string[]): boolean {
  if (segments.length <= root.length) return false;
  return root.every((segment, index) => segments[index] === segment);
}

/**
 * `content/{locale}/**` — the locale is the first segment below the root.
 */
function matchLocaleDirectory(
  path: string,
  settings: TranslationLayoutSettings,
  knownLocales: readonly string[],
): TranslationFileMatch | null {
  if (matchingExtension(path, settings.extensions) === null) return null;

  const segments = path.split("/").filter((segment) => segment !== "");
  const root = normalizeRoot(settings.contentRoot);
  if (!startsWithRoot(segments, root)) return null;

  const locale = segments[root.length];
  if (locale === undefined) return null;
  // A file directly under the root has no locale directory of its own.
  if (segments.length < root.length + 2) return null;

  if (!isCandidateLocale(locale, settings, knownLocales)) return null;
  if (sameLocale(locale, settings.sourceLocale)) return null;

  const sourceSegments = [...segments];
  sourceSegments[root.length] = settings.sourceLocale;

  return {
    targetPath: path,
    locale,
    sourcePath: sourceSegments.join("/"),
    kind: "locale-directory",
  };
}

/**
 * `content/guide.{locale}.md` — the locale is the last dotted segment before
 * the extension.
 *
 * plan.md 4.2 forbids guessing an arbitrary segment of a multi-dot filename, so
 * only that final segment is ever considered, and only when it is a configured
 * locale or a plausible BCP 47 tag.
 */
function matchFilenameSuffix(
  path: string,
  settings: TranslationLayoutSettings,
  knownLocales: readonly string[],
): TranslationFileMatch | null {
  const extension = matchingExtension(path, settings.extensions);
  if (extension === null) return null;

  const segments = path.split("/").filter((segment) => segment !== "");
  const root = normalizeRoot(settings.contentRoot);
  if (!startsWithRoot(segments, root)) return null;

  const filename = segments[segments.length - 1];
  const stem = filename.slice(0, filename.length - extension.length);

  const lastDot = stem.lastIndexOf(".");
  if (lastDot <= 0) return null;

  const locale = stem.slice(lastDot + 1);
  const base = stem.slice(0, lastDot);
  if (base === "") return null;

  if (!isCandidateLocale(locale, settings, knownLocales)) return null;
  if (sameLocale(locale, settings.sourceLocale)) return null;

  const sourceFilename = settings.sourceHasSuffix
    ? `${base}.${settings.sourceLocale}${extension}`
    : `${base}${extension}`;

  const sourceSegments = [...segments.slice(0, -1), sourceFilename];

  return {
    targetPath: path,
    locale,
    sourcePath: sourceSegments.join("/"),
    kind: "filename-suffix",
  };
}

/**
 * plan.md 4.2: only a configured locale, or a final segment shaped like a
 * BCP 47 tag, may be treated as a locale. Everything else is part of the name.
 */
function isCandidateLocale(
  value: string,
  settings: TranslationLayoutSettings,
  knownLocales: readonly string[],
): boolean {
  if (value === "") return false;
  if (sameLocale(value, settings.sourceLocale)) return true;
  if (knownLocales.some((locale) => sameLocale(locale, value))) return true;
  return looksLikeLocaleTag(value);
}

/**
 * Matches one changed path against the active layouts.
 *
 * `activeLayouts` is a list because plan.md 4.2 allows a pull request to mix
 * both conventions. `knownLocales` are the locales the user configured, which
 * widen what counts as a locale beyond the BCP 47 shape check.
 */
export function matchTranslationPath(
  path: string,
  settings: TranslationLayoutSettings,
  options: {
    activeLayouts?: readonly TranslationLayoutKind[];
    knownLocales?: readonly string[];
  } = {},
): TranslationMatchResult {
  const active = options.activeLayouts ?? [settings.kind];
  const knownLocales = options.knownLocales ?? [];

  const matches: TranslationFileMatch[] = [];
  for (const kind of active) {
    const match =
      kind === "locale-directory"
        ? matchLocaleDirectory(path, { ...settings, kind }, knownLocales)
        : matchFilenameSuffix(path, { ...settings, kind }, knownLocales);
    if (match) matches.push(match);
  }

  if (matches.length === 0) return { status: "no-match" };
  if (matches.length > 1) return { status: "ambiguous", matches };
  return { status: "match", match: matches[0] };
}
