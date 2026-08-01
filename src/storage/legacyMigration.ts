/**
 * plan.md 5.3: the prototype persisted a GitHub token in plain text under
 * `locale-review-settings`. Any browser that ran it still holds that token, so
 * the app strips the field once on startup.
 *
 * The token value is never read into a variable, logged, or copied elsewhere —
 * the field is deleted in place, and the whole entry is removed if it cannot
 * be rewritten safely.
 */

export const LEGACY_SETTINGS_KEY = "locale-review-settings";
export const LEGACY_DRAFTS_KEY = "locale-review-drafts";

export function removeLegacyPrototypeToken(storage: Storage): void {
  let raw: string | null;
  try {
    raw = storage.getItem(LEGACY_SETTINGS_KEY);
  } catch {
    return;
  }
  if (raw === null) return;

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    // Unparseable prototype data may still contain the token as text, so the
    // entry goes rather than staying behind.
    removeKey(storage, LEGACY_SETTINGS_KEY);
    return;
  }

  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    removeKey(storage, LEGACY_SETTINGS_KEY);
    return;
  }

  const record = parsed as Record<string, unknown>;
  if (!("token" in record)) return;

  delete record.token;

  // Nothing but the token is worth preserving, and the remaining prototype
  // shape does not match the new schema, so drop the entry entirely.
  removeKey(storage, LEGACY_SETTINGS_KEY);
}

function removeKey(storage: Storage, key: string): void {
  try {
    storage.removeItem(key);
  } catch {
    // A storage that refuses deletion cannot be repaired from here.
  }
}

/** Runs every one-time cleanup the app needs before reading its own storage. */
export function runStorageMigrations(): void {
  let local: Storage;
  try {
    local = window.localStorage;
  } catch {
    return;
  }
  removeLegacyPrototypeToken(local);
  removeKey(local, LEGACY_DRAFTS_KEY);
}
