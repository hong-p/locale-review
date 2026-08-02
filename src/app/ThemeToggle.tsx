import { messages } from "../messages/en";
import styles from "./screens/StartScreen.module.css";
import { type ThemePreference, useTheme } from "../features/settings/theme";

const OPTIONS: ReadonlyArray<{ value: ThemePreference; label: string }> = [
  { value: "light", label: messages.settings.themeLight },
  { value: "dark", label: messages.settings.themeDark },
  { value: "system", label: messages.settings.themeSystem },
];

export function ThemeToggle() {
  const { preference, setPreference } = useTheme();

  return (
    <fieldset className={styles.themes}>
      <legend>{messages.settings.theme}</legend>
      {OPTIONS.map((option) => (
        <label key={option.value}>
          <input
            type="radio"
            name="theme"
            value={option.value}
            checked={preference === option.value}
            onChange={() => setPreference(option.value)}
          />
          {option.label}
        </label>
      ))}
    </fieldset>
  );
}
