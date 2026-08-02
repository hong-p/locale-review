import { type FormEvent, useId, useState } from "react";
import { Link } from "react-router";

import { useTranslationSettings } from "../../features/settings/TranslationSettingsContext";
import type { TranslationLayoutKind } from "../../features/settings/translationLayout";
import {
  DEFAULT_TRANSLATION_SETTINGS,
  formatExtensionList,
  formatLocaleList,
  LAYOUT_KINDS,
  layoutExamples,
  normalizeSettings,
  parseExtensionList,
  parseLocaleList,
  type TranslationSettings,
} from "../../features/settings/translationSettings";
import { messages } from "../../messages/en";
import { ROUTE_START } from "../routes";
import { ThemeToggle } from "../ThemeToggle";
import styles from "./SettingsScreen.module.css";

/**
 * plan.md 4.2, 4.3 and 7's settings screen.
 *
 * Its own route rather than a dialog, which is what plan.md 3.3 asks for: Back
 * returns to whatever was open, including a pull request, without the app
 * having to remember anything.
 *
 * The text fields hold what was typed, not what was parsed, so a half-written
 * extension list is never rewritten under the cursor. Parsing happens once, on
 * save, and the worked example below the form previews the result before then.
 */

type SettingsDraft = {
  layouts: TranslationLayoutKind[];
  contentRoot: string;
  extensions: string;
  sourceLocale: string;
  sourceHasSuffix: boolean;
  preferredLocales: string;
};

function toDraft(settings: TranslationSettings): SettingsDraft {
  return {
    layouts: settings.layouts,
    contentRoot: settings.contentRoot,
    extensions: formatExtensionList(settings.extensions),
    sourceLocale: settings.sourceLocale,
    sourceHasSuffix: settings.sourceHasSuffix,
    preferredLocales: formatLocaleList(settings.preferredLocales),
  };
}

function fromDraft(draft: SettingsDraft): TranslationSettings {
  return normalizeSettings({
    layouts: draft.layouts,
    contentRoot: draft.contentRoot,
    extensions: parseExtensionList(draft.extensions),
    sourceLocale: draft.sourceLocale,
    sourceHasSuffix: draft.sourceHasSuffix,
    preferredLocales: parseLocaleList(draft.preferredLocales),
  });
}

const LAYOUT_LABELS: Record<TranslationLayoutKind, string> = {
  "locale-directory": messages.settings.layoutLocaleDirectory,
  "filename-suffix": messages.settings.layoutFilenameSuffix,
};

