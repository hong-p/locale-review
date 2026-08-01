import { createStorageSlot } from "../../storage/safeStorage";

/**
 * Where the GitHub token lives (plan.md 5.2).
 *
 * `session` is the default: the token survives a reload in the same tab and
 * disappears when the tab session ends. `local` is only ever reached by the
 * user explicitly choosing "Remember token on this device".
 *
 * The token value is never logged, never placed in an error, and never written
 * anywhere but the chosen store. This module deliberately exposes no formatting
 * or inspection helper: plan.md 5.1 forbids inferring capability from a token's
 * shape, so nothing here should invite reading one.
 */

export type TokenStorageMode = "session" | "local";

const TOKEN_KEY = "locale-review.token";
const MODE_KEY = "locale-review.token-mode";
const SCHEMA_VERSION = 1;

const isNonEmptyString = (value: unknown): value is string =>
  typeof value === "string" && value.length > 0;

const isMode = (value: unknown): value is TokenStorageMode =>
  value === "session" || value === "local";

/**
 * The mode itself is remembered in localStorage. It is not the secret, and a
 * user who chose to be remembered expects that choice to survive the tab that
 * made it.
 */
const modeSlot = createStorageSlot<TokenStorageMode>({
  key: MODE_KEY,
  kind: "local",
  version: SCHEMA_VERSION,
  fallback: "session",
  parse: isMode,
});

const tokenSlots: Record<TokenStorageMode, ReturnType<typeof createStorageSlot<string>>> = {
  session: createStorageSlot<string>({
    key: TOKEN_KEY,
    kind: "session",
    version: SCHEMA_VERSION,
    fallback: "",
    parse: isNonEmptyString,
  }),
  local: createStorageSlot<string>({
    key: TOKEN_KEY,
    kind: "local",
    version: SCHEMA_VERSION,
    fallback: "",
    parse: isNonEmptyString,
  }),
};

const otherMode = (mode: TokenStorageMode): TokenStorageMode =>
  mode === "session" ? "local" : "session";

export function getTokenStorageMode(): TokenStorageMode {
  return modeSlot.read();
}

/**
 * Reads the token from the store the current mode names.
 *
 * The other store is not consulted as a fallback. A copy found there would mean
 * a previous clear failed, and silently using it would defeat the user's
 * choice.
 */
export function readToken(): string | null {
  const token = tokenSlots[getTokenStorageMode()].read();
  return token === "" ? null : token;
}

/**
 * Writes the token to the store for `mode` and removes any copy from the other
 * one.
 *
 * plan.md 5.2 requires that changing storage mode removes the previous copy. A
 * token left in localStorage after the user switched back to session-only would
 * outlive the tab they expected it to die with, so the removal happens on every
 * write rather than only on an observed mode change.
 */
export function writeToken(token: string, mode: TokenStorageMode = getTokenStorageMode()): void {
  const trimmed = token.trim();
  if (trimmed === "") {
    clearToken();
    return;
  }

  tokenSlots[otherMode(mode)].clear();
  tokenSlots[mode].write(trimmed);
  modeSlot.write(mode);
}

/**
 * Moves an already-stored token to a different store, which is what the
 * "Remember token on this device" checkbox does on its own.
 */
export function setTokenStorageMode(mode: TokenStorageMode): void {
  const existing = readToken();
  if (existing === null) {
    tokenSlots.session.clear();
    tokenSlots.local.clear();
    modeSlot.write(mode);
    return;
  }
  writeToken(existing, mode);
}

/**
 * Removes the token from BOTH stores regardless of the current mode, so a copy
 * stranded by an interrupted mode change cannot survive a clear (plan.md 5.2).
 * The mode preference itself is kept: it is a setting, not a secret.
 */
export function clearToken(): void {
  tokenSlots.session.clear();
  tokenSlots.local.clear();
}

export function hasToken(): boolean {
  return readToken() !== null;
}
