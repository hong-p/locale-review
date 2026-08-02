import { createContext, type ReactNode, useCallback, useContext, useMemo, useState } from "react";

import {
  DEFAULT_TRANSLATION_SETTINGS,
  normalizeSettings,
  type TranslationSettings,
  translationSettingsSlot,
} from "./translationSettings";

/**
 * The translation layout settings, shared by the settings form that writes them
 * and the review surface that reads them (plan.md 4.2, 5.3).
 *
 * plan.md 3.2 keeps app-level UI state in context rather than a store library,
 * and persistence in the storage module, so this holds neither logic of its own.
 */

type TranslationSettingsContextValue = {
  settings: TranslationSettings;
  /** Normalizes before storing, so a saved value is always usable as it is. */
  save: (next: TranslationSettings) => void;
  reset: () => void;
};

const TranslationSettingsContext = createContext<TranslationSettingsContextValue | null>(null);

export function TranslationSettingsProvider({ children }: { children: ReactNode }) {
  // Normalized on read as well: a value stored by an older build may be valid
  // and still be untidy, and the matcher should never see an untidy root.
  const [settings, setSettings] = useState<TranslationSettings>(() =>
    normalizeSettings(translationSettingsSlot.read()),
  );

  const save = useCallback((next: TranslationSettings) => {
    const normalized = normalizeSettings(next);
    setSettings(normalized);
    translationSettingsSlot.write(normalized);
  }, []);

  const reset = useCallback(() => {
    setSettings(DEFAULT_TRANSLATION_SETTINGS);
    // Cleared rather than written: an absent entry and the defaults mean the
    // same thing, and leaving one behind would pin today's defaults forever.
    translationSettingsSlot.clear();
  }, []);

  const value = useMemo(() => ({ settings, save, reset }), [settings, save, reset]);

  return (
    <TranslationSettingsContext.Provider value={value}>
      {children}
    </TranslationSettingsContext.Provider>
  );
}

export function useTranslationSettings(): TranslationSettingsContextValue {
  const value = useContext(TranslationSettingsContext);
  if (!value) {
    throw new Error("useTranslationSettings must be used inside a TranslationSettingsProvider");
  }
  return value;
}
