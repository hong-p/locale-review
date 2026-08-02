import { createStorageSlot } from "../../storage/safeStorage";
import {
  matchTranslationPath,
  type TranslationLayoutKind,
  type TranslationLayoutSettings,
} from "./translationLayout";

/**
 * The layout rules themselves, as the user set them (plan.md 4.2, 4.3, 5.3).
 *
 * `translationLayout.ts` answers "given these rules, where does the source file
 * live?". This module owns the rules: what the user typed, how it is cleaned
 * up, and how it survives a reload. Keeping it free of React is what lets the
 * normalizing and the example below be tested as plain functions.
 */

export const LAYOUT_KINDS = ["locale-directory", "filename-suffix"] as const;

export type TranslationSettings = {
  /**
   * The layouts to detect, never empty. plan.md 4.2 allows one pull request to
   * mix both conventions, so this is a list rather than a single choice; the
   * first entry is the one a rule-independent question falls back to.
   */
  layouts: TranslationLayoutKind[];
  /** The directory translations live under. Empty means the whole repository. */
  contentRoot: string;
  /** Extensions including the leading dot, lower-cased. */
  extensions: string[];
  sourceLocale: string;
  /** Filename-suffix layouts only: whether the source file carries the suffix. */
  sourceHasSuffix: boolean;
  /**
   * plan.md 4.3's preferred target locales. They also widen locale detection:
   * a configured locale counts even when it does not look like a BCP 47 tag.
   */
  preferredLocales: string[];
};

export const DEFAULT_TRANSLATION_SETTINGS: TranslationSettings = {
  layouts: ["locale-directory"],
  contentRoot: "content",
  extensions: [".md"],
  sourceLocale: "en",
  sourceHasSuffix: true,
  preferredLocales: ["ko"],
};

function isLayoutKind(value: unknown): value is TranslationLayoutKind {
  return LAYOUT_KINDS.some((kind) => kind === value);
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((entry) => typeof entry === "string");
}

/**
 * plan.md 3.8: a stored value is only used when it still describes settings the
 * app can act on. A layout list that lost its last entry, or an extension list
 * that lost its last extension, would match nothing at all, so it is rejected
 * here and the caller falls back to the defaults rather than showing an empty
 * pull request.
 */
export function isTranslationSettings(value: unknown): value is TranslationSettings {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Record<string, unknown>;

  return (
    Array.isArray(candidate.layouts) &&
    candidate.layouts.length > 0 &&
    candidate.layouts.every(isLayoutKind) &&
    typeof candidate.contentRoot === "string" &&
    isStringArray(candidate.extensions) &&
    candidate.extensions.length > 0 &&
    typeof candidate.sourceLocale === "string" &&
    candidate.sourceLocale.trim() !== "" &&
    typeof candidate.sourceHasSuffix === "boolean" &&
    isStringArray(candidate.preferredLocales)
  );
}

export const translationSettingsSlot = createStorageSlot<TranslationSettings>({
  key: "locale-review.translation-settings",
  kind: "local",
  version: 1,
  fallback: DEFAULT_TRANSLATION_SETTINGS,
  parse: isTranslationSettings,
});

/** `/content//ko/` and ` content/ko ` are the same path typed carelessly. */
export function normalizeContentRoot(input: string): string {
  return input
    .split("/")
    .map((segment) => segment.trim())
    .filter((segment) => segment !== "")
    .join("/");
}

function uniqueBy<T>(values: readonly T[], key: (value: T) => string): T[] {
  const seen = new Set<string>();
  const result: T[] = [];
  for (const value of values) {
    const id = key(value);
    if (seen.has(id)) continue;
    seen.add(id);
    result.push(value);
  }
  return result;
}

/**
 * `md, .mdx` and `.MD .mdx` both mean the same two extensions.
 *
 * The dot is added rather than demanded because a list of extensions is the one
 * place people leave it out, and a missing dot would silently match nothing.
 */
export function parseExtensionList(input: string): string[] {
  const tokens = input
    .split(/[,\s]+/)
    .map((token) => token.trim().toLowerCase())
    .filter((token) => token !== "" && token !== ".")
    .map((token) => (token.startsWith(".") ? token : `.${token}`));

  return uniqueBy(tokens, (token) => token);
}

