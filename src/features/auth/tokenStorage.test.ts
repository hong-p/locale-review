import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  clearToken,
  getTokenStorageMode,
  hasToken,
  readToken,
  setTokenStorageMode,
  writeToken,
} from "./tokenStorage";

const TOKEN_KEY = "locale-review.token";

/** Reads the raw envelope so a test can prove which store actually holds it. */
const rawIn = (store: Storage): string | null => store.getItem(TOKEN_KEY);

beforeEach(() => {
  window.localStorage.clear();
  window.sessionStorage.clear();
  vi.restoreAllMocks();
});

describe("default mode", () => {
  it("is session, so a token dies with the tab unless the user opts out", () => {
    expect(getTokenStorageMode()).toBe("session");
  });

  it("writes to sessionStorage and leaves localStorage untouched", () => {
    writeToken("ghp_example");

    expect(rawIn(window.sessionStorage)).not.toBeNull();
    expect(rawIn(window.localStorage)).toBeNull();
    expect(readToken()).toBe("ghp_example");
  });
});

describe("remember on this device", () => {
  it("moves an existing token from session to local", () => {
    writeToken("ghp_example");
    setTokenStorageMode("local");

    expect(readToken()).toBe("ghp_example");
    expect(rawIn(window.localStorage)).not.toBeNull();
    expect(rawIn(window.sessionStorage)).toBeNull();
    expect(getTokenStorageMode()).toBe("local");
  });

  it("moves it back and removes the persistent copy", () => {
    writeToken("ghp_example", "local");
    setTokenStorageMode("session");

    expect(readToken()).toBe("ghp_example");
    expect(rawIn(window.sessionStorage)).not.toBeNull();
    // The whole point of switching back: nothing may survive the tab.
    expect(rawIn(window.localStorage)).toBeNull();
  });

  it("remembers the mode across a reload even before a token exists", () => {
    setTokenStorageMode("local");

    expect(getTokenStorageMode()).toBe("local");
    expect(readToken()).toBeNull();
  });
});

describe("a copy stranded in the other store", () => {
  it("is removed by the next write", () => {
    // Simulates a mode change interrupted before the old copy was cleared.
    writeToken("ghp_old", "local");
    window.sessionStorage.setItem(TOKEN_KEY, JSON.stringify({ version: 1, value: "ghp_stale" }));

    writeToken("ghp_new", "local");

    expect(rawIn(window.sessionStorage)).toBeNull();
    expect(readToken()).toBe("ghp_new");
  });

  it("is never used as a fallback when the active store is empty", () => {
    window.localStorage.setItem(TOKEN_KEY, JSON.stringify({ version: 1, value: "ghp_stale" }));

    // Mode is session, and session holds nothing.
    expect(readToken()).toBeNull();
    expect(hasToken()).toBe(false);
  });

  it("is removed by clear even though the mode names only one store", () => {
    writeToken("ghp_example", "local");
    window.sessionStorage.setItem(TOKEN_KEY, JSON.stringify({ version: 1, value: "ghp_stale" }));

    clearToken();

    expect(rawIn(window.localStorage)).toBeNull();
    expect(rawIn(window.sessionStorage)).toBeNull();
    expect(readToken()).toBeNull();
  });
});

describe("clear", () => {
  it("removes the token but keeps the mode preference", () => {
    writeToken("ghp_example", "local");
    clearToken();

    expect(readToken()).toBeNull();
    expect(hasToken()).toBe(false);
    expect(getTokenStorageMode()).toBe("local");
  });

  it("is safe to call when nothing is stored", () => {
    expect(() => clearToken()).not.toThrow();
    expect(readToken()).toBeNull();
  });
});

describe("input handling", () => {
  it("trims surrounding whitespace from a pasted token", () => {
    writeToken("  ghp_example\n");
    expect(readToken()).toBe("ghp_example");
  });

  it("treats an empty or whitespace-only value as a clear", () => {
    writeToken("ghp_example");
    writeToken("   ");

    expect(readToken()).toBeNull();
    expect(rawIn(window.sessionStorage)).toBeNull();
    expect(rawIn(window.localStorage)).toBeNull();
  });

  it("does not inspect or reformat the token itself", () => {
    // plan.md 5.1 forbids inferring anything from a token's shape, so a value
    // with no recognisable prefix must round-trip unchanged.
    const opaque = "not-a-recognisable-github-prefix-1234567890";
    writeToken(opaque);
    expect(readToken()).toBe(opaque);
  });
});

describe("hostile storage", () => {
  it("reports no token instead of throwing when reading is denied", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new DOMException("denied", "SecurityError");
    });

    expect(readToken()).toBeNull();
    expect(hasToken()).toBe(false);
  });

  it("does not throw when writing is denied", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("quota", "QuotaExceededError");
    });

    expect(() => writeToken("ghp_example")).not.toThrow();
  });

  it("discards a stored value that is not a usable token", () => {
    window.sessionStorage.setItem(TOKEN_KEY, JSON.stringify({ version: 1, value: 42 }));

    expect(readToken()).toBeNull();
    expect(rawIn(window.sessionStorage)).toBeNull();
  });

  it("discards a stored value written by an older schema version", () => {
    window.sessionStorage.setItem(TOKEN_KEY, JSON.stringify({ version: 0, value: "ghp_old" }));

    expect(readToken()).toBeNull();
  });
});
