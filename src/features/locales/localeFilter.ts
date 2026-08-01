import type { LocaleSummary, TranslationFile } from "../files/translationFileModel";

/**
 * Choosing which locales a reviewer is looking at (plan.md 4.3).
 *
 * The rule that shapes this: a preferred locale that is not in the pull request
 * must not cause some unrelated locale to be selected in its place. When
 * nothing preferred is present, the app shows what it found and lets the
 * reviewer choose.
 */

export type LocaleSelection = {
  selected: readonly string[];
  /** True when no preferred locale was present, so nothing was auto-selected. */
  needsChoice: boolean;
};

const sameLocale = (a: string, b: string): boolean => a.toLowerCase() === b.toLowerCase();

/**
 * The initial selection when a pull request opens.
 *
 * Preferred locales that exist in the pull request are selected; the rest are
 * ignored. If none match, nothing is selected and `needsChoice` says why, so
 * the UI can explain rather than silently show an empty file list.
 */
export function initialLocaleSelection(
  detected: readonly LocaleSummary[],
  preferred: readonly string[],
): LocaleSelection {
  const present = detected.map((entry) => entry.locale);
  const selected = present.filter((locale) =>
    preferred.some((candidate) => sameLocale(candidate, locale)),
  );

  if (selected.length > 0) return { selected, needsChoice: false };
  return { selected: [], needsChoice: present.length > 0 };
}

/** plan.md 4.3: only files in the selected locales reach the sidebar. */
export function filterFilesByLocale(
  files: readonly TranslationFile[],
  selected: readonly string[],
): TranslationFile[] {
  if (selected.length === 0) return [];
  return files.filter((file) => selected.some((locale) => sameLocale(locale, file.locale)));
}

/** plan.md 4.3 shows how many files the filter is hiding. */
export function hiddenFileCount(
  files: readonly TranslationFile[],
  selected: readonly string[],
): number {
  return files.length - filterFilesByLocale(files, selected).length;
}

/**
 * plan.md 4.3: Approve and Request changes apply to the whole pull request, so
 * the reviewer is warned when locales they never looked at are part of it.
 */
export function unreviewedLocales(
  detected: readonly LocaleSummary[],
  selected: readonly string[],
): string[] {
  return detected
    .map((entry) => entry.locale)
    .filter((locale) => !selected.some((candidate) => sameLocale(candidate, locale)));
}

/** Toggling one locale for the current pull request, without touching preferences. */
export function toggleLocale(selected: readonly string[], locale: string): string[] {
  const isSelected = selected.some((candidate) => sameLocale(candidate, locale));
  if (isSelected) return selected.filter((candidate) => !sameLocale(candidate, locale));
  return [...selected, locale];
}