export function formatExtensionList(extensions: readonly string[]): string {
  return extensions.join(", ");
}

/**
 * Locale tags are not validated against a registry here. plan.md 4.4 requires
 * that an unusual locale still works, and a configured locale is exactly how a
 * reviewer tells the app about one.
 */
export function parseLocaleList(input: string): string[] {
  const tokens = input
    .split(/[,\s]+/)
    .map((token) => token.trim())
    .filter((token) => token !== "");

  return uniqueBy(tokens, (token) => token.toLowerCase());
}

export function formatLocaleList(locales: readonly string[]): string {
  return locales.join(", ");
}

/**
 * Brings a set of settings into the shape the matcher expects, replacing
 * anything emptied out with its default. An empty content root is kept: it is a
 * real answer, meaning translations are not under a directory of their own.
 */
export function normalizeSettings(input: TranslationSettings): TranslationSettings {
  // Filtered through the canonical order so the stored list cannot depend on
  // the order the checkboxes were clicked in.
  const layouts = LAYOUT_KINDS.filter((kind) => input.layouts.includes(kind));
  const extensions = parseExtensionList(formatExtensionList(input.extensions));
  const sourceLocale = input.sourceLocale.trim();

  return {
    layouts: layouts.length > 0 ? layouts : DEFAULT_TRANSLATION_SETTINGS.layouts,
    contentRoot: normalizeContentRoot(input.contentRoot),
    extensions: extensions.length > 0 ? extensions : DEFAULT_TRANSLATION_SETTINGS.extensions,
    sourceLocale: sourceLocale === "" ? DEFAULT_TRANSLATION_SETTINGS.sourceLocale : sourceLocale,
    sourceHasSuffix: input.sourceHasSuffix,
    preferredLocales: parseLocaleList(formatLocaleList(input.preferredLocales)),
  };
}

/** The matcher's view of these settings (plan.md 4.2). */
export function toLayoutSettings(settings: TranslationSettings): TranslationLayoutSettings {
  return {
    kind: settings.layouts[0],
    contentRoot: settings.contentRoot,
    extensions: settings.extensions,
    sourceLocale: settings.sourceLocale,
    sourceHasSuffix: settings.sourceHasSuffix,
  };
}

export type LayoutExample = {
  kind: TranslationLayoutKind;
  targetPath: string;
  /** Null when the settings do not even match the path they describe. */
  sourcePath: string | null;
};

/**
 * A locale to build the example with that is not the source locale, since a
 * file in the source language is never a translation.
 */
function exampleLocale(settings: TranslationSettings): string {
  const candidates = [...settings.preferredLocales, "ko", "en", "xx"];
  const found = candidates.find(
    (locale) => locale.toLowerCase() !== settings.sourceLocale.toLowerCase(),
  );
  return found ?? "xx";
}

/**
 * Worked examples of the current settings, one per active layout.
 *
 * Settings that describe a path convention are hard to check by reading them
 * back. Running the real matcher over a path the settings themselves generate
 * turns "content, .md, en, locale directory" into
 * `content/ko/guide.md → content/en/guide.md`, which is the question the
 * reviewer actually has.
 */
export function layoutExamples(settings: TranslationSettings): LayoutExample[] {
  const locale = exampleLocale(settings);
  const extension = settings.extensions[0] ?? DEFAULT_TRANSLATION_SETTINGS.extensions[0];
  const prefix = settings.contentRoot === "" ? "" : `${settings.contentRoot}/`;
  const layoutSettings = toLayoutSettings(settings);

  return settings.layouts.map((kind) => {
    const targetPath =
      kind === "locale-directory"
        ? `${prefix}${locale}/guide${extension}`
        : `${prefix}guide.${locale}${extension}`;

    const result = matchTranslationPath(targetPath, layoutSettings, {
      activeLayouts: [kind],
      knownLocales: settings.preferredLocales,
    });

    return {
      kind,
      targetPath,
      sourcePath: result.status === "match" ? result.match.sourcePath : null,
    };
  });
}