export function SettingsScreen() {
  const { settings, save, reset } = useTranslationSettings();
  const [draft, setDraft] = useState<SettingsDraft>(() => toDraft(settings));
  const [status, setStatus] = useState<"saved" | "reset" | null>(null);
  const ids = useId();

  const update = (patch: Partial<SettingsDraft>) => {
    setDraft((current) => ({ ...current, ...patch }));
    // The old confirmation would otherwise describe settings that are no
    // longer on screen.
    setStatus(null);
  };

  const toggleLayout = (kind: TranslationLayoutKind, checked: boolean) => {
    const layouts = checked
      ? LAYOUT_KINDS.filter((entry) => entry === kind || draft.layouts.includes(entry))
      : draft.layouts.filter((entry) => entry !== kind);
    update({ layouts });
  };

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    const next = fromDraft(draft);
    save(next);
    // Reflect the cleaned-up values, so the reviewer sees what was stored
    // rather than what they typed.
    setDraft(toDraft(next));
    setStatus("saved");
  };

  const onReset = () => {
    reset();
    setDraft(toDraft(DEFAULT_TRANSLATION_SETTINGS));
    setStatus("reset");
  };

  // Previewed from the draft, so the example answers what the form currently
  // says rather than what was last saved.
  const examples = layoutExamples(fromDraft(draft));
  const suffixRelevant = draft.layouts.includes("filename-suffix");

  return (
    <main className={styles.page}>
      <header className={styles.masthead}>
        <div>
          <h1 className={styles.title}>{messages.settings.title}</h1>
          <p className={styles.intro}>{messages.settings.intro}</p>
        </div>
        <Link to={ROUTE_START}>{messages.errors.backToStart}</Link>
      </header>

      <form className={styles.card} onSubmit={onSubmit}>
        <h2 className={styles.cardTitle}>{messages.settings.layoutHeading}</h2>

        <fieldset className={styles.group}>
          <legend className={styles.label}>{messages.settings.layoutLegend}</legend>
          {LAYOUT_KINDS.map((kind) => {
            const checked = draft.layouts.includes(kind);
            return (
              <label key={kind} className={styles.check}>
                <input
                  type="checkbox"
                  checked={checked}
                  // Turning off the last layout would detect nothing at all, so
                  // the remaining one cannot be unchecked.
                  disabled={checked && draft.layouts.length === 1}
                  onChange={(event) => toggleLayout(kind, event.target.checked)}
                />
                {LAYOUT_LABELS[kind]}
              </label>
            );
          })}
          <p className={styles.hint}>{messages.settings.layoutHint}</p>
        </fieldset>

        <div className={styles.field}>
          <label className={styles.label} htmlFor={`${ids}-source`}>
            {messages.settings.sourceLocaleLabel}
          </label>
          <input
            id={`${ids}-source`}
            value={draft.sourceLocale}
            spellCheck={false}
            autoComplete="off"
            onChange={(event) => update({ sourceLocale: event.target.value })}
          />
          <p className={styles.hint}>{messages.settings.sourceLocaleHint}</p>
        </div>

        <div className={styles.field}>
          <label className={styles.label} htmlFor={`${ids}-root`}>
            {messages.settings.contentRootLabel}
          </label>
          <input
            id={`${ids}-root`}
            value={draft.contentRoot}
            spellCheck={false}
            autoComplete="off"
            placeholder={messages.settings.contentRootPlaceholder}
            onChange={(event) => update({ contentRoot: event.target.value })}
          />
          <p className={styles.hint}>{messages.settings.contentRootHint}</p>
        </div>

        <div className={styles.field}>
          <label className={styles.label} htmlFor={`${ids}-extensions`}>
            {messages.settings.extensionsLabel}
          </label>
          <input
            id={`${ids}-extensions`}
            value={draft.extensions}
            spellCheck={false}
            autoComplete="off"
            placeholder={messages.settings.extensionsPlaceholder}
            onChange={(event) => update({ extensions: event.target.value })}
          />
          <p className={styles.hint}>{messages.settings.extensionsHint}</p>
        </div>

        {/* Only shown while a filename-suffix layout is active: with locale
            directories alone the answer would change nothing. */}
        {suffixRelevant && (
          <div className={styles.field}>
            <label className={styles.check}>
              <input
                type="checkbox"
                checked={draft.sourceHasSuffix}
                onChange={(event) => update({ sourceHasSuffix: event.target.checked })}
              />
              {messages.settings.sourceSuffixLabel}
            </label>
            <p className={styles.hint}>{messages.settings.sourceSuffixHint}</p>
          </div>
        )}

        <div className={styles.field}>
          <label className={styles.label} htmlFor={`${ids}-preferred`}>
            {messages.settings.preferredLabel}
          </label>
          <input
            id={`${ids}-preferred`}
            value={draft.preferredLocales}
            spellCheck={false}
            autoComplete="off"
            placeholder={messages.settings.preferredPlaceholder}
            onChange={(event) => update({ preferredLocales: event.target.value })}
          />
          <p className={styles.hint}>{messages.settings.preferredHint}</p>
        </div>

        <section className={styles.example} aria-labelledby={`${ids}-example`}>
          <h3 id={`${ids}-example`} className={styles.label}>
            {messages.settings.exampleHeading}
          </h3>
          {examples.map((example) => (
            <p key={example.kind} className={styles.examplePath}>
              {example.sourcePath === null ? (
                messages.settings.exampleNone
              ) : (
                <>
                  <code>{example.targetPath}</code> → <code>{example.sourcePath}</code>
                </>
              )}
            </p>
          ))}
        </section>

        <div className={styles.actions}>
          <button type="submit" className={styles.submit}>
            {messages.settings.save}
          </button>
          <button type="button" onClick={onReset}>
            {messages.settings.reset}
          </button>
        </div>

        {status !== null && (
          <p role="status" className={styles.status}>
            {status === "saved" ? messages.settings.saved : messages.settings.resetDone}
          </p>
        )}
      </form>

      {/* No heading of its own: the toggle's legend already says Theme. */}
      <section className={styles.card}>
        <ThemeToggle />
      </section>
    </main>
  );
}
