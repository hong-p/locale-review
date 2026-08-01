/**
 * Versioned, failure-tolerant wrappers over localStorage and sessionStorage.
 *
 * plan.md 3.8 requires that stored data carry a schema version and that
 * unreadable entries degrade to a safe default instead of breaking the app.
 * Every read here answers one question: can this value be trusted as `T`? If
 * not, the entry is dropped and the caller gets its fallback.
 */

export type StorageKind = "local" | "session";

/** A stored value is always wrapped, so the version travels with the data. */
type Envelope<T> = {
  version: number;
  value: T;
};

export type StorageSlot<T> = {
  read: () => T;
  write: (value: T) => void;
  clear: () => void;
};

export type StorageSlotOptions<T> = {
  key: string;
  kind: StorageKind;
  version: number;
  fallback: T;
  /** Narrows an unknown parsed value to `T`. Anything rejected is discarded. */
  parse: (value: unknown) => value is T;
  /**
   * Upgrades an envelope written by an older schema version. Return
   * `undefined` to discard rather than guess.
   */
  migrate?: (value: unknown, fromVersion: number) => unknown;
};

/**
 * Storage access throws in more situations than it is given credit for:
 * Safari private mode, disabled cookies, and cross-origin iframes all raise on
 * property access alone. Callers must never see those.
 */
function getStore(kind: StorageKind): Storage | null {
  try {
    return kind === "local" ? window.localStorage : window.sessionStorage;
  } catch {
    return null;
  }
}

function isEnvelope(value: unknown): value is Envelope<unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    "version" in value &&
    typeof (value as Envelope<unknown>).version === "number" &&
    "value" in value
  );
}

export function createStorageSlot<T>(options: StorageSlotOptions<T>): StorageSlot<T> {
  const { key, kind, version, fallback, parse, migrate } = options;

  const clear = (): void => {
    const store = getStore(kind);
    if (!store) return;
    try {
      store.removeItem(key);
    } catch {
      // A storage that cannot delete cannot be repaired from here.
    }
  };

  const read = (): T => {
    const store = getStore(kind);
    if (!store) return fallback;

    let raw: string | null;
    try {
      raw = store.getItem(key);
    } catch {
      return fallback;
    }
    if (raw === null) return fallback;

    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      // Corrupt JSON is unrecoverable, so drop it rather than leaving a value
      // that will fail again on every future read.
      clear();
      return fallback;
    }

    if (!isEnvelope(parsed)) {
      clear();
      return fallback;
    }

    let candidate: unknown = parsed.value;
    if (parsed.version !== version) {
      if (!migrate) {
        clear();
        return fallback;
      }
      candidate = migrate(parsed.value, parsed.version);
      if (candidate === undefined) {
        clear();
        return fallback;
      }
    }

    if (!parse(candidate)) {
      clear();
      return fallback;
    }

    // Persist the upgraded shape so the migration runs at most once.
    if (parsed.version !== version) write(candidate);
    return candidate;
  };

  const write = (value: T): void => {
    const store = getStore(kind);
    if (!store) return;
    const envelope: Envelope<T> = { version, value };
    try {
      store.setItem(key, JSON.stringify(envelope));
    } catch {
      // Quota exceeded or a read-only store. Losing a preference is
      // preferable to breaking the surface that tried to save it.
    }
  };

  return { read, write, clear };
}
